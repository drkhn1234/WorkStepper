#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
project="$PWD"
installed_data_home="${XDG_DATA_HOME:-$HOME/.local/share}"
mkdir -p research
scratch=$(mktemp -d "$project/research/smoke-XXXXXX")
mkdir -p "$scratch/data/gnome-shell/extensions/workspace-step@drkhn" "$scratch/config" "$scratch/cache" "$scratch/runtime"
chmod 700 "$scratch/runtime"
test_extension="$scratch/data/gnome-shell/extensions/workspace-step@drkhn"
cp -a extension/. "$test_extension/"
mv "$test_extension/extension.js" "$test_extension/workspaceStep.js"
cp tests/shell-smoke.js "$test_extension/extension.js"
glib-compile-schemas --strict "$test_extension/schemas"
export XDG_DATA_HOME="$scratch/data"
export XDG_CONFIG_HOME="$scratch/config"
export XDG_CACHE_HOME="$scratch/cache"
export XDG_RUNTIME_DIR="$scratch/runtime"
export GSETTINGS_BACKEND=keyfile
export GDK_BACKEND=wayland
export GTK_A11Y=none
export WORKSPACE_STEP_RESULT="$scratch/result.txt"
export WORKSPACE_STEP_FIXTURE="$project/tests/window-fixture.py"
export WORKSPACE_STEP_PREFS_TEST="$project/tests/prefs-smoke.js"
export WORKSPACE_STEP_KEYBOARD_ONLY="${1:-}"
enabled_extensions="['workspace-step@drkhn']"
if [ "${1:-}" = '--with-workspace-bar' ] || [ "${1:-}" = '--with-original-workspace-bar' ]; then
    bar_extension="$scratch/data/gnome-shell/extensions/workspace-bar@jguece"
    cp -a "$installed_data_home/gnome-shell/extensions/workspace-bar@jguece" "$bar_extension"
    bar_source="${WORKSPACE_STEP_BAR_SOURCE:-$project/../workspace-bar/workspaceBar.js}"
    if [ "${1:-}" = '--with-workspace-bar' ] && [ -f "$bar_source" ]; then
        cp "$bar_source" "$bar_extension/workspaceBar.js"
    fi
    export WORKSPACE_STEP_TEST_BAR=1
    enabled_extensions="['workspace-bar@jguece', 'workspace-step@drkhn']"
fi
unset DISPLAY WAYLAND_DISPLAY
gsettings set org.gnome.shell enabled-extensions "$enabled_extensions"
if [ -n "${WORKSPACE_STEP_SAVED_SETTINGS:-}" ]; then
    python3 - "$WORKSPACE_STEP_SAVED_SETTINGS" "$test_extension/schemas" <<'PY'
import json
import sys
from gi.repository import Gio, GLib
source = Gio.SettingsSchemaSource.new_from_directory(sys.argv[2], Gio.SettingsSchemaSource.get_default(), False)
schema = source.lookup('org.gnome.shell.extensions.workspace-step', False)
settings = Gio.Settings.new_full(schema, None, None)
for key, value in json.load(open(sys.argv[1])).items():
    if schema.has_key(key):
        variant = GLib.Variant(schema.get_key(key).get_value_type().dup_string(), value)
        if schema.get_key(key).range_check(variant):
            settings.set_value(key, variant)
Gio.Settings.sync()
PY
fi
if [ "${WORKSPACE_STEP_TEST_BAR:-}" = 1 ]; then
    gsettings --schemadir "$bar_extension/schemas" set org.gnome.shell.extensions.workspace-bar enable-animations true
fi
gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.desktop.interface enable-animations true
timeout 90s dbus-run-session -- gnome-shell --headless --no-x11 --virtual-monitor=1280x1080 --wayland-display=workspace-step-test >"$scratch/shell.log" 2>&1 || status=$?
if [ -f "$WORKSPACE_STEP_RESULT" ]; then
    cat "$WORKSPACE_STEP_RESULT"
    if rg -q '^ALL SHELL SMOKE TESTS PASSED$' "$WORKSPACE_STEP_RESULT"; then
        exit 0
    fi
fi
tail -80 "$scratch/shell.log"
exit "${status:-1}"
