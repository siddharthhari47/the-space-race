"""Prepare desktop lunar maps from NASA SVS CGI Moon Kit, item 4720.

Sources: https://svs.gsfc.nasa.gov/4720/ (NASA's Scientific Visualization Studio)
2019 LROC colour mosaic: 4096x2048, centred on longitude zero.
LOLA ldem_16_uint: 5760x2880, unsigned half metres above 1727.4 km.
Normals describe real elevation gradients; the rendered contact sphere remains
1737.4 km. Downloads stay in the ignored scratch directory. No invented terrain
is baked into either map. Run with Python, Pillow and NumPy.
"""
from pathlib import Path
from urllib.request import urlretrieve
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SCRATCH = ROOT / "tools" / "scratch"
OUT = ROOT / "public" / "assets" / "textures"
BASE = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/"
SCRATCH.mkdir(exist_ok=True)
for name in ("lroc_color_poles_4k.tif", "ldem_16_uint.tif"):
    path = SCRATCH / name
    if not path.exists():
        urlretrieve(BASE + name, path)
    print(name, path.stat().st_size, flush=True)

Image.open(SCRATCH / "lroc_color_poles_4k.tif").convert("RGB").save(
    OUT / "moon-color-4k.webp", quality=90, method=6)
dem = Image.open(SCRATCH / "ldem_16_uint.tif").convert("F").resize((2880, 1440), Image.Resampling.BILINEAR)
h = np.asarray(dem, dtype=np.float64) * 0.0005 - 10
lat = np.pi / 2 - (np.arange(h.shape[0]) + 0.5) * np.pi / h.shape[0]
east = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) / (4 * np.pi / h.shape[1])
east /= 1737.4 * np.maximum(np.cos(lat[:, None]), 0.01)
north = np.gradient(h, -np.pi / h.shape[0], axis=0) / 1737.4
n = np.stack((-east, -north, np.ones_like(h)), axis=-1)
n /= np.linalg.norm(n, axis=-1, keepdims=True)
Image.fromarray(np.rint((n * 0.5 + 0.5) * 255).clip(0,255).astype(np.uint8)).save(
    OUT / "moon-normal-3k.webp", lossless=True, method=6)
for name in ("moon-color-4k.webp", "moon-normal-3k.webp"):
    print(name, (OUT / name).stat().st_size, flush=True)
