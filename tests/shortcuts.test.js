import assert from 'node:assert/strict';
import {test} from 'node:test';
import {effectiveShortcuts, normalizeShortcut, shortcutProblem} from '../extension/shortcuts.js';

const defaults = {
    'workspace-step-left': ['<Super>BackSpace'],
    'workspace-step-right': ['<Super>Return'],
    'workspace-step-window-left': ['<Control>F7'],
    'workspace-step-window-right': ['<Control>F8'],
    'workspace-step-close': ['<Super>Delete'],
};

test('derive moving shortcuts from edited base bindings and chosen global modifier', () => {
    const values = {...defaults, 'workspace-step-right': ['<Alt>F10', '<Super>F12']};
    const result = effectiveShortcuts(values, 'control');
    assert.deepEqual(result['workspace-step-window-right'], ['<Control><Alt>F10', '<Control><Super>F12']);
    assert.deepEqual(defaults['workspace-step-window-right'], ['<Control>F8']);
    assert.equal(shortcutProblem(values, 'control'), null);
});

test('None restores preserved manual window bindings and disabled base bindings stay disabled', () => {
    assert.deepEqual(effectiveShortcuts(defaults, 'none'), defaults);
    const values = {...defaults, 'workspace-step-left': []};
    assert.deepEqual(effectiveShortcuts(values, 'shift')['workspace-step-window-left'], []);
});

test('detect conflicts regardless of modifier order, aliases, and key-name case', () => {
    assert.equal(normalizeShortcut('<Super><Primary>F8'), normalizeShortcut('<Control><Super>f8'));
    assert.ok(shortcutProblem({...defaults, 'workspace-step-window-right': ['<Super>return']}, 'none'));
    assert.ok(shortcutProblem({...defaults, 'workspace-step-close': ['<Shift><Super>Return']}, 'shift'));
});

test('a modifier already in the base chord cannot derive a distinct moving action', () => {
    assert.ok(shortcutProblem({...defaults, 'workspace-step-right': ['<Shift><Super>Return']}, 'shift'));
    assert.equal(shortcutProblem(defaults, 'alt'), null);
});
