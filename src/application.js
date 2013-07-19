/*
 * Copyright 2013 Meg Ford
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Library General Public
 * License as published by the Free Software Foundation; either
 * version 2 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Library General Public License for more details.
 *
 * You should have received a copy of the GNU Library General Public
 * License along with this library; if not, write to the
 * Free Software Foundation, Inc., 59 Temple Place - Suite 330,
 * Boston, MA 02111-1307, USA.
 *
 * Author: Meg Ford <megford@gnome.org>
 *
 */
 
imports.gi.versions.Gst = '1.0';

const _ = imports.gettext.gettext;
const Gio = imports.gi.Gio;
const Gst = imports.gi.Gst;
const Signals = imports.signals;

const AudioProfile = imports.audioProfile;
const FileUtil = imports.fileUtil;
const Listview = imports.listview;
const Play = imports.play;
const Record = imports.record;

let audioProfile = null;
let fileManager = null; // do I use this?
let fileUtil = null;
let list = null;
let offsetController = null;
let path = null;
let view = null;
let groupGrid;

const ActivePage = {
    RECORD: 'recorderPage',
    PLAY: 'playerPage',
    LISTVIEW: 'listviewPage'
};

const PipelineStates = {
    PLAYING: 0,
    PAUSED: 1,
    STOPPED: 2
}; 

const _TIME_DIVISOR = 60;
const _SEC_TIMEOUT = 100;

const Application = new Lang.Class({
    Name: 'Application',
    Extends: Gtk.ApplicationWindow,

    _init: function(params) {
        audioProfile = new AudioProfile.AudioProfile();
        this._buildFileName = new Record.BuildFileName()
        path = this._buildFileName.buildPath();
        this._buildFileName.ensureDirectory(path);
        offsetController = new FileUtil.OffsetController;
        fileUtil = new FileUtil.FileUtil();
        //fileUtil.buildPath();
        view = new MainView();
        
        params = Params.fill(params, { title: GLib.get_application_name(),
                                       default_width: 700,
                                       default_height: 480 });
        this.parent(params);

        let grid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                  halign: Gtk.Align.CENTER });
        let header = new Gtk.HeaderBar({ title: _(""),
                                         hexpand: true });

        this._recordPageButton = new Gtk.Button({ label: _("Recorder"),
                                                  hexpand: true });
        header.pack_start(this._recordPageButton);
        
        /*this._playPageButton = new Gtk.Button({ label: _("Player"),
                                                hexpand: true });
        header.pack_start(this._playPageButton);*/
        
        this._listviewPageButton = new Gtk.Button({ label: _("Player"),
                                                    hexpand: true });
        header.pack_start(this._listviewPageButton);
        
        grid.attach(header, 0, 0, 2, 2);

        grid.add(view);
        this._recordPageButton.connect('clicked', Lang.bind(this, 
            function() {
                view.visible_child_name = 'recorderPage'; 
            }));
       /* this._playPageButton.connect('clicked', Lang.bind(this, 
            function(){
                view.visible_child_name = 'playerPage'; 
            }));*/
        this._listviewPageButton.connect('clicked', Lang.bind(this, function(){
                view.visible_child_name = 'listviewPage';
                               //view.listboxcb(); 
            }));
            
        this._defineThemes();
                
        this.add(grid);
        grid.show_all();
    },
       
    _defineThemes : function() {
        let settings = Gtk.Settings.get_default();
        //settings.gtk_application_prefer_dark_theme = true;
    }
});

