import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';

imports.package.init({name: 'gnome-shell', prefix: '/usr', libdir: '/usr/lib'});
imports.package.initFormat();
Gio.resources_register(Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource'));
const path = ARGV[0];
const {default: Preferences} = await import(`file://${path}/prefs.js`);
const [, contents] = GLib.file_get_contents(`${path}/metadata.json`);
const metadata = JSON.parse(new TextDecoder().decode(contents));
const preferences = new Preferences({...metadata, path, dir: Gio.File.new_for_path(path)});

Adw.init();
const window = new Adw.PreferencesWindow({default_width: 900, default_height: 1000});
preferences.fillPreferencesWindow(window);
const paintable = new Gtk.WidgetPaintable({widget: window});
window.present();

let finish;
const completion = new Promise(resolve => {finish = resolve;});
let failure = null;
const verify = async () => {
    try {
        const toggles = [];
        const walk = widget => {
            if (widget instanceof Adw.ToggleGroup)
                toggles.push(widget);
            for (let child = widget.get_first_child(); child; child = child.get_next_sibling())
                walk(child);
        };
        walk(window);
        if (toggles.length !== 4)
            throw new Error(`Expected modifier and three view selectors, got ${toggles.length}`);

        const settings = preferences.getSettings();
        const spinRows = [];
        const findSpin = widget => {
            if (widget instanceof Adw.SpinRow)
                spinRows.push(widget);
            for (let child = widget.get_first_child(); child; child = child.get_next_sibling())
                findSpin(child);
        };
        findSpin(window);
        if (spinRows.length !== 1)
            throw new Error('Missing hold duration setting');
        const originalDuration = settings.get_uint('long-press-duration');
        spinRows[0].value = 850;
        if (settings.get_uint('long-press-duration') !== 850)
            throw new Error('Hold duration binding did not update settings');
        settings.set_uint('long-press-duration', originalDuration);
        for (const key of ['creation-view', 'window-creation-view', 'empty-workspace-view']) {
            const buttons = toggles.find(toggle => toggle.get_name() === key);
            const initial = settings.get_string(key);
            for (const name of ['overview', 'app-grid', 'none']) {
                if (!buttons.get_toggle_by_name(name)?.label)
                    throw new Error(`Missing labeled button for ${name}`);
                buttons.active_name = name;
                if (settings.get_string(key) !== name)
                    throw new Error(`Button did not write ${key}=${name}`);
            }
            settings.set_string(key, initial);
            if (buttons.active_name !== initial)
                throw new Error(`Selector did not read ${key}`);
        }

        const modifiers = toggles.find(toggle => toggle.get_name() === 'window-modifier');
        const originalModifier = settings.get_string('window-modifier');
        const manualKey = 'workspace-step-window-right';
        const originalManual = settings.get_strv(manualKey);
        settings.set_strv(manualKey, ['<Control>F8']);
        modifiers.active_name = 'none';
        const moving = preferences._shortcutRows.get(manualKey).row.get_ancestor(Adw.PreferencesGroup.$gtype);
        if (!moving.sensitive || moving.opacity !== 1)
            throw new Error('None must enable manual shortcut settings');
        modifiers.active_name = 'alt';
        if (moving.sensitive || moving.opacity >= 1)
            throw new Error('Global modifier must fade and disable manual shortcut settings');
        if (settings.get_strv(manualKey)[0] !== '<Control>F8')
            throw new Error('Global modifier overwrote the preserved manual shortcut');
        modifiers.active_name = 'none';
        if (!preferences._shortcutRows.get(manualKey).label.accelerator.includes('F8'))
            throw new Error('None did not restore the displayed manual shortcut');
        settings.set_strv(manualKey, originalManual);
        settings.set_strv(manualKey, ['<Shift><Super>Return']);
        if (preferences._shortcutRows.get(manualKey).reset.visible)
            throw new Error('Equivalent default chord must hide reset regardless of modifier order');
        settings.set_strv(manualKey, originalManual);
        settings.set_string('window-modifier', originalModifier);

        const key = 'workspace-step-right';
        const original = settings.get_strv(key);
        if (preferences._shortcutRows.get(key).reset.visible)
            throw new Error('Default shortcut must hide its reset button');
        const dialog = preferences._editShortcut(window, settings, key, 'Test shortcut capture');
        dialog._shortcutController.emit('key-pressed', Gdk.KEY_F9, 75, Gdk.ModifierType.SUPER_MASK);
        if (settings.get_strv(key)[0] !== '<Super>F9')
            throw new Error('Shortcut capture did not persist its key combination');
        if (!preferences._shortcutRows.get(key).label.accelerator.includes('F9'))
            throw new Error('Shortcut label did not refresh after capture');
        if (!preferences._shortcutRows.get(key).reset.visible)
            throw new Error('Modified shortcut must show its reset button');
        preferences._shortcutRows.get(key).reset.emit('clicked');
        if (preferences._shortcutRows.get(key).reset.visible ||
            settings.get_strv(key)[0] !== original[0])
            throw new Error('Reset must restore default and hide its button');

        let resetAll = null;
        const findResetAll = widget => {
            if (widget.get_name() === 'reset-all')
                resetAll = widget;
            for (let child = widget.get_first_child(); child; child = child.get_next_sibling())
                findResetAll(child);
        };
        findResetAll(window);
        if (!resetAll || !resetAll.get_ancestor(Adw.HeaderBar.$gtype))
            throw new Error('Reset All must appear in the titlebar');
        settings.set_string('window-modifier', 'none');
        settings.set_uint('long-press-duration', 850);
        settings.set_strv(key, ['<Super>F9']);
        settings.set_string('creation-view', 'app-grid');
        settings.set_string('window-creation-view', 'overview');
        settings.set_string('empty-workspace-view', 'none');
        resetAll.emit('clicked');
        for (const settingKey of settings.settings_schema.list_keys()) {
            if (!settings.get_value(settingKey).equal(settings.get_default_value(settingKey)))
                throw new Error(`Reset All did not restore ${settingKey}`);
        }
        if (preferences._shortcutRows.get(key).reset.visible ||
            modifiers.active_name !== 'shift' || moving.sensitive)
            throw new Error('Reset All did not refresh shortcut rows and modifier state');
        settings.set_uint('long-press-duration', 200);
        if (spinRows[0].value !== 200)
            throw new Error('Reset All left later settings edits unapplied');
        settings.reset('long-press-duration');

        const save = name => {
            const snapshot = new Gtk.Snapshot();
            paintable.snapshot(snapshot, window.get_width(), window.get_height());
            const node = snapshot.to_node();
            window.get_renderer().render_texture(node, null).save_to_png(
                GLib.build_filenamev([GLib.path_get_dirname(GLib.getenv('WORKSPACE_STEP_RESULT')), name]));
        };
        save('prefs.png');
        const scrollers = [];
        const findScroll = widget => {
            if (widget instanceof Gtk.ScrolledWindow)
                scrollers.push(widget);
            for (let child = widget.get_first_child(); child; child = child.get_next_sibling())
                findScroll(child);
        };
        findScroll(window);
        for (const scroller of scrollers) {
            const adjustment = scroller.get_vadjustment();
            adjustment.value = Math.max(adjustment.lower, adjustment.upper - adjustment.page_size);
        }
        await new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        }));
        save('prefs-bottom.png');
        print('PREFS SMOKE PASSED');
    } catch (error) {
        failure = error;
    } finally {
        window.destroy();
        finish();
    }
};
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 800, () => {
    verify().catch(error => {failure = error; finish();});
    return GLib.SOURCE_REMOVE;
});
await completion;
if (failure)
    throw failure;
