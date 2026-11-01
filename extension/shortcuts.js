// SPDX-License-Identifier: GPL-3.0-or-later
export const SHORTCUT_KEYS = [
    'workspace-step-left', 'workspace-step-right',
    'workspace-step-window-left', 'workspace-step-window-right', 'workspace-step-close',
];
export const MODIFIERS = [
    ['shift', 'Shift', '<Shift>'], ['control', 'Ctrl', '<Control>'],
    ['alt', 'Alt', '<Alt>'], ['none', 'None', ''],
];

export function normalizeShortcut(accelerator) {
    const modifiers = [...accelerator.matchAll(/<([^>]+)>/g)].map(match => {
        const name = match[1].toLowerCase();
        return ['primary', 'ctrl'].includes(name) ? 'control' : name;
    }).sort();
    return modifiers.join('+') + ':' + accelerator.replace(/<[^>]+>/g, '').toLowerCase();
}

export function addModifier(accelerator, modifier) {
    const token = MODIFIERS.find(([name]) => name === modifier)?.[2] ?? '';
    if (!token)
        return accelerator;
    const existing = normalizeShortcut(accelerator).split(':')[0].split('+');
    return existing.includes(modifier) ? null : token + accelerator;
}

export function effectiveShortcuts(values, modifier) {
    const effective = Object.fromEntries(SHORTCUT_KEYS.map(key => [key, [...(values[key] ?? [])]]));
    if (modifier !== 'none') {
        for (const side of ['left', 'right'])
            effective[`workspace-step-window-${side}`] = effective[`workspace-step-${side}`]
                .map(accel => addModifier(accel, modifier)).filter(Boolean);
    }
    return effective;
}

// Returns a user-facing problem, or null when the whole configuration is valid.
export function shortcutProblem(values, modifier) {
    if (modifier !== 'none') {
        for (const side of ['left', 'right']) {
            if ((values[`workspace-step-${side}`] ?? []).some(accel => addModifier(accel, modifier) === null))
                return 'The window modifier is already part of a workspace shortcut. Choose another modifier or None.';
        }
    }
    const seen = new Map();
    for (const [key, accelerators] of Object.entries(effectiveShortcuts(values, modifier))) {
        for (const accelerator of accelerators) {
            const canonical = normalizeShortcut(accelerator);
            if (seen.has(canonical) && seen.get(canonical) !== key)
                return 'This shortcut is already assigned to another action.';
            seen.set(canonical, key);
        }
    }
    return null;
}

export function readShortcutValues(settings) {
    return Object.fromEntries(SHORTCUT_KEYS.map(key => [key, settings.get_strv(key)]));
}