const MainView = new Lang.Class({
    Name: 'MainView',
    Extends: Gtk.Stack,

    _init: function(params) {
        params = Params.fill(params, { hexpand: true,
                                       vexpand: true,
                                       transition_type: Gtk.StackTransitionType.CROSSFADE,
                                       transition_duration: 100,
                                       visible: true });
        this.parent(params);

        let recorderPage = this._addRecorderPage('recorderPage');
            this.visible_child_name = 'listviewPage';
            
        let listviewPage = this._addListviewPage('listviewPage');
             this.visible_child_name = 'playerPage';
                
        let playerPage = this._addPlayerPage('playerPage');
            this.visible_child_name = 'recorderPage';
            //this.visible_child_name = 'listviewPage';
            
        this.labelID = null;
    },
    
    _addListviewPage: function(name) {
        list = new Listview.Listview();
        list.enumerateDirectory();
        initialPage = new Gtk.EventBox();
        let grid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                  halign: Gtk.Align.CENTER,
                                  valign: Gtk.Align.CENTER,
                                  row_spacing: 12,
                                  column_homogeneous: true });            
        grid.add(initialPage);
        this.add_named(grid, name);
        
        groupGrid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                       halign: Gtk.Align.CENTER,
                                       valign: Gtk.Align.CENTER,
                                       row_spacing: 12,
                                       column_homogeneous: true });  
        grid.add(groupGrid);

        //label.label = ("<b>%s</b>").format(this.labelName);
        this.label = new Gtk.Label({ label: "",
                                    halign: Gtk.Align.START,
                                    hexpand: true });
        groupGrid.add(this.label);              
    },

    _addRecorderPage: function(name) {
        this._record = new Record.Record(audioProfile);
        this.recordBox = new Gtk.EventBox();
        let recordGrid = new Gtk.Grid({ orientation: Gtk.Orientation.HORIZONTAL,
                                        halign: Gtk.Align.CENTER,
                                        valign: Gtk.Align.CENTER,
                                        column_homogeneous: true,
                                        column_spacing: 15 });
        this.recordBox.add(recordGrid);        

        let toolbarStart = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, 
                                         spacing: 0 });
        toolbarStart.get_style_context().add_class(Gtk.STYLE_CLASS_LINKED);
        recordGrid.attach(toolbarStart, 20, 0, 2, 1);
                
        this._comboBoxText = new EncoderComboBox();
        recordGrid.attach(this._comboBoxText, 20, 1, 3, 1);
        
        this.recordTimeLabel =  new Gtk.Label();
        recordGrid.attach(this.recordTimeLabel, 20, 2, 3, 1);
        
        this.recordVolume = new Gtk.VolumeButton();
        this.recordRange = Gtk.Adjustment.new(0.2, 0, 3.375, 0.05, 0.0, 0.0);
        this.recordVolume.set_adjustment(this.recordRange);
        this.recordVolume.connect ("value-changed", Lang.bind(this, this.setVolume));
        recordGrid.attach(this.recordVolume, 20, 4, 3, 1); 
        
        let recordButton = new RecordButton(this._record);       
        toolbarStart.pack_end(recordButton, false, true, 0);        
                
        let stopRecord = new Gtk.Button();
        this.stopRecImage = Gtk.Image.new_from_icon_name("media-playback-stop-symbolic", Gtk.IconSize.BUTTON);
        stopRecord.set_image(this.stopRecImage);
        stopRecord.connect("clicked", Lang.bind(this, this.onRecordStopClicked));
        toolbarStart.pack_end(stopRecord, true, true, 0);

        this.add_named(this.recordBox, name);
    },
    
    _addPlayerPage: function(name) {
        this._play = new Play.Play();
        this.playBox = new Gtk.EventBox();
        let playGrid = new Gtk.Grid({ orientation: Gtk.Orientation.HORIZONTAL,
                                      halign: Gtk.Align.CENTER,
                                      valign: Gtk.Align.CENTER,
                                      column_homogeneous: true,
                                      column_spacing: 15 });
        this.playBox.add(playGrid);        

        let playToolbar = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, 
                                        spacing: 0 });
        playToolbar.get_style_context().add_class(Gtk.STYLE_CLASS_LINKED);
        playGrid.attach(playToolbar, 20, 0, 2, 1);
        
        let loadButton = new LoadMoreButton(playGrid); 
        
        this.playTimeLabel =  new Gtk.Label();
        this.playTimeLabel.label = "0:00";
        playGrid.attach(this.playTimeLabel, 20, 1, 3, 1);
        
        this.playDurationLabel =  new Gtk.Label();
        this.playDurationLabel.label = "0:00";
        playGrid.attach(this.playDurationLabel, 20, 2, 3, 1);
        
        this.progressScale = new Gtk.Scale();
        this.progressScale.sensitive = false;
        
        this.progressScale.connect("button-press-event", Lang.bind(this,
            function() { 
                this._play.onProgressScaleConnect(); 
                             
                return false;
            }));
            
        this.progressScale.connect("button-release-event", Lang.bind(this,
            function() {
                this.setProgressScaleInsensitive(); 
                this.onProgressScaleChangeValue();
                this._updatePositionCallback();
                
                return false;
            }));
              
        playGrid.attach(this.progressScale, 20, 3, 3, 1);
        
        this.playVolume = new Gtk.VolumeButton();
        this.range = Gtk.Adjustment.new(0.5, 0, 3.375, 0.15, 0.0, 0.0);
        this.playVolume.set_adjustment(this.range);
        this.playVolume.connect ("value-changed", Lang.bind(this, this.setVolume));
        playGrid.attach(this.playVolume, 20, 4, 3, 1); 
              
        this.playButton = new PlayPauseButton(this._play);
        playToolbar.pack_end(this.playButton, false, true, 0);        
        
        let stopPlay = new Gtk.Button();
        this.stopImage = Gtk.Image.new_from_icon_name("media-playback-stop-symbolic", Gtk.IconSize.BUTTON);
        stopPlay.set_image(this.stopImage);
        stopPlay.connect("clicked", Lang.bind(this, this.onPlayStopClicked));
        playToolbar.pack_end(stopPlay, true, true, 0);

        this.add_named(this.playBox, name);
    },
    
    onPlayStopClicked: function() {
        this.playButton.set_active(false);
        this._play.stopPlaying();        
    },
    
    onRecordStopClicked: function() {
        this._record.stopRecording();
    },
    
    setVisibleID: function() {
        let activePage = this.get_visible_child_name();
        return activePage;
    },
    
    setLabel: function(time, duration) {
        this.time = time
        this.duration = duration; 
        this.playPipeState = this._play.getPipeStates();
        
        if (this.playPipeState != 2) {
            if (this.playDurationLabel.label == "0:00" && duration != 0) 
            this.durationString = this._formatTime(duration);
        } else {
            this.durationString = this._formatTime(duration);
        } 
        
        this.timeLabelString = this._formatTime(time);       
        
        
        if (this.setVisibleID() == ActivePage.RECORD ) {
            this.recordTimeLabel.label = this.timeLabelString;
        } else if (this.setVisibleID() == ActivePage.PLAY) {
            this.playTimeLabel.label = this.timeLabelString;
            
            if (this.playDurationLabel.label == "0:00" || this.playPipeState == 2) {
                this.playDurationLabel.label = this.durationString;
                this.setProgressScaleSensitive();
                this.progressScale.set_range(0.0, duration); 
            }                  
            this.progressScale.set_value(this.time);  
        }
    },
    
    setProgressScaleSensitive: function() {
        this.progressScale.sensitive = true;
    },
    
    setProgressScaleInsensitive: function() {
        this.progressScale.sensitive = false;
    },
    
    onProgressScaleChangeValue: function() {
        let seconds = Math.ceil(this.progressScale.get_value());
        
        this._play.progressScaleValueChanged(seconds);
        
        return true;
    },
     
    _formatTime: function(unformattedTime) {
        this.unformattedTime = unformattedTime;
        let seconds = Math.floor(this.unformattedTime);
        let minuteString = parseInt( seconds / _TIME_DIVISOR ) % _TIME_DIVISOR;
        let secondString = seconds % _TIME_DIVISOR;
        let timeString = minuteString + ":" + (secondString  < 10 ? "0" + secondString : secondString);
        
        return timeString;
    },

    _updatePositionCallback: function() {
        let position = this._play.queryPosition();
        log(position);
        log("position");
        
        if (position >= 0) {
            this.progressScale.set_value(position);
        }
        return true;
    },
    
    setVolume: function() { 
        let volumeValue;
        if (this.setVisibleID() == ActivePage.PLAY) {
            volumeValue = this.playVolume.get_value();
            this._play.setVolume(volumeValue);
        } else if (this.setVisibleID() == ActivePage.RECORD) {
            volumeValue = this.recordVolume.get_value();
            this._record.setVolume(volumeValue);
        } 
    },
    
    getVolume: function() {
        let volumeValue = this.playVolume.get_value();
        
        return volumeValue;
    },
    
    listBoxAdd: function() {
        this.groupGrid = groupGrid;
        this._scrolledWin = new Gtk.ScrolledWindow({ shadow_type: Gtk.ShadowType.IN,
                                                     margin_bottom: 3,
                                                     margin_top: 5,
                                                     hexpand: true,
                                                     vexpand: true,
                                                     width_request: 690,
                                                     height_request: 480 });
        this._scrolledWin.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC);
        this._scrolledWin.set_shadow_type(Gtk.ShadowType.IN);
        this.groupGrid.add(this._scrolledWin);
        this._scrolledWin.show();
        
        this.listBox = Gtk.ListBox.new();
        this._scrolledWin.add(this.listBox);
        this.listBox.set_selection_mode(Gtk.SelectionMode.SINGLE);
        this.listBox.set_header_func(null);
        this.listBox.set_activate_on_single_click(true);
        this.listBox.connect("row-selected", Lang.bind(this, this.rowGridCallback));
        this.listBox.show();
        
        this._startIdx = offsetController.getOffset();
        log(this._startIdx);
        log("start");
        this._endIdx = offsetController.getcidx();
        log(this._endIdx);
        this._files = [];
        this._files = list.getFilesInfoForList();
        
        for (let i = this._startIdx; i <= this._endIdx; i++) {
            //this.LBoxRow = Gtk.ListBoxRow.new(); 
            this.rowGrid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                          column_spacing: 6,
                                          row_spacing: 6,
                                          margin_left: 12,
                                          margin_right: 12 });
            this.rowGrid.set_orientation(Gtk.Orientation.HORIZONTAL);
            this.rowGrid.set_column_spacing(6);
            this.listBox.add(this.rowGrid);
            //this.LBoxRow.connect("row-selected", Lang.bind(this, this.rowGridCallback));
            this.rowGrid.show();
            
            this.fileName = new Gtk.Label({ label: this._files[i].fileName,
            12px
                                           halign: Gtk.Align.START });
                                           log(this._files[i].fileName);
            this.rowGrid.add(this.fileName);
            this.fileName.show();
        
            this._play = new Gtk.Button();
            this._play.image = Gtk.Image.new_from_icon_name("media-playback-start-symbolic", Gtk.IconSize.BUTTON);
            this.rowGrid.add(this._play);
            this.rowGrid.add(this._play);
            this.listBox.show();
            this.rowGrid.show();  
        }     
    },
    
    rowGridCallback: function() {
        //let menuForFile = Gtk.Overlay.new();
        let menu = new Gio.Menu();
        menu.append("New",'app.new');
       // menu.append("About", 'app.about');
        //menu.append("Quit",'app.quit');
       // menuForFile.add_overlay(menu);
        
        let newAction = new Gio.SimpleAction ({ name: 'new' });
        newAction.connect('activate', Lang.bind(this,
            function() {
                log("working!");//this._showNew();
            }));
        this.listBox.add_action(newAction);
        
    }
    

});

