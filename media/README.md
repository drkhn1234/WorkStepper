# WorkStepper demos

These GIFs record real WorkStepper shortcuts in an isolated GNOME Shell 51 session. The sample windows contain fictional content. Captions are added outside the desktop capture.

To record them again:

```sh
bash scripts/record-demos.sh
```

Requires GNOME Shell 51 with headless support, Python 3 with PyGObject and Pillow, GTK 4, libadwaita, FFmpeg, Fontconfig, and the extension's usual build tools. The script uses private settings and does not modify the running desktop. Raw frames and logs go into the ignored `research/` directory.

For readability, the demos use a 650 ms hold threshold and open Overview after moving a window. The extension defaults are 175 ms and no view opening after a window move; both are configurable.
