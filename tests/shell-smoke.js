// This entry point replaces extension.js ONLY inside an isolated test session.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import WorkStepper from './workspaceStep.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const delay = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve();
    return GLib.SOURCE_REMOVE;
}));

export default class Smoke extends WorkStepper {
    enable() {
        super.enable();
        this._run().catch(error => this._finish(`FAIL: ${error.message}\n${error.stack}`));
    }

    _assert(condition, message) {
        if (!condition)
            throw new Error(message);
        this._results.push(`PASS: ${message}`);
    }

    _finish(result) {
        const output = [...(this._results ?? []), result].join('\n');
        GLib.file_set_contents(GLib.getenv('WORKSPACE_STEP_RESULT'), output);
        this._client?.force_exit();
        global.context.terminate();
    }

    async _run() {
        this._results = [];
        while (Main.layoutManager._startingUp)
            await delay(100);
        await delay(1000);
        Main.overview.hide();
        await delay(500);

        this._assert(this._bindings.length === 5, 'all five shortcuts registered');
        const partial = new WorkStepper(this.metadata);
        partial.disable();
        partial.disable();
        this._assert(partial._settings === null,
            'cleanup is safe after a failed or partial enable');
        if (GLib.getenv('WORKSPACE_STEP_KEYBOARD_ONLY') === '--prefs-only') {
            await this._testPreferences();
            this._finish('ALL SHELL SMOKE TESTS PASSED');
            return;
        }

        const mutter = new Gio.Settings({schema_id: 'org.gnome.mutter'});
        mutter.set_boolean('dynamic-workspaces', false);
        this._settings.set_string('empty-workspace-view', 'none');
        this._settings.set_string('creation-view', 'none');
        this._settings.set_string('window-creation-view', 'none');
        const manager = global.workspace_manager;
        const timestamp = () => global.get_current_time();
        const first = manager.get_workspace_by_index(0);
        first.activate(timestamp());
        await delay(300);

        this._client = Gio.Subprocess.new(
            ['python3', GLib.getenv('WORKSPACE_STEP_FIXTURE')], Gio.SubprocessFlags.NONE);
        let windows = [];
        for (let attempt = 0; attempt < 50; attempt++) {
            windows = global.get_window_actors().map(actor => actor.get_meta_window())
                .filter(window => window.get_title()?.startsWith('WorkStepper Test'));
            if (windows.length === 2)
                break;
            await delay(100);
        }
        this._assert(windows.length === 2, 'two real Wayland windows opened');
        const [a, b] = windows;
        a.change_workspace(first);
        b.change_workspace(first);
        first.activate_with_focus(a, timestamp());
        await delay(300);

        if (GLib.getenv('WORKSPACE_STEP_KEYBOARD_ONLY') === '--keyboard-only') {
            await this._testKeyboard(a, b, mutter);
            this._finish('ALL SHELL SMOKE TESTS PASSED');
            return;
        }

        let count = manager.n_workspaces;
        this._step(1, false);
        const right = manager.get_active_workspace();
        this._assert(right.index() === 1 && manager.n_workspaces === count,
            'switch right reused adjacent empty workspace');
        await delay(350);
        first.activate_with_focus(a, timestamp());
        await delay(350);
        this._step(-1, false);
        const left = manager.get_active_workspace();
        this._assert(left.index() === 0 && first.index() === 1 && manager.n_workspaces === count + 1,
            'switch left inserted at boundary');
        await delay(350);

        // Both neighbors occupied: insert without changing their memberships.
        b.change_workspace(right);
        first.activate_with_focus(a, timestamp());
        await delay(350);
        count = manager.n_workspaces;
        this._step(1, false);
        const insertedRight = manager.get_active_workspace();
        this._assert(insertedRight.index() === first.index() + 1 &&
            right.index() === insertedRight.index() + 1 && manager.n_workspaces === count + 1,
        'switch right inserted before occupied neighbor');
        this._assert(a.get_workspace() === first && b.get_workspace() === right,
            'insertion preserved existing windows and workspace membership');
        await delay(350);

        first.activate_with_focus(a, timestamp());
        await delay(350);
        count = manager.n_workspaces;
        this._step(1, true);
        this._assert(a.get_workspace() === insertedRight && manager.get_active_workspace() === insertedRight &&
            manager.n_workspaces === count, 'move right reused empty neighbor and followed window');
        await delay(350);

        // Move towards occupied right neighbor creates another workspace.
        insertedRight.activate_with_focus(a, timestamp());
        await delay(350);
        count = manager.n_workspaces;
        this._step(1, true);
        const moved = manager.get_active_workspace();
        this._assert(a.get_workspace() === moved && moved.index() + 1 === right.index() &&
            manager.n_workspaces === count + 1, 'move right inserted before occupied neighbor and followed window');
        await delay(350);

        // Move left to an empty neighbor.
        moved.activate_with_focus(a, timestamp());
        await delay(350);
        count = manager.n_workspaces;
        this._step(-1, true);
        this._assert(a.get_workspace() === insertedRight && manager.get_active_workspace() === insertedRight &&
            manager.n_workspaces === count, 'move left reused empty neighbor and followed window');
        await delay(350);

        // Fill the left neighbor to exercise moving left via insertion too.
        b.change_workspace(first);
        insertedRight.activate_with_focus(a, timestamp());
        await delay(350);
        count = manager.n_workspaces;
        this._step(-1, true);
        this._assert(a.get_workspace() === manager.get_active_workspace() &&
            manager.get_active_workspace().index() === first.index() + 1 &&
            manager.n_workspaces === count + 1, 'move left inserted after occupied neighbor');
        await delay(350);

        // Put both real windows on one workspace so every other one is empty.
        const occupied = manager.get_workspace_by_index(0);
        a.change_workspace(occupied);
        b.change_workspace(occupied);
        occupied.activate_with_focus(a, timestamp());
        await delay(400);
        const empty = manager.get_workspace_by_index(1);

        this._settings.set_string('empty-workspace-view', 'overview');
        empty.activate(timestamp());
        this._assert(this._emptyWorkspaceView._pending !== 0,
            'ordinary desktop workspace activation schedules opening independently of shortcuts');
        await delay(850);
        this._assert(Main.overview.visible && Main.overview.searchEntry.clutter_text.has_key_focus() &&
            manager.get_active_workspace() === empty,
        'entering empty workspace from desktop opens and focuses overview after switching');

        // Switching in overview must preserve both its view and existing query.
        Main.overview.searchEntry.set_text('keep this query');
        this._settings.set_string('empty-workspace-view', 'app-grid');
        occupied.activate(timestamp());
        await delay(350);
        empty.activate(timestamp());
        await delay(500);
        this._assert(Main.overview.visible && !Main.overview.dash.showAppsButton.checked &&
            Main.overview.searchEntry.get_text() === 'keep this query',
        'workspace navigation within overview preserves view and search query');

        Main.overview.hide();
        await delay(450);
        occupied.activate_with_focus(a, timestamp());
        await delay(400);
        this._assert(!Main.overview.visible, 'entering occupied workspace from desktop opens nothing');
        empty.activate(timestamp());
        await delay(850);
        this._assert(Main.overview.visible && Main.overview.dash.showAppsButton.checked &&
            manager.get_active_workspace() === empty,
        'App Grid choice opens after ordinary desktop switch to empty workspace');

        this._settings.set_string('empty-workspace-view', 'overview');
        occupied.activate(timestamp());
        await delay(350);
        empty.activate(timestamp());
        await delay(500);
        this._assert(Main.overview.visible && Main.overview.dash.showAppsButton.checked,
            'workspace navigation within app grid preserves app grid despite Overview setting');

        this._settings.set_string('empty-workspace-view', 'none');
        this._settings.set_string('creation-view', 'none');
        this._settings.set_string('window-creation-view', 'none');
        this._step(1, false);
        await delay(500);
        this._assert(Main.overview.visible && Main.overview.dash.showAppsButton.checked,
            'None disables automatic opening without closing an existing app grid');
        Main.overview.hide();
        await delay(450);
        occupied.activate_with_focus(a, timestamp());
        await delay(400);
        empty.activate(timestamp());
        await delay(650);
        this._assert(!Main.overview.visible, 'None leaves desktop visible on empty destination');

        this._settings.set_string('empty-workspace-view', 'overview');
        occupied.activate_with_focus(a, timestamp());
        await delay(400);
        this._settings.set_string('creation-view', 'overview');
        const reused = this._step(1, false);
        await delay(850);
        this._assert(!reused.created && Main.overview.visible &&
            manager.get_active_workspace() === reused.workspace,
        'shortcut reusing an empty neighbor triggers the independent empty-workspace behavior');
        Main.overview.hide();
        await delay(450);
        occupied.activate_with_focus(a, timestamp());
        await delay(400);
        const created = this._step(-1, false);
        await delay(850);
        this._assert(created.created && Main.overview.visible &&
            manager.get_active_workspace() === created.workspace,
        'shortcut creating an empty workspace triggers the same independent behavior');

        Main.overview.hide();
        await delay(450);
        occupied.activate_with_focus(a, timestamp());
        await delay(400);
        const movedWindow = this._step(1, true);
        await delay(850);
        this._assert(a.get_workspace() === movedWindow.workspace && !Main.overview.visible,
            'moving a window along makes the destination occupied and does not open a view');

        occupied.activate_with_focus(b, timestamp());
        await delay(400);
        empty.activate(timestamp());
        b.change_workspace(empty);
        await delay(800);
        this._assert(!Main.overview.visible,
            'window arriving before the view opens cancels empty-workspace opening');

        // A second switch supersedes the first pending opening.
        a.change_workspace(occupied);
        occupied.activate_with_focus(a, timestamp());
        await delay(400);
        const rapidTarget = manager.append_new_workspace(false, timestamp());
        rapidTarget.activate(timestamp());
        occupied.activate(timestamp());
        await delay(800);
        this._assert(!Main.overview.visible && manager.get_active_workspace() === occupied,
            'rapid switch back to occupied workspace cancels pending opening');

        // Reindexing the active workspace is not entering a workspace.
        const reindexTarget = manager.append_new_workspace(false, timestamp());
        this._settings.set_string('empty-workspace-view', 'none');
        this._settings.set_string('creation-view', 'none');
        this._settings.set_string('window-creation-view', 'none');
        reindexTarget.activate(timestamp());
        await delay(400);
        this._settings.set_string('empty-workspace-view', 'overview');
        manager.reorder_workspace(reindexTarget, 0);
        await delay(600);
        this._assert(manager.get_active_workspace() === reindexTarget && !Main.overview.visible,
            'reordering the active empty workspace does not trigger opening');

        // Dynamic cleanup must preserve the selected destination.
        occupied.activate(timestamp());
        await delay(400);
        mutter.set_boolean('dynamic-workspaces', true);
        await delay(600);
        this._settings.set_string('creation-view', 'overview');
        const dynamic = this._step(-1, false);
        await delay(1100);
        this._assert(manager.get_active_workspace() === dynamic.workspace && Main.overview.visible,
            'dynamic workspace cleanup preserves empty destination and overview');

        Main.overview.hide();
        await delay(450);
        occupied.activate(timestamp());
        await delay(400);
        const pendingTarget = manager.append_new_workspace(false, timestamp());
        pendingTarget.activate(timestamp());
        const observer = this._emptyWorkspaceView;
        super.disable();
        await delay(800);
        this._assert(!Main.overview.visible && observer._pending === 0 && observer._shown === 0 &&
            this._settings === null && this._emptyWorkspaceView === null,
        'disable disconnects observer and cancels pending opening');
        super.enable();
        this._assert(this._bindings.length === 5, 'extension re-enables all shortcuts');

        await this._testOpeningChoices(a, b, mutter);
        await this._testPreferences();
        await this._testEndpoints(a, b, mutter);
        if (GLib.getenv('WORKSPACE_STEP_TEST_BAR') === '1')
            await this._testBarInsertion(a, b, mutter);
        await this._testKeyboard(a, b, mutter);
        this._finish('ALL SHELL SMOKE TESTS PASSED');
    }

