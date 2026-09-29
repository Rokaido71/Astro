"""Export the approved symbol as a white transparent Windows icon.

Optional asset tooling only: Python 3 + Pillow. Run from any directory.
The application and normal build do not require Python or Pillow.
"""
from collections import deque
from hashlib import sha256
from pathlib import Path
import json
from PIL import Image, ImageFilter

BRAND = Path(__file__).resolve().parent.parent / 'assets' / 'brand'
SOURCE = BRAND / 'astro-logo-approved.png'
EXPECTED = '64858b2ecb8eed297c149a39f9f15054a098c066632d5c020a2be05e635d0e71'
SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]


def export():
    if sha256(SOURCE.read_bytes()).hexdigest() != EXPECTED:
        raise ValueError('Approved source changed; inspect its symbol before export')
    # This viewport contains the full symbol and a tiny fragment of the letter A.
    # Connected components isolate the three approved shapes without redrawing.
    source = Image.open(SOURCE).convert('L').crop((116, 244, 740, 618))
    width, height = source.size
    pixels = list(source.tobytes())
    pending = {i for i, value in enumerate(pixels) if value < 128}
    components = []
    while pending:
        seed = pending.pop()
        queue, component = deque([seed]), [seed]
        while queue:
            index = queue.popleft()
            x, y = index % width, index // width
            for nx, ny in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
                if 0 <= nx < width and 0 <= ny < height:
                    neighbour = ny * width + nx
                    if neighbour in pending:
                        pending.remove(neighbour)
                        queue.append(neighbour)
                        component.append(neighbour)
        if len(component) >= 2000:
            components.append(component)
    if len(components) != 3:
        raise ValueError(f'Expected three symbol components, found {len(components)}')
    mask_data = [0] * (width * height)
    for component in components:
        for index in component:
            mask_data[index] = 255
    mask = Image.new('L', source.size)
    mask.putdata(mask_data)
    # Include the original antialiased edge, excluding background texture.
    expanded = list(mask.filter(ImageFilter.MaxFilter(5)).tobytes())
    alpha = Image.new('L', source.size)
    alpha.putdata([round(255 * max(0, min(1, (245-value)/229))) if expanded[i] else 0
                   for i, value in enumerate(pixels)])
    bounds = alpha.getbbox()
    alpha = alpha.crop(bounds)
    side = 1024
    # Exactly 2.5% margin on each side of the longest dimension.
    target = round(side * .95)
    scale = target / max(alpha.size)
    alpha = alpha.resize(tuple(round(n * scale) for n in alpha.size), Image.Resampling.LANCZOS)
    canvas = Image.new('L', (side, side), 0)
    canvas.paste(alpha, ((side-alpha.width)//2, (side-alpha.height)//2))
    icon = Image.new('RGBA', canvas.size, (255, 255, 255, 0))
    icon.putalpha(canvas)
    icon.save(BRAND / 'astro-taskbar-white.png')
    icon.save(BRAND / 'astro.ico', sizes=[(size, size) for size in SIZES])
    print(json.dumps({'sourceBounds': bounds, 'components': [len(c) for c in components],
                      'outputBounds': canvas.getbbox(), 'sizes': SIZES,
                      'alphaExtrema': canvas.getextrema()}))


if __name__ == '__main__':
    export()
