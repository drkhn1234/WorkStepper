// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {isWorkspaceEmpty} from './workspaceActions.js';

// This observes every workspace switch, independently of the shortcuts.
export class EmptyWorkspaceView {
    constructor(settings) {
        this._settings = settings;
        this._pending = 0;
        this._shown = 0;
        this._creationKind = null;
        this._currentWorkspace = global.workspace_manager.get_active_workspace();
        this._workspaceChanged = global.workspace_manager.connect(
            'active-workspace-changed', () => this._onWorkspaceChanged());
    }

    destroy() {
        global.workspace_manager.disconnect(this._workspaceChanged);
        this._cancelPending();
        this._settings = null;
        this._currentWorkspace = null;
    }

    runCreationAction(moveWindow, callback) {
        this._creationKind = moveWindow ? 'window-creation-view' : 'creation-view';
        try {
            return callback();
        } finally {
            this._creationKind = null;
        }
    }

    _cancelPending() {
        if (this._pending) {
            GLib.source_remove(this._pending);
            this._pending = 0;
        }
        if (this._shown) {
            Main.overview.disconnect(this._shown);
            this._shown = 0;
        }
    }

    _onWorkspaceChanged() {
        const target = global.workspace_manager.get_active_workspace();
        // Reordering or removing another workspace can change the active
        // index without actually entering a different workspace.
        if (target === this._currentWorkspace)
            return;
        this._currentWorkspace = target;
        this._cancelPending();

        const viewKey = this._creationKind ?? 'empty-workspace-view';
        const requiresEmpty = viewKey !== 'window-creation-view';

        if (!Main.sessionMode.hasWorkspaces || Main.actionMode !== Shell.ActionMode.NORMAL ||
            Main.overview.visible || Main.overview.visibleTarget ||
            this._settings.get_string(viewKey) === 'none' ||
            (requiresEmpty && !isWorkspaceEmpty(target)))
            return;

        // The desktop slide owns a modal grab. Wait for it to finish before
        // opening overview, which needs its own grab. Recheck the destination
        // so a rapid second switch or an arriving window cancels the opening.
        const deadline = GLib.get_monotonic_time() + 5 * GLib.USEC_PER_SEC;
        this._pending = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
            const view = this._settings.get_string(viewKey);
            if (global.workspace_manager.get_active_workspace() !== target ||
                Main.overview.visible || Main.overview.visibleTarget ||
                !Main.sessionMode.hasWorkspaces || Main.actionMode !== Shell.ActionMode.NORMAL ||
                view === 'none' || (requiresEmpty && !isWorkspaceEmpty(target)) ||
                GLib.get_monotonic_time() >= deadline) {
                this._pending = 0;
                return GLib.SOURCE_REMOVE;
            }
            if (Main.wm._switchInProgress)
                return GLib.SOURCE_CONTINUE;

            this._pending = 0;
            if (!global.display.is_grabbed())
                this._openView(view);
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._pending, '[WorkStepper] open empty workspace view');
    }

    _openView(view) {
        Main.overview.searchEntry.set_text('');
        if (view === 'app-grid') {
            Main.overview.showApps();
        } else {
            this._shown = Main.overview.connect('shown', () => {
                Main.overview.disconnect(this._shown);
                this._shown = 0;
                if (Main.overview.visibleTarget)
                    Main.overview.searchEntry.grab_key_focus();
            });
            Main.overview.focusSearch();
        }
    }
}
