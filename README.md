# WorkStepper

Create, move between, and close GNOME workspaces with customizable shortcuts.

| Shortcut | Tap | Hold |
| --- | --- | --- |
| Super + Backspace / Enter | Create or reuse a workspace to the left / right | Create or reuse one at the far left / right |
| Super + Shift + Backspace / Enter | Move the focused window with you | Move it to a workspace at the far left / right |
| Super + Delete | Close the workspace and keep its windows | Close the workspace and its windows |

Empty workspaces are reused. Closing windows respects unsaved-work prompts.

In preferences, change shortcuts, the window-moving modifier, and the hold duration. Choose whether Overview, App Grid, or nothing opens after switching workspaces.

## Install

Requires GNOME Shell 51, Node.js, GJS, `glib-compile-schemas`, and `gnome-extensions`.

```sh
git clone https://github.com/drkhn1234/WorkStepper.git
cd WorkStepper
npm run pack
gnome-extensions install --force dist/workspace-step@drkhn.shell-extension.zip
gnome-extensions enable workspace-step@drkhn
```

Log out and back in if GNOME does not discover the extension. Open its settings with `gnome-extensions prefs workspace-step@drkhn`.

## Development

Run `npm test` for the automated tests. `npm run test:shell` runs the optional isolated GNOME Shell tests; it also requires Python 3, PyGObject, GTK 4, and libadwaita.

Licensed under [GPL-3.0-or-later](LICENSE).
