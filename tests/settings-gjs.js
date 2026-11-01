// Exercise real GLib.Variant return values instead of JS stand-ins.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {migrateViewSettings} from '../extension/settings.js';

if (GLib.getenv('GSETTINGS_BACKEND') !== 'memory')
    throw new Error('Run with GSETTINGS_BACKEND=memory to isolate these settings');
const root = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent();
const source = Gio.SettingsSchemaSource.new_from_directory(
    root.get_child('extension/schemas').get_path(), Gio.SettingsSchemaSource.get_default(), false);
const schema = source.lookup('org.gnome.shell.extensions.workspace-step', false);
const settings = new Gio.Settings({settings_schema: schema});
const reset = () => schema.list_keys().forEach(key => settings.reset(key));
const assertValue = (key, expected) => {
    const actual = settings.get_value(key).deep_unpack();
    if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(`${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

reset();
settings.set_string('empty-workspace-view', 'app-grid');
settings.set_string('move-view', 'overview');
migrateViewSettings(settings);
assertValue('creation-view', 'app-grid');
assertValue('window-creation-view', 'overview');
print('PASS: existing empty-workspace and window-moving choices migrate using real GLib.Variants');

reset();
settings.set_string('switch-view', 'none');
migrateViewSettings(settings);
assertValue('empty-workspace-view', 'none');
assertValue('creation-view', 'none');
print('PASS: legacy string choice migrates through both upgrade steps');

reset();
settings.set_boolean('search-after-switch', false);
settings.set_strv('workspace-step-window-right', ['<Alt>F8']);
migrateViewSettings(settings);
assertValue('empty-workspace-view', 'none');
assertValue('creation-view', 'none');
assertValue('window-modifier', 'none');
assertValue('workspace-step-window-right', ['<Alt>F8']);
print('PASS: legacy boolean choice and manual shortcuts survive upgrade');

reset();
settings.set_string('empty-workspace-view', 'app-grid');
settings.set_string('creation-view', 'none');
settings.set_string('window-creation-view', 'app-grid');
migrateViewSettings(settings);
migrateViewSettings(settings);
assertValue('creation-view', 'none');
assertValue('window-creation-view', 'app-grid');
print('PASS: repeated migration preserves explicitly configured new choices');
