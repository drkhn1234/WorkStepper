// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import {isWorkspaceEmpty, removeWorkspace} from './workspaceActions.js';

export class WorkspaceCloser {
    constructor(manager) {
        this._manager = manager;
        this._pending = new Map();
        this._removed = manager.connect('workspace-removed', () => {
            for (const workspace of this._pending.keys()) {
                if (workspace.index() < 0)
                    this._cancel(workspace);
            }
        });
    }

    close(workspace, closeWindows, timestamp) {
        if (!closeWindows)
            return removeWorkspace(this._manager, workspace, timestamp);

        // Request normal window closes, never application-wide Quit or kill:
        // other workspaces' windows remain open and unsaved prompts are honored.
        const windows = workspace.list_windows().filter(window =>
            !window.is_on_all_workspaces() && !window.is_override_redirect());
        if (!this._pending.has(workspace)) {
            const request = {idle: 0, signals: []};
            this._pending.set(workspace, request);
            request.signals.push(workspace.connect('window-removed', () => this._queueCheck(workspace)));
            request.signals.push(workspace.connect('window-added', () => this._queueCheck(workspace)));
        }
        for (const window of windows) {
            // Parents carry attached dialogs; do not separately dismiss a
            // dialog that may be asking whether to save changes.
            const parent = window.get_transient_for();
            if ((!parent || !windows.includes(parent)) && window.can_close())
                window.delete(timestamp);
        }
        this._queueCheck(workspace);
        return true;
    }

    _queueCheck(workspace) {
        const request = this._pending.get(workspace);
        if (!request || request.idle)
            return;
        request.idle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            request.idle = 0;
            if (workspace.index() < 0) {
                this._cancel(workspace);
            } else if (isWorkspaceEmpty(workspace)) {
                this._cancel(workspace);
                removeWorkspace(this._manager, workspace, global.get_current_time());
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancel(workspace) {
        const request = this._pending.get(workspace);
        if (!request)
            return;
        if (request.idle)
            GLib.source_remove(request.idle);
        for (const signal of request.signals)
            workspace.disconnect(signal);
        this._pending.delete(workspace);
    }

    destroy() {
        this._manager.disconnect(this._removed);
        for (const workspace of this._pending.keys())
            this._cancel(workspace);
    }
}