    async _testPreferences() {
        const prefs = Gio.Subprocess.new(['gjs', '-m',
            GLib.getenv('WORKSPACE_STEP_PREFS_TEST'), this.path],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');
        const [stdout, stderr] = await prefs.communicate_utf8_async(null, null);
        this._assert(prefs.get_successful() && stdout.includes('PREFS SMOKE PASSED'),
            `preferences rendered with modifier, three opening choices, and editable shortcuts: ${stderr.trim()}`);
    }

    async _testKeyboard(a, b, mutter) {
        const runAction = this._runAction.bind(this);
        this._runAction = (action, longPress) => {
            this._lastAction = {...action, longPress};
            return runAction(action, longPress);
        };
        this._settings.set_string('empty-workspace-view', 'none');
        this._settings.set_string('creation-view', 'none');
        this._settings.set_string('window-creation-view', 'none');
        this._settings.set_uint('long-press-duration', 300);
        Main.overview.hide();
        await delay(450);
        mutter.set_boolean('dynamic-workspaces', false);
        // Mutter restores the saved fixed workspace count on a later turn.
        await delay(400);
        const manager = global.workspace_manager;
        const timestamp = () => global.get_current_time();
        while (manager.n_workspaces < 4)
            manager.append_new_workspace(false, timestamp());
        const first = manager.get_workspace_by_index(0);
        const middle = manager.get_workspace_by_index(1);
        const last = manager.get_workspace_by_index(manager.n_workspaces - 1);
        a.change_workspace(middle);
        b.change_workspace(last);
        middle.activate_with_focus(a, timestamp());
        await delay(400);

        const keyboard = global.stage.context.get_backend().get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        const down = key => keyboard.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.PRESSED);
        const up = key => keyboard.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.RELEASED);
        const chord = async (key, hold = false, shift = false, modifierFirst = false, control = false) => {
            down(Clutter.KEY_Super_L);
            if (shift)
                down(Clutter.KEY_Shift_L);
            if (control)
                down(Clutter.KEY_Control_L);
            down(key);
            await delay(hold ? 470 : 60);
            if (modifierFirst) {
                up(Clutter.KEY_Super_L);
                await delay(400); // Longer than the hold threshold, main key still down.
            }
            up(key);
            if (shift)
                up(Clutter.KEY_Shift_L);
            if (control)
                up(Clutter.KEY_Control_L);
            if (!modifierFirst)
                up(Clutter.KEY_Super_L);
            await delay(450);
        };

