"""Turn the NASA source imagery into the web textures the Apollo layer ships.

The sources are large public-domain NASA products (a 5400x2700 Blue Marble
composite, a 3600x1800 Black Marble night composite). Shipping those as-is
would be several megabytes on a homepage, and pointless: the Earth occupies
roughly half a viewport, and only ever shows one hemisphere at a time, so
half of any equirectangular map is facing away from the camera at all times.

What this produces, and why each size:

  earth-day-4k.webp    4096x2048  desktop surface. A hemisphere spans half
                                  the map, so this is ~2048px of texture
                                  across the visible disc - comfortably
                                  more than the ~700px the Earth actually
                                  occupies on a 1440px viewport.
  earth-day-2k.webp    2048x1024  mobile/low-DPR surface, same maths one
                                  step down.
  earth-night-2k.webp  2048x1024  city lights on the terminator's dark
                                  side. Never seen at full brightness, so
                                  it does not need the day map's detail.
  earth-clouds-2k.webp 2048x1024  the cloud composite is natively 2048x1024
                                  and is reduced to a single luminance
                                  channel here - the shader only ever reads
                                  one channel from it, so storing three was
                                  paying for two copies of the same data.

No specular/water mask is generated. Ocean is derived in the fragment shader
from the day map itself (bathymetry makes water strongly blue-dominant while
snow and ice stay achromatic), which is the same information one channel
cheaper.

The three sources, and exactly where each came from. These are recorded
here because the shipped .webp files carry no provenance of their own, and
a texture nobody can trace is a texture nobody can re-derive or credit.
All three are NASA products and in the public domain; the site credits them
on /references/index.html regardless.

  bmng-july-5400.jpg  2,308,798 bytes
    NASA Visible Earth image record 73751, "Blue Marble: Next Generation
    with Topography and Bathymetry" - the July 2004 monthly composite.
    https://visibleearth.nasa.gov/images/73751/
    https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73751/world.topo.bathy.200407.3x5400x2700.jpg

  clouds-2048.jpg       829,367 bytes
    NASA Visible Earth image record 57747, "Blue Marble Clouds".
    https://visibleearth.nasa.gov/images/57747/blue-marble-clouds
    https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg

  night-3600.jpg        794,479 bytes
    NASA Visible Earth image record 79765, "Night Lights 2012 - Flat map",
    from the Suomi NPP VIIRS day/night band.
    https://visibleearth.nasa.gov/images/79765/night-lights-2012-flat-map
    https://eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.3600x1800.jpg

The byte counts are part of the citation, not decoration: they are how a
downloaded file was matched back to the URL it came from.

Run:  python tools/build-earth-textures.py <src-dir> <out-dir>
"""

import os
import sys

from PIL import Image

Image.MAX_IMAGE_PIXELS = None

SRC = sys.argv[1]
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)

# Quality picked by inspection, not by habit: the day map is the only one a
# viewer looks at directly, so it gets the higher setting; the night and
# cloud maps are always composited under something else.
JOBS = [
    ("bmng-july-5400.jpg", "earth-day-4k.webp", (4096, 2048), "RGB", 88),
    ("bmng-july-5400.jpg", "earth-day-2k.webp", (2048, 1024), "RGB", 86),
    ("night-3600.jpg", "earth-night-2k.webp", (2048, 1024), "RGB", 82),
    # Cloud noise is high-frequency and compresses badly, so this one is
    # tuned by measurement rather than by matching the others: q84 cost
    # 485 KB, q72 costs 336 KB, and the difference is invisible under a
    # layer that is soft-edged and slowly drifting by design.
    ("clouds-2048.jpg", "earth-clouds-2k.webp", (2048, 1024), "L", 72),
]

total = 0
for src_name, out_name, size, mode, quality in JOBS:
    src_path = os.path.join(SRC, src_name)
    im = Image.open(src_path)
    src_size = im.size
    im = im.convert("RGB").resize(size, Image.LANCZOS)
    if mode == "L":
        im = im.convert("L")
    out_path = os.path.join(OUT, out_name)
    im.save(out_path, "WEBP", quality=quality, method=6)
    n = os.path.getsize(out_path)
    total += n
    print(f"{src_name} {src_size} -> {out_name} {size} {mode} q{quality}  {n/1024:.0f} KB")

print(f"\ntotal {total/1024:.0f} KB")
