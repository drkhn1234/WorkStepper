// SPDX-License-Identifier: GPL-3.0-or-later
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {stepWorkspace, edgeWorkspace} from './workspaceActions.js';
import {migrateViewSettings} from './settings.js';
import {EmptyWorkspaceView} from './emptyWorkspaceView.js';
import {PressGesture} from './pressGesture.js';
import {WorkspaceCloser} from './workspaceCloser.js';
import {SHORTCUT_KEYS, readShortcutValues, effectiveShortcuts} from './shortcuts.js';

const BINDINGS = [
    ['workspace-step-left', -1, false],
    ['workspace-step-right', 1, false],
    ['effective-window-left', -1, true],
    ['effective-window-right', 1, true],
    ['workspace-step-close', 0, false],
];

export default class WorkStepper extends Extension {
    enable() {
        this._settings = this.getSettings();
        migrateViewSettings(this._settings);
        this._emptyWorkspaceView = new EmptyWorkspaceView(this._settings);
        this._closer = new WorkspaceCloser(global.workspace_manager);
        this._pressGesture = new PressGesture({
            schedule: (duration, callback) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, duration, () => {
                callback();
                return GLib.SOURCE_REMOVE;
            }),
            cancel: id => GLib.source_remove(id),
        }, action => this._runAction(action, false), action => this._runAction(action, true));

        // Release-trigger keybindings handle the main key normally. A capture
        // controller also handles releasing Super/Shift first, so a hold can
        // never fire later after the user has already let go of the chord.
        this._keyController = new Clutter.KeyController();
        this._keyController.connect('key-release', controller => {
            const [, symbol, code] = controller.get_key();
            if ([Clutter.KEY_Super_L, Clutter.KEY_Super_R,
                Clutter.KEY_Shift_L, Clutter.KEY_Shift_R, Clutter.KEY_Control_L,
                Clutter.KEY_Control_R, Clutter.KEY_Alt_L, Clutter.KEY_Alt_R,
                Clutter.KEY_Meta_L, Clutter.KEY_Meta_R, Clutter.KEY_Hyper_L,
                Clutter.KEY_Hyper_R].includes(symbol))
                this._pressGesture.finish();
            else
                this._pressGesture.release(code);
            return Clutter.EVENT_PROPAGATE;
        });
        global.stage.add_action_full('workspace-step-release', Clutter.EventPhase.CAPTURE, this._keyController);
        this._workspaceChanged = global.workspace_manager.connect('active-workspace-changed', () => {
            if (this._pressedWorkspace !== global.workspace_manager.get_active_workspace())
                this._pressGesture.cancel();
        });
        this._sessionChanged = Main.sessionMode.connect('updated', () => this._pressGesture.cancel());
        this._bindings = [];
        this._syncShortcuts();
        this._shortcutChanged = this._settings.connect('changed', (_settings, key) => {
            if (SHORTCUT_KEYS.includes(key) || key === 'window-modifier') {
                this._pressGesture.cancel();
                this._syncShortcuts();
            }
        });

        for (const [name, direction, moveWindow] of BINDINGS) {
            const action = Main.wm.addKeybinding(
                name,
                this._settings,
                Meta.KeyBindingFlags.IGNORE_AUTOREPEAT | Meta.KeyBindingFlags.TRIGGER_RELEASE,
                moveWindow
                    ? Shell.ActionMode.NORMAL
                    : Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                () => this._onShortcut(direction, moveWindow));

            if (action === Meta.KeyBindingAction.NONE) {
                console.warn(`[${this.uuid}] Could not register ${name}`);
            } else {
                this._bindings.push(name);
            }
        }
    }

    disable() {
        if (this._shortcutChanged) {
            this._settings?.disconnect(this._shortcutChanged);
            this._shortcutChanged = 0;
        }
        this._pressGesture?.cancel();
        if (this._keyController)
            global.stage.remove_action(this._keyController);
        if (this._workspaceChanged) {
            global.workspace_manager.disconnect(this._workspaceChanged);
            this._workspaceChanged = 0;
        }
        if (this._sessionChanged) {
            Main.sessionMode.disconnect(this._sessionChanged);
            this._sessionChanged = 0;
        }
        this._closer?.destroy();
        this._closer = null;
        this._keyController = null;
        this._pressGesture = null;
        this._emptyWorkspaceView?.destroy();
        this._emptyWorkspaceView = null;
        for (const name of this._bindings ?? [])
            Main.wm.removeKeybinding(name);
        this._bindings = null;
        this._settings = null;
    }

    _syncShortcuts() {
        const shortcuts = effectiveShortcuts(readShortcutValues(this._settings),
            this._settings.get_string('window-modifier'));
        for (const side of ['left', 'right']) {
            const key = `effective-window-${side}`;
            const value = shortcuts[`workspace-step-window-${side}`];
            if (JSON.stringify(this._settings.get_strv(key)) !== JSON.stringify(value))
                this._settings.set_strv(key, value);
        }
    }

    _onShortcut(direction, moveWindow) {
        const event = Clutter.get_current_event();
        if (!event)
            return;
        if (event.type() === Clutter.EventType.KEY_RELEASE) {
            this._pressGesture.release(event.get_key_code());
        } else if (event.type() === Clutter.EventType.KEY_PRESS) {
            this._pressedWorkspace = global.workspace_manager.get_active_workspace();
            this._pressGesture.press(event.get_key_code(), {direction, moveWindow},
                this._settings.get_uint('long-press-duration'));
        }
    }

    _runAction({direction, moveWindow}, longPress) {
        if (!Main.sessionMode.hasWorkspaces)
            return;
        if (direction === 0) {
            this._closer.close(global.workspace_manager.get_active_workspace(),
                longPress, global.get_current_time());
        } else {
            this._step(direction, moveWindow, longPress);
        }
    }

    _step(direction, moveWindow, longPress = false) {
        if (!Main.sessionMode.hasWorkspaces)
            return;

        let window = null;
        if (moveWindow) {
            window = global.display.focus_window;
            if (!window)
                return;

            // Moving the parent also carries attached dialogs along.
            while (window.get_transient_for())
                window = window.get_transient_for();

            if (window.is_override_redirect() ||
                window.get_window_type() === Meta.WindowType.DESKTOP ||
                window.get_window_type() === Meta.WindowType.DOCK)
                return;

            // Windows on secondary monitors can be visible on all workspaces
            // when GNOME's "Workspaces on primary display only" is enabled.
            // Bring the requested window onto the primary workspace monitor.
            if (Meta.prefs_get_workspaces_only_on_primary() &&
                window.get_monitor() !== Main.layoutManager.primaryIndex)
                window.move_to_monitor(Main.layoutManager.primaryIndex);
        }

        return this._emptyWorkspaceView.runCreationAction(moveWindow, () =>
            (longPress ? edgeWorkspace : stepWorkspace)(
                global.workspace_manager, direction, global.get_current_time(), window));
    }
}