        const count = manager.n_workspaces;
        down(Clutter.KEY_Super_L);
        down(Clutter.KEY_Return);
        await delay(60);
        this._assert(manager.get_active_workspace() === middle && manager.n_workspaces === count,
            'real shortcut press defers tap until release');
        up(Clutter.KEY_Return);
        up(Clutter.KEY_Super_L);
        await delay(450);
        this._assert(manager.get_active_workspace() !== middle && manager.n_workspaces === count,
            'real Super+Enter release runs the short action once');

        middle.activate_with_focus(a, timestamp());
        await delay(400);
        await chord(Clutter.KEY_Return, true);
        const farRight = manager.get_active_workspace();
        this._assert(farRight !== last && farRight.index() === manager.n_workspaces - 1 &&
            manager.n_workspaces === count + 1 && b.get_workspace() === last,
        'real Enter hold inserts beyond occupied last workspace');
        await chord(Clutter.KEY_BackSpace, true);
        this._assert(manager.get_active_workspace() === first && manager.n_workspaces === count + 1,
            'real Backspace hold reuses empty first workspace without a tap');

        middle.activate_with_focus(a, timestamp());
        await delay(400);
        await chord(Clutter.KEY_Return, true, true);
        this._assert(a.get_workspace() === farRight && manager.get_active_workspace() === farRight &&
            manager.n_workspaces === count + 1,
            'real Shift+Enter hold reuses empty far-right workspace and carries focused window');
        farRight.activate_with_focus(a, timestamp());
        await delay(400);
        await chord(Clutter.KEY_BackSpace, true, true);
        this._assert(a.get_workspace() === first && manager.get_active_workspace() === first,
            'real Shift+Backspace hold reuses empty far-left workspace and carries focused window');

