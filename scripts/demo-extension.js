// Test-session entry point: records real Shell frames and real keybindings.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import WorkStepper from './workspaceStep.js';

const delay = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve(); return GLib.SOURCE_REMOVE;
}));

export default class Demo extends WorkStepper {
    enable() {
        super.enable();
        this._demo().catch(error => {
            GLib.file_set_contents(GLib.getenv('WORKSTEPPER_DEMO_DIR') + '/error.txt', `${error.message}\n${error.stack}`);
            global.context.terminate();
        });
    }

    _caption(title, detail, key = '') {
        this._captionText = {title, detail, key};
    }

    async _record(name, timeline) {
        const directory = GLib.getenv('WORKSTEPPER_DEMO_DIR') + '/' + name;
        GLib.mkdir_with_parents(directory, 0o755);
        let running = true;
        const action = timeline().finally(() => {running = false;});
        let index = 0;
        const captions = [];
        const shooter = new Shell.Screenshot();
        while (running) {
            captions.push(this._captionText);
            const start = GLib.get_monotonic_time();
            const file = Gio.File.new_for_path(`${directory}/${String(index++).padStart(5, '0')}.png`);
            const stream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
            await shooter.screenshot(false, stream);
            stream.close(null);
            await delay(Math.max(1, 1000 / 12 - (GLib.get_monotonic_time() - start) / 1000));
        }
        await action;
        GLib.file_set_contents(`${directory}/captions.json`, JSON.stringify(captions));
    }

    async _chord(key, shift = false, hold = false) {
        const keyboard = this._keyboard;
        const send = (symbol, state) => keyboard.notify_keyval(GLib.get_monotonic_time(), symbol, state);
        send(Clutter.KEY_Super_L, Clutter.KeyState.PRESSED);
        if (shift) send(Clutter.KEY_Shift_L, Clutter.KeyState.PRESSED);
        send(key, Clutter.KeyState.PRESSED);
        await delay(hold ? 850 : 90);
        send(key, Clutter.KeyState.RELEASED);
        if (shift) send(Clutter.KEY_Shift_L, Clutter.KeyState.RELEASED);
        send(Clutter.KEY_Super_L, Clutter.KeyState.RELEASED);
    }

    async _reset() {
        Main.overview.hide();
        await delay(450);
        const manager = global.workspace_manager;
        const first = manager.get_workspace_by_index(0);
        for (const window of this._windows) window.change_workspace(first);
        first.activate(global.get_current_time());
        while (manager.n_workspaces > 1)
            manager.remove_workspace(manager.get_workspace_by_index(manager.n_workspaces - 1), global.get_current_time());
        manager.append_new_workspace(false, global.get_current_time());
        manager.append_new_workspace(false, global.get_current_time());
        this._research.change_workspace(manager.get_workspace_by_index(1));
        for (const window of this._windows) {
            window.unmaximize();
            window.move_resize_frame(false, 235, 190, 810, 460);
        }
        this._notes.activate(global.get_current_time());
        await delay(600);
    }

    async _demo() {
        while (Main.layoutManager._startingUp) await delay(100);
        await delay(1000);
        Main.overview.hide();
        new Gio.Settings({schema_id: 'org.gnome.mutter'}).set_boolean('dynamic-workspaces', false);
        this._settings.set_string('creation-view', 'overview');
        this._settings.set_string('window-creation-view', 'overview');
        this._settings.set_string('empty-workspace-view', 'none');
        this._settings.set_uint('long-press-duration', 650);
        await delay(500);
        this._client = Gio.Subprocess.new(['python3', GLib.getenv('WORKSTEPPER_DEMO_WINDOWS')], Gio.SubprocessFlags.NONE);
        for (let attempt = 0; attempt < 60; attempt++) {
            this._windows = global.get_window_actors().map(actor => actor.meta_window)
                .filter(window => window.get_title()?.endsWith('— WorkStepper demo'));
            if (this._windows.length === 3) break;
            await delay(100);
        }
        if (this._windows.length !== 3) throw new Error('Demo windows did not open');
        this._notes = this._windows.find(w => w.get_title().startsWith('Notes'));
        this._editor = this._windows.find(w => w.get_title().startsWith('Editor'));
        this._research = this._windows.find(w => w.get_title().startsWith('Research'));
        this._keyboard = global.stage.context.get_backend().get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);

        await this._reset();
        await this._record('01-create-workspace', async () => {
            this._caption('WorkStepper  /  Make room for the next task',
                'Create an empty workspace between your current task and your research.', 'Tap  Super + Enter');
            await delay(1600);
            await this._chord(Clutter.KEY_Return);
            await delay(900);
            this._caption('A fresh workspace. Your other tasks stay in place.',
                'Overview opens on arrival, ready to search for your next app.', 'Create → switch → start something new');
            await delay(2800);
        });

        await this._reset();
        this._editor.activate(global.get_current_time());
        await delay(400);
        await this._record('02-move-window', async () => {
            this._caption('WorkStepper  /  Give a window its own space',
                'Take the focused editor into a new workspace and follow it.', 'Tap  Super + Shift + Enter');
            await delay(1600);
            await this._chord(Clutter.KEY_Return, true);
            await delay(900);
            this._caption('One window moved. Everything else stays organized.',
                'Notes stays on the left. Research stays on the right.', 'Add Shift to carry the focused window');
            await delay(2800);
        });

        await this._reset();
        await this._record('03-create-at-ends', async () => {
            this._caption('WorkStepper  /  Start at either end',
                'Hold Enter to create or reuse an empty workspace at the far right.', 'Hold  Super + Enter');
            await delay(1300);
            await this._chord(Clutter.KEY_Return, false, true);
            await delay(1100);
            this._caption('An empty end workspace is reused.',
                'Occupied end? WorkStepper creates a fresh workspace beyond it.', 'Far right → reuse the empty workspace');
            await delay(1500);
            Main.overview.hide();
            await delay(450);
            this._notes.activate(global.get_current_time());
            await delay(450);
            this._caption('Now make room before the first workspace.',
                'Hold Backspace to insert at the far left when the first workspace is occupied.', 'Hold  Super + Backspace');
            await delay(900);
            await this._chord(Clutter.KEY_BackSpace, false, true);
            await delay(1900);
        });
        this._client.force_exit();
        GLib.file_set_contents(GLib.getenv('WORKSTEPPER_DEMO_DIR') + '/complete', 'ok');
        global.context.terminate();
    }
}
