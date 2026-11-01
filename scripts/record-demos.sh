#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
project="$PWD"
mkdir -p research
scratch=$(mktemp -d "$project/research/promo-XXXXXX")
extension="$scratch/data/gnome-shell/extensions/workspace-step@drkhn"
mkdir -p "$extension" "$scratch/config" "$scratch/cache" "$scratch/runtime" "$scratch/frames"
chmod 700 "$scratch/runtime"
cp -a "$project/extension/." "$extension/"
mv "$extension/extension.js" "$extension/workspaceStep.js"
cp scripts/demo-extension.js "$extension/extension.js"
glib-compile-schemas --strict "$extension/schemas"
export XDG_DATA_HOME="$scratch/data" XDG_CONFIG_HOME="$scratch/config" XDG_CACHE_HOME="$scratch/cache"
export XDG_RUNTIME_DIR="$scratch/runtime" GSETTINGS_BACKEND=keyfile GDK_BACKEND=wayland GTK_A11Y=none
export WORKSTEPPER_DEMO_DIR="$scratch/frames" WORKSTEPPER_DEMO_WINDOWS="$project/scripts/demo-windows.py"
unset DISPLAY WAYLAND_DISPLAY
gsettings set org.gnome.shell enabled-extensions "['workspace-step@drkhn']"
gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.desktop.interface enable-animations true
gsettings set org.gnome.desktop.interface color-scheme prefer-dark
gsettings set org.gnome.desktop.background picture-uri ''
gsettings set org.gnome.desktop.background picture-uri-dark ''
gsettings set org.gnome.desktop.background primary-color '#172033'
timeout 75s dbus-run-session -- gnome-shell --headless --no-x11 --virtual-monitor=1280x800 --wayland-display=workstepper-demo >"$scratch/shell.log" 2>&1 || true
if [ ! -f "$scratch/frames/complete" ]; then
    cat "$scratch/frames/error.txt" 2>/dev/null || true
    tail -45 "$scratch/shell.log"
    exit 1
fi
mkdir -p media
for clip in 01-create-workspace 02-move-window 03-create-at-ends; do
    python3 scripts/caption-demo.py "$scratch/frames/$clip"
    ffmpeg -hide_banner -loglevel error -y -framerate 12 -i "$scratch/frames/$clip/captioned/%05d.png" \
        -filter_complex '[0:v]scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3' \
        -loop 0 "media/$clip.gif"
done
printf 'Created GIFs in %s/media\nRaw capture: %s\n' "$project" "$scratch"