const RecordButton = new Lang.Class({
    Name: "RecordButton",
    Extends: Gtk.Button,
    
    _init: function(record, activeProfile) {
        this._record = record;
        this._activeProfile = activeProfile;
        this.recordImage = Gtk.Image.new_from_icon_name("media-record-symbolic", Gtk.IconSize.BUTTON);
        this.pauseImage = Gtk.Image.new_from_icon_name("media-playback-pause-symbolic", Gtk.IconSize.BUTTON);              
        this.parent();
        this.set_image(this.recordImage);
        this.connect("clicked", Lang.bind(this, this._onRecord));
    },
    
    _onRecord: function() {
        this._record.startRecording(); 
    }
});

const PlayPauseButton = new Lang.Class({
    Name: "PlayPauseButton",
    Extends: Gtk.ToggleButton,
    
    _init: function(play) {
        this._play = play;
        this.playImage = Gtk.Image.new_from_icon_name("media-playback-start-symbolic", Gtk.IconSize.BUTTON);
        this.pauseImage = Gtk.Image.new_from_icon_name("media-playback-pause-symbolic", Gtk.IconSize.BUTTON);              
        this.parent();
        this.set_image(this.playImage);
        this.connect("toggled", Lang.bind(this, this._onPlayPauseToggled));
    },
    
    _onPlayPauseToggled: function() {
        let activeState = this._play.getPipeStates();

        if (activeState != PipelineStates.PLAYING) {
            this.set_image(this.pauseImage);
            this._play.startPlaying();
        } else if (activeState == PipelineStates.PLAYING) {
            this.set_image(this.playImage);
            this._play.pausePlaying();         
        }  
    }
});

