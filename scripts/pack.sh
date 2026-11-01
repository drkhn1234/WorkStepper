#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
glib-compile-schemas --strict extension/schemas
cp LICENSE extension/LICENSE
mkdir -p dist
gnome-extensions pack --force --out-dir=dist --extra-source=workspaceActions.js --extra-source=settings.js --extra-source=shortcuts.js --extra-source=emptyWorkspaceView.js --extra-source=pressGesture.js --extra-source=workspaceCloser.js --extra-source=LICENSE extension