        middle.activate(timestamp());
        await delay(400);
        await chord(Clutter.KEY_Return, false, false, true);
        this._assert(manager.get_active_workspace() === manager.get_workspace_by_index(2),
            'releasing Super first still runs only the tap action');
        await delay(400);
        this._assert(manager.get_active_workspace() === manager.get_workspace_by_index(2),
            'no delayed long action after modifiers have been released');

        const originalRight = this._settings.get_strv('workspace-step-right');
        const originalWindowRight = this._settings.get_strv('workspace-step-window-right');
        const originalModifier = this._settings.get_string('window-modifier');
        this._settings.set_strv('workspace-step-right', ['<Super>F9']);
        this._settings.set_strv('workspace-step-window-right', ['<Super>F10']);
        this._settings.set_string('window-modifier', 'control');
        await delay(250);
        this._assert(this._settings.get_strv('effective-window-right')[0] === '<Control><Super>F9',
            'global modifier derives moving binding from an edited base shortcut without restart');
        a.change_workspace(middle);
        middle.activate_with_focus(a, timestamp());
        await delay(400);
        await chord(Clutter.KEY_F9);
        this._assert(manager.get_active_workspace() !== middle && a.get_workspace() === middle,
            'edited workspace shortcut works live and leaves the window behind');
        middle.activate_with_focus(a, timestamp());
        await delay(400);
        await chord(Clutter.KEY_F9, false, false, false, true);
        this._assert(a.get_workspace() === manager.get_active_workspace() && a.get_workspace() !== middle,
            'Ctrl plus edited workspace shortcut carries the window live');
        this._settings.set_string('window-modifier', 'none');
        await delay(250);
        a.change_workspace(middle);
        middle.activate_with_focus(a, timestamp());
        await delay(400);
        await chord(Clutter.KEY_F10);
        this._assert(a.get_workspace() === manager.get_active_workspace() && a.get_workspace() !== middle,
            'None restores the separately configured moving shortcut live');
        this._settings.set_strv('workspace-step-right', originalRight);
        this._settings.set_strv('workspace-step-window-right', originalWindowRight);
        this._settings.set_string('window-modifier', originalModifier);
        await delay(250);