const EncoderComboBox = new Lang.Class({ 
    Name: "EncoderComboBox",
    Extends: Gtk.ComboBoxText, 
       
    // encoding setting labels in combobox
    _init: function() {
        this.parent();
        let combo = [_("Ogg Vorbis"), _("Ogg Opus"),  _("Flac"), _("Mp3"), _("AAC")];
        
        for (let i = 0; i < combo.length; i++)
            this.append_text(combo[i]);

        this.set_sensitive(true);
        this.connect("changed", Lang.bind(this, this._onComboBoxTextChanged)); 
    },
   
    _onComboBoxTextChanged: function() {        
        let activeProfile = this.get_active();
        audioProfile.assignProfile(activeProfile);
    }        
}); 

const LoadMoreButton = new Lang.Class({
    Name: 'LoadMoreButton',

    _init: function(playgr) {
        this._block = false;

        this._controller = offsetController;

        // Translators: "more" refers to recordings in this context
        this._label = new Gtk.Label({ label: _("Load More"),
                                      visible: true });
        playgr.add(this._label);

        this.widget = new Gtk.Button();
                                       
        this.widget.get_style_context().add_class('documents-load-more');
        playgr.add(this.widget);
        
        this.widget.connect('clicked', Lang.bind(this,
            function() {
                this._label.label = _("Loading…");

                this._controller.increaseOffset();
                list._setDiscover();
            }));
    }
}); 

            
    
