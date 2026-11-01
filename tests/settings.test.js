import assert from 'node:assert/strict';
import {test} from 'node:test';
import {migrateViewSettings} from '../extension/settings.js';

function settingsWith(values) {
    return {
        values: {...values},
        get_user_value(key) {
            if (!(key in this.values))
                return null;
            return {
                get_boolean: () => this.values[key],
                deep_unpack: () => this.values[key],
            };
        },
        set_string(key, value) { this.values[key] = value; },
    };
}

test('migrate the legacy desktop search preference to the independent setting', () => {
    const settings = settingsWith({'search-after-switch': false, 'search-after-move': true});
    migrateViewSettings(settings);
    assert.equal(settings.values['empty-workspace-view'], 'none');
});

test('migrate the previous workspace-switch choice instead of the window-move choice', () => {
    const settings = settingsWith({
        'search-after-switch': false,
        'switch-view': 'app-grid',
        'search-after-move': true,
        'move-view': 'none',
    });
    migrateViewSettings(settings);
    assert.equal(settings.values['empty-workspace-view'], 'app-grid');
});

test('do not overwrite an explicit choice in the new setting', () => {
    const settings = settingsWith({'switch-view': 'app-grid', 'empty-workspace-view': 'none'});
    migrateViewSettings(settings);
    assert.equal(settings.values['empty-workspace-view'], 'none');
});

test('fresh installs keep new schema defaults and do not create settings overrides', () => {
    const settings = settingsWith({});
    migrateViewSettings(settings);
    assert.deepEqual(settings.values, {});
});

test('split opening settings inherit existing choices without overwriting new choices', () => {
    const settings = settingsWith({'empty-workspace-view': 'app-grid', 'move-view': 'overview'});
    migrateViewSettings(settings);
    assert.equal(settings.values['creation-view'], 'app-grid');
    assert.equal(settings.values['window-creation-view'], 'overview');
    settings.values['creation-view'] = 'none';
    settings.values['window-creation-view'] = 'none';
    migrateViewSettings(settings);
    assert.equal(settings.values['creation-view'], 'none');
    assert.equal(settings.values['window-creation-view'], 'none');
});

test('existing custom window shortcuts remain independently configured on upgrade', () => {
    const settings = settingsWith({'workspace-step-window-right': ['<Alt>F8']});
    migrateViewSettings(settings);
    assert.equal(settings.values['window-modifier'], 'none');
    assert.deepEqual(settings.values['workspace-step-window-right'], ['<Alt>F8']);
});