        // Tap Delete preserves a real app window and removes exactly one space.
        a.change_workspace(middle);
        middle.activate_with_focus(a, timestamp());
        await delay(400);
        const originalClose = this._settings.get_strv('workspace-step-close');
        this._settings.set_strv('workspace-step-close', ['<Super>F11']);
        await delay(250);
        await chord(Clutter.KEY_F11);
        this._assert(middle.index() < 0 && a.get_workspace() === first &&
            manager.n_workspaces === count,
        'edited close shortcut removes workspace and preserves its window on its neighbor');
        this._settings.set_strv('workspace-step-close', originalClose);
        await delay(250);

        // Long Delete closes only the source's app windows, not the entire app.
        const closing = manager.append_new_workspace(false, timestamp());
        a.change_workspace(closing);
        closing.activate_with_focus(a, timestamp());
        await delay(400);
        await chord(Clutter.KEY_Delete, true);
        this._assert(closing.index() < 0 && !global.get_window_actors().some(actor => actor.meta_window === a) &&
            global.get_window_actors().some(actor => actor.meta_window === b),
        'real Delete hold closes source window and workspace while preserving another window of the same app');

        const guarded = b.get_workspace();
        guarded.activate_with_focus(b, timestamp());
        await delay(400);
        await chord(Clutter.KEY_Delete, true);
        this._assert(guarded.index() >= 0 && b.get_title().includes('Unsaved') &&
            this._closer._pending.has(guarded),
        'unsaved close refusal preserves workspace and window');
        await chord(Clutter.KEY_Delete, true);
        this._assert(guarded.index() < 0, 'retry after unsaved close refusal completes workspace removal');
    }

    async _testEndpoints(a, b, mutter) {
        this._settings.set_string('empty-workspace-view', 'none');
        this._settings.set_string('creation-view', 'none');
        this._settings.set_string('window-creation-view', 'none');
        Main.overview.hide();
        await delay(400);
        mutter.set_boolean('dynamic-workspaces', false);
        await delay(400);
        const manager = global.workspace_manager;
        const timestamp = () => global.get_current_time();
        while (manager.n_workspaces < 3)
            manager.append_new_workspace(false, timestamp());
        const first = manager.get_workspace_by_index(0);
        const last = manager.get_workspace_by_index(manager.n_workspaces - 1);
        a.change_workspace(first);
        b.change_workspace(last);
        first.activate_with_focus(a, timestamp());
        await delay(400);
        const count = manager.n_workspaces;
        const left = this._step(-1, false, true);
        await delay(400);
        this._assert(left.created && left.workspace.index() === 0 && a.get_workspace() === first &&
            manager.n_workspaces === count + 1, 'static hold inserts before occupied first workspace');
        const right = this._step(1, false, true);
        await delay(400);
        this._assert(right.created && right.workspace.index() === manager.n_workspaces - 1 &&
            b.get_workspace() === last && manager.n_workspaces === count + 2,
        'static hold inserts after occupied last workspace');
        const reusedLeft = this._step(-1, false, true);
        await delay(400);
        this._assert(!reusedLeft.created && reusedLeft.workspace === left.workspace,
            'static hold reuses empty first workspace');
        const reusedRight = this._step(1, false, true);
        await delay(400);
        this._assert(!reusedRight.created && reusedRight.workspace === right.workspace &&
            manager.n_workspaces === count + 2, 'static hold reuses empty last workspace');

        first.activate_with_focus(a, timestamp());
        await delay(400);
        mutter.set_boolean('dynamic-workspaces', true);
        await delay(500);
        const trailing = manager.get_workspace_by_index(manager.n_workspaces - 1);
        const dynamicRight = this._step(1, false, true);
        await delay(500);
        this._assert(!dynamicRight.created && dynamicRight.workspace === trailing &&
            manager.get_active_workspace() === trailing, 'dynamic hold reuses GNOME trailing empty workspace');
        // Fill the first workspace explicitly; do not assume a retention plugin's policy.
        a.change_workspace(manager.get_workspace_by_index(0));
        const dynamicLeft = this._step(-1, false, true);
        await delay(500);
        this._assert(dynamicLeft.created && dynamicLeft.workspace.index() === 0,
            'dynamic hold inserts before occupied first workspace');
    }

    async _testOpeningChoices(a, b, mutter) {
        Main.overview.hide();
        await delay(450);
        mutter.set_boolean('dynamic-workspaces', false);
        await delay(400);
        const manager = global.workspace_manager;
        const timestamp = () => global.get_current_time();
        while (manager.n_workspaces < 3)
            manager.append_new_workspace(false, timestamp());
        const source = manager.get_workspace_by_index(0);
        a.change_workspace(source);
        b.change_workspace(source);
        source.activate_with_focus(a, timestamp());
        await delay(400);
        this._settings.set_string('empty-workspace-view', 'none');
        this._settings.set_string('creation-view', 'app-grid');
        this._settings.set_string('window-creation-view', 'none');
        const created = this._step(1, false);
        await delay(850);
        this._assert(Main.overview.visible && Main.overview.dash.showAppsButton.checked &&
            manager.get_active_workspace() === created.workspace,
            'creation uses its own App Grid setting while the other settings are None');
        Main.overview.hide();
        await delay(450);
        source.activate_with_focus(a, timestamp());
        await delay(400);
        this._settings.set_string('creation-view', 'none');
        this._settings.set_string('window-creation-view', 'overview');
        const moved = this._step(1, true);
        await delay(850);
        this._assert(Main.overview.visible && !Main.overview.dash.showAppsButton.checked &&
            a.get_workspace() === moved.workspace && manager.get_active_workspace() === moved.workspace,
            'window-moving creation opens its own Overview choice on the occupied destination');
        Main.overview.searchEntry.set_text('preserve');
        this._settings.set_string('creation-view', 'app-grid');
        this._step(-1, false);
        await delay(500);
        this._assert(Main.overview.visible && !Main.overview.dash.showAppsButton.checked &&
            Main.overview.searchEntry.get_text() === 'preserve',
            'creation from overview preserves the current view and search');
        Main.overview.hide();
        await delay(450);
        this._settings.set_string('creation-view', 'none');
        this._settings.set_string('window-creation-view', 'none');
        this._settings.set_string('empty-workspace-view', 'app-grid');
        source.activate_with_focus(b, timestamp());
        await delay(400);
        const empty = manager.append_new_workspace(false, timestamp());
        empty.activate(timestamp());
        await delay(850);
        this._assert(Main.overview.visible && Main.overview.dash.showAppsButton.checked,
            'other empty-workspace navigation uses the third setting independently');
        Main.overview.hide();
        this._settings.set_string('empty-workspace-view', 'none');
        await delay(450);
    }

    async _testBarInsertion(a, b, mutter) {
        this._settings.set_string('empty-workspace-view', 'none');
        this._settings.set_string('creation-view', 'none');
        this._settings.set_string('window-creation-view', 'none');
        mutter.set_boolean('dynamic-workspaces', false);
        await delay(500);
        const manager = global.workspace_manager;
        const timestamp = () => global.get_current_time();
        while (manager.n_workspaces < 4)
            manager.append_new_workspace(false, timestamp());
        a.change_workspace(manager.get_workspace_by_index(1));
        b.change_workspace(manager.get_workspace_by_index(2));
        a.get_workspace().activate_with_focus(a, timestamp());
        await delay(500);
        const bar = Extension.lookupByUUID('workspace-bar@jguece')?._workspaceBar;
        this._assert(!!bar, 'Workspace Bar loaded for insertion regression');
        let frames = 0;
        const mismatches = [];
        const repaint = Clutter.threads_add_repaint_func(Clutter.RepaintFlags.POST_PAINT, () => {
            frames++;
            const buttons = bar._container?.get_children() ?? [];
            for (const window of [a, b]) {
                const expected = window.get_workspace().index();
                const actual = bar._winIdsRepr?.findIndex(ids => ids.includes(window.get_id()));
                if (actual !== expected)
                    mismatches.push(`frame ${frames}: icon at ${actual}, workspace ${expected}`);
            }
            const highlighted = buttons.filter(button =>
                button._wsbNumWrapper.has_style_class_name('wsb-ws-num-wrapper-active'));
            if (highlighted.length !== 1 || highlighted[0].wsIndex !== manager.get_active_workspace_index())
                mismatches.push(`frame ${frames}: wrong active highlight`);
            return true;
        });
        try {
            this._step(1, false);
            await delay(450);
        } finally {
            Clutter.threads_remove_repaint_func(repaint);
        }
        this._assert(frames > 0 && mismatches.length === 0,
            `every painted insertion frame has correct icons and highlight (${frames} frames; ${mismatches.slice(0, 5).join('; ')})`);
    }
}
