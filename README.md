# WorkStepper

A GNOME Shell 51 extension that inserts or reuses an empty workspace directly
beside your current workspace.

Extension ID: `workspace-step@drkhn`.

| Shortcut | Tap | Hold |
| --- | --- | --- |
| Super + Backspace | Create/reuse workspace on the left and switch | Create/reuse empty workspace at far left |
| Super + Enter | Create/reuse workspace on the right and switch | Create/reuse empty workspace at far right |
| Super + Shift + Backspace | Move the focused window left and follow it | Create/reuse empty workspace at far left, move window and follow |
| Super + Shift + Enter | Move the focused window right and follow it | Create/reuse empty workspace at far right, move window and follow |
| Super + Delete | Remove active workspace, keeping its windows | Close workspace and its windows |

All five shortcuts are editable: click a shortcut row and press a new key
combination, or use its reset button to restore the default. The capture window
also lets you disable a shortcut. Conflicts between these actions are rejected.
The titlebar's **Reset All** button restores every WorkStepper setting,
including shortcuts, the modifier, hold duration, and opening preferences.

The **Window-moving modifier** group appears first. Select **Shift** (default),
**Ctrl**, **Alt**, or **None**. A selected modifier derives the two
window-moving shortcuts by adding it to the workspace shortcuts. Those manual
shortcut rows are dimmed and disabled while derived. **None** enables their
independent configuration and restores the saved manual shortcuts. A modifier
already present in a base shortcut cannot be selected because it would produce
an identical chord. Shortcut and modifier changes apply immediately.

The default hold duration is **175 ms**, adjustable from **75 to 2000 ms** in preferences. Short actions
run on key release. A hold runs the long action once and never runs the tap
action. Holding a navigation shortcut reuses the chosen end workspace if it is
empty; otherwise it inserts a new workspace before the first or after the last.
This uses actual occupancy with both dynamic and static workspaces. GNOME's
dynamic trailing empty workspace is reused. An already-active empty end is
reused as well. Releasing a modifier first
also finishes the gesture. Switching away cancels a pending gesture.

Removing a workspace moves its windows to the previous workspace, or the next
one if removing the first. GNOME always keeps a final workspace. A long Delete
requests normal closes only for windows on the captured workspace, leaving
pinned windows and windows on other workspaces open. Unsaved-work dialogs are
honored: the workspace is removed after its windows have closed. Disabling the
extension cancels pending holds and pending workspace removals.

Only the immediately adjacent workspace is reused. An occupied neighbor is
preserved and a new workspace is inserted between it and the current one.
Pinned windows do not make a workspace occupied; minimized windows do.
Moving a pinned window unpins it. Attached dialogs move with their parent.
With workspaces on the primary display only, moving a secondary-monitor window
also brings it to the primary display.

The **After switching workspaces** group contains three independent selectors,
each with **Overview**, **App Grid**, and **None** buttons:

- **Create or reuse a workspace** controls workspace-only creation actions.
- **Create or reuse and move a window** controls creation actions carrying a window,
  including their occupied destination. Its default is None.
- **Other empty-workspace switches** controls ordinary navigation to an empty
  workspace with GNOME shortcuts, workspace buttons, or other extensions.

All apply to switches starting on the desktop. The previous opening preferences
are migrated. Workspace-only creation and other empty navigation default to Overview.

Switching within Overview or App Grid preserves the current view and search
query. Pinned windows do not count as occupancy for the empty-workspace case.
Move shortcuts require a focused
application window and are available outside the overview. Switch shortcuts
also work from the overview.

Workspace actions only create/reuse, move, and switch. A separate observer opens
the chosen view after the desktop workspace slide finishes and releases its
keyboard grab. It cancels opening if you switch elsewhere, open a view yourself,
or a window arrives on the destination before opening.

Dynamic and fixed workspace configurations are supported. GNOME can remove
empty inactive workspaces when dynamic workspaces are enabled; this extension
leaves that normal cleanup policy in place.

The extension is licensed under GPL-3.0-or-later; see LICENSE.

## Install

Requires GNOME Shell 51, Node.js, GJS, `glib-compile-schemas`, and the
`gnome-extensions` command. The optional Shell tests also use Python 3 with
PyGObject, GTK 4, and libadwaita.

```sh
git clone https://github.com/drkhn1234/WorkStepper.git
cd WorkStepper
npm test
npm run test:shell # Optional: isolated GNOME 51 session with real Wayland windows
npm run pack
gnome-extensions install --force dist/workspace-step@drkhn.shell-extension.zip
gnome-extensions enable workspace-step@drkhn
gnome-extensions prefs workspace-step@drkhn
```

GNOME may require logging out and back in to discover a newly installed
extension. On Wayland, do not restart GNOME Shell in place.

## Implementation references

- [GNOME extension structure and preferences](https://gjs.guide/extensions/overview/anatomy.html)
- [Mutter workspace API](https://gnome.pages.gitlab.gnome.org/mutter/meta/class.Workspace.html)
- [GNOME Shell 51 window manager](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/51.0/js/ui/windowManager.js)
- [GNOME Shell 51 overview](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/51.0/js/ui/overview.js)
