// SPDX-License-Identifier: GPL-3.0-or-later
export function migrateViewSettings(settings) {
    if (settings.get_user_value('empty-workspace-view') === null) {
        const previous = settings.get_user_value('switch-view');
        const legacy = settings.get_user_value('search-after-switch');
        if (previous !== null)
            settings.set_string('empty-workspace-view', previous.deep_unpack());
        else if (legacy !== null)
            settings.set_string('empty-workspace-view', legacy.get_boolean() ? 'overview' : 'none');
    }
    if (settings.get_user_value('creation-view') === null) {
        const previous = settings.get_user_value('empty-workspace-view');
        if (previous !== null)
            settings.set_string('creation-view', previous.deep_unpack());
    }
    if (settings.get_user_value('window-creation-view') === null) {
        const previous = settings.get_user_value('move-view');
        if (previous !== null)
            settings.set_string('window-creation-view', previous.deep_unpack());
    }
    if (settings.get_user_value('window-modifier') === null &&
        ['workspace-step-window-left', 'workspace-step-window-right'].some(key => settings.get_user_value(key) !== null))
        settings.set_string('window-modifier', 'none');
}
