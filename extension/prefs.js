// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {migrateViewSettings} from './settings.js';
import {MODIFIERS, SHORTCUT_KEYS, readShortcutValues, effectiveShortcuts, shortcutProblem, normalizeShortcut} from './shortcuts.js';

export default class WorkStepperPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        migrateViewSettings(settings);
        this._shortcutRows = new Map();
        this._addResetAll(window, settings);
        const page = new Adw.PreferencesPage({
            title: 'WorkStepper',
            icon_name: 'view-paged-symbolic',
        });
        window.add(page);

        const modifierGroup = new Adw.PreferencesGroup({
            title: 'Window-moving modifier',
            description: 'Add this modifier to the workspace shortcuts to carry the focused window. Choose None to edit the window-moving shortcuts separately.',
        });
        page.add(modifierGroup);
        const modifierRow = new Adw.ActionRow({title: 'Global modifier'});
        const modifierButtons = new Adw.ToggleGroup({valign: Gtk.Align.CENTER, homogeneous: true});
        modifierButtons.set_name('window-modifier');
        for (const [name, label] of MODIFIERS)
            modifierButtons.add(new Adw.Toggle({name, label}));
        settings.bind('window-modifier', modifierButtons, 'active-name', Gio.SettingsBindFlags.DEFAULT);
        modifierRow.add_suffix(modifierButtons);
        modifierGroup.add(modifierRow);

        const switching = new Adw.PreferencesGroup({
            title: 'Create workspace and switch',
            description: 'Reuse an empty workspace immediately to the chosen side, or insert a new one.',
        });
        page.add(switching);
        this._addShortcut(switching, window, settings, 'workspace-step-left', 'Create or reuse on the left', 'Hold to create or reuse at the far left');
        this._addShortcut(switching, window, settings, 'workspace-step-right', 'Create or reuse on the right', 'Hold to create or reuse at the far right');

        const moving = new Adw.PreferencesGroup({
            title: 'Move focused window and switch',
            description: 'Take the focused window to a new or adjacent empty workspace, then follow it.',
        });
        moving.set_name('window-moving-shortcuts');
        page.add(moving);
        this._addShortcut(moving, window, settings, 'workspace-step-window-left', 'Move window to the left', 'Hold to create or reuse at the far left');
        this._addShortcut(moving, window, settings, 'workspace-step-window-right', 'Move window to the right', 'Hold to create or reuse at the far right');

        const closing = new Adw.PreferencesGroup({
            title: 'Close workspace',
            description: 'Tap to remove the workspace and keep its windows on a neighbor. Hold to close its windows first; unsaved-work dialogs keep the workspace open.',
        });
        page.add(closing);
        this._addShortcut(closing, window, settings, 'workspace-step-close', 'Close active workspace', 'Hold to close workspace and its windows');

        const gestures = new Adw.PreferencesGroup({
            title: 'Long press',
            description: 'Short actions run on key release. A hold runs only the long action, once.',
        });
        page.add(gestures);
        const duration = new Adw.SpinRow({
            title: 'Hold duration',
            subtitle: 'Milliseconds',
            adjustment: new Gtk.Adjustment({lower: 75, upper: 2000, step_increment: 25, page_increment: 100}),
        });
        settings.bind('long-press-duration', duration, 'value', Gio.SettingsBindFlags.DEFAULT);
        gestures.add(duration);
        const destination = new Adw.PreferencesGroup({
            title: 'After switching workspaces',
            description: 'Choose what opens for each kind of switch from the desktop. Switching within Overview or App Grid keeps the current view.',
        });
        page.add(destination);
        this._addViewSelector(destination, settings, 'creation-view', 'Create or reuse a workspace');
        this._addViewSelector(destination, settings, 'window-creation-view', 'Create or reuse and move a window');
        this._addViewSelector(destination, settings, 'empty-workspace-view', 'Other empty-workspace switches');

        const refresh = () => {
            const modifier = settings.get_string('window-modifier');
            const values = readShortcutValues(settings);
            const effective = effectiveShortcuts(values, modifier);
            const manual = modifier === 'none';
            moving.sensitive = manual;
            moving.opacity = manual ? 1 : 0.55;
            moving.description = manual
                ? 'Edit these shortcuts independently. Hold to create or reuse at the chosen end.'
                : 'Derived from the workspace shortcuts and global modifier. Choose None above to edit these shortcuts.';
            for (const [key, widgets] of this._shortcutRows) {
                widgets.label.accelerator = effective[key][0] ?? '';
                widgets.label.tooltip_text = effective[key].map(accel => this._shortcutLabel(accel)).join('\n');
                const defaults = settings.get_default_value(key).deep_unpack();
                widgets.reset.visible = JSON.stringify(values[key].map(normalizeShortcut).sort()) !==
                    JSON.stringify(defaults.map(normalizeShortcut).sort());
            }
            for (const [name] of MODIFIERS) {
                const toggle = modifierButtons.get_toggle_by_name(name);
                toggle.enabled = !shortcutProblem(values, name);
                toggle.tooltip = toggle.enabled ? '' : shortcutProblem(values, name);
            }
        };
        const changed = settings.connect('changed', (_settings, key) => {
            if (key === 'window-modifier' || SHORTCUT_KEYS.includes(key))
                refresh();
        });
        window.connect('close-request', () => {
            settings.disconnect(changed);
            return false;
        });
        refresh();
    }

    _addResetAll(window, settings) {
        const findHeaderBar = widget => {
            if (widget instanceof Adw.HeaderBar)
                return widget;
            for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) {
                const header = findHeaderBar(child);
                if (header)
                    return header;
            }
            return null;
        };
        const header = findHeaderBar(window);
        if (!header)
            throw new Error('Preferences header bar was not found');
        const resetAll = new Gtk.Button({label: 'Reset All', valign: Gtk.Align.CENTER,
            tooltip_text: 'Restore all WorkStepper settings to their defaults'});
        resetAll.set_name('reset-all');
        resetAll.add_css_class('flat');
        resetAll.connect('clicked', () => {
            // Use a separate writer so batching does not leave the preferences'
            // live settings object in delayed-apply mode after the reset.
            const writer = new Gio.Settings({settings_schema: settings.settings_schema});
            writer.delay();
            for (const key of settings.settings_schema.list_keys())
                writer.reset(key);
            writer.apply();
            window.add_toast(new Adw.Toast({title: 'All settings reset to defaults'}));
        });
        header.pack_start(resetAll);
    }

    _shortcutLabel(accelerator) {
        const [valid, key, modifiers] = Gtk.accelerator_parse(accelerator);
        return valid ? Gtk.accelerator_get_label(key, modifiers) : accelerator;
    }

    _addShortcut(group, window, settings, key, title, subtitle) {
        const row = new Adw.ActionRow({title, subtitle, activatable: true});
        row.set_name(key);
        const label = new Gtk.ShortcutLabel({disabled_text: 'Disabled', valign: Gtk.Align.CENTER});
        row.connect('activated', () => this._editShortcut(window, settings, key, title));
        const reset = new Gtk.Button({icon_name: 'edit-undo-symbolic', valign: Gtk.Align.CENTER,
            tooltip_text: 'Restore default shortcut'});
        reset.add_css_class('flat');
        reset.connect('clicked', () => {
            const values = readShortcutValues(settings);
            values[key] = settings.get_default_value(key).deep_unpack();
            const problem = shortcutProblem(values, settings.get_string('window-modifier'));
            if (problem)
                this._showShortcutError(window, problem);
            else
                settings.reset(key);
        });
        row.add_suffix(reset);
        row.add_suffix(label);
        group.add(row);
        this._shortcutRows.set(key, {row, label, reset});
    }

    _showShortcutError(window, message) {
        window.add_toast(new Adw.Toast({title: message, timeout: 5}));
    }

    _editShortcut(window, settings, key, title) {
        const dialog = new Adw.Window({title: 'Set shortcut', transient_for: window, modal: true,
            default_width: 460, default_height: 250});
        const toolbar = new Adw.ToolbarView();
        toolbar.add_top_bar(new Adw.HeaderBar());
        const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 18,
            margin_top: 18, margin_bottom: 24, margin_start: 24, margin_end: 24});
        box.append(new Gtk.Label({label: title, wrap: true}));
        const hint = new Gtk.Label({label: 'Press the new shortcut. Escape cancels.', wrap: true});
        hint.add_css_class('dim-label');
        box.append(hint);
        const clear = new Gtk.Button({label: 'Disable shortcut', halign: Gtk.Align.CENTER});
        clear.connect('clicked', () => {settings.set_strv(key, []); dialog.close();});
        box.append(clear);
        toolbar.set_content(box);
        dialog.set_content(toolbar);
        dialog.connect('realize', () => dialog.get_surface()?.inhibit_system_shortcuts(null));
        dialog.connect('close-request', () => {
            dialog.get_surface()?.restore_system_shortcuts();
            return false;
        });
        const controller = new Gtk.EventControllerKey({propagation_phase: Gtk.PropagationPhase.CAPTURE});
        controller.connect('key-pressed', (_controller, keyval, _keycode, state) => {
            const mask = state & Gtk.accelerator_get_default_mod_mask();
            if (keyval === Gdk.KEY_Escape && !mask) {
                dialog.close();
                return true;
            }
            if ([Gdk.KEY_Shift_L, Gdk.KEY_Shift_R, Gdk.KEY_Control_L, Gdk.KEY_Control_R,
                Gdk.KEY_Alt_L, Gdk.KEY_Alt_R, Gdk.KEY_Super_L, Gdk.KEY_Super_R,
                Gdk.KEY_Meta_L, Gdk.KEY_Meta_R, Gdk.KEY_Hyper_L, Gdk.KEY_Hyper_R].includes(keyval))
                return true;
            if (!Gtk.accelerator_valid(keyval, mask)) {
                hint.label = 'Choose a valid shortcut with a modifier or function key.';
                return true;
            }
            const accelerator = Gtk.accelerator_name(Gdk.keyval_to_lower(keyval), mask);
            const values = readShortcutValues(settings);
            values[key] = [accelerator];
            const problem = shortcutProblem(values, settings.get_string('window-modifier'));
            if (problem) {
                hint.label = problem;
                return true;
            }
            settings.set_strv(key, [accelerator]);
            dialog.close();
            return true;
        });
        dialog.add_controller(controller);
        dialog._shortcutController = controller;
        dialog.present();
        return dialog;
    }

    _addViewSelector(group, settings, key, title) {
        const row = new Adw.ActionRow({title});
        const buttons = new Adw.ToggleGroup({
            valign: Gtk.Align.CENTER,
            homogeneous: true,
        });
        buttons.set_name(key);
        for (const [name, label] of [
            ['overview', 'Overview'], ['app-grid', 'App Grid'], ['none', 'None'],
        ])
            buttons.add(new Adw.Toggle({name, label}));
        settings.bind(key, buttons, 'active-name', Gio.SettingsBindFlags.DEFAULT);
        row.add_suffix(buttons);
        group.add(row);
    }
}
