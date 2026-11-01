"""Add promotional captions outside the unmodified GNOME desktop capture."""
import json
from pathlib import Path
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont

directory = Path(sys.argv[1])
def font(size, bold=False):
    family = 'sans:style=Bold' if bold else 'sans'
    path = subprocess.check_output(['fc-match', '-f', '%{file}', family], text=True)
    return ImageFont.truetype(path, size)

title_font, detail_font, key_font = font(27, True), font(19), font(23, True)
captions = json.loads((directory / 'captions.json').read_text())
output = directory / 'captioned'
output.mkdir(exist_ok=True)
for index, caption in enumerate(captions):
    with Image.open(directory / f'{index:05d}.png') as desktop:
        canvas = Image.new('RGB', (1280, 1008), '#111827')
        canvas.paste(desktop, (0, 128))
        draw = ImageDraw.Draw(canvas)
        draw.text((32, 22), caption['title'], font=title_font, fill='#f5f7ff')
        draw.text((32, 70), caption['detail'], font=detail_font, fill='#b7c3d8')
        draw.line((0, 127, 1280, 127), fill='#5368a3', width=2)
        draw.line((0, 928, 1280, 928), fill='#5368a3', width=2)
        draw.text((32, 950), caption['key'].replace('→', '/'), font=key_font, fill='#c5d4ff')
        canvas.save(output / f'{index:05d}.png')
