"""Turn NASA's CGI Moon Kit model into the equirectangular texture the lunar act ships.

The Moon is drawn the same way the Earth is: a sphere with a colour map on it.
That is a deliberate choice over shipping NASA's mesh. The smallest published
model, moon_small.glb, is 13.2 MB, and 12.2 MB of that is a single texture -
the geometry itself is only 23,232 triangles. Nearly all of the download buys
displacement of about +/-0.8% of the radius, which at the size the Moon is
drawn here is well under a pixel of silhouette. So the texture is worth
having and the mesh is not.

The complication is that the texture is not an equirectangular map. It is a
cube-cross atlas: the model is a subdivided cube, and its 4096x4096 texture
holds six 1024x1024 faces laid out three across and four down. Wrapping that
straight onto a sphere would be nonsense. This script reprojects it.

The six face maps are not guessed. They were fitted by least squares from the
model's own POSITION and TEXCOORD_0 accessors - normalise each vertex to a
direction, classify it to a cube face by its largest component, and solve for
the affine map from face coordinates to UV. All six faces fitted to a maximum
residual of 0.00016 in UV units, which is well under one texel, and every
fitted coefficient landed on the atlas's exact 0.125 lattice. The snapped
values are the ones used below, because the lattice is the true layout and
the small excess in the raw fit is the topographic displacement pulling
vertex directions slightly off the ideal cube-sphere.

Orientation was then confirmed against two landmarks rather than assumed, as
the model carries no stated convention:

  Tycho          measured 43.6 S,  7.7 W    actual 43.3 S, 11.4 W
  Mare Crisium   measured 17 N,   59 E      actual 17.0 N, 59.1 E

Crisium is the decisive one. It is small, round, isolated, and far from the
prime meridian, so a mirrored longitude axis would put it 118 degrees away
inside the Imbrium/Serenitatis mare complex instead of alone on the eastern
limb. Getting both landmarks in the right place fixes the pole, the near-side
hemisphere and the direction of increasing longitude together.

Output: moon-2k.webp, 2048x1024, quality 82 (365 KB).

The Moon is high-frequency crater detail almost everywhere, so it compresses
much worse than the Earth's day map at the same settings - 2k/q88 came to
498 KB against the Earth's 233 KB. Quality 82 is the knee of the curve here:

  q=72   255 KB   PSNR 34.8 dB
  q=78   307 KB   PSNR 36.0 dB
  q=82   365 KB   PSNR 37.3 dB     <- shipped
  q=88   498 KB   PSNR 40.1 dB

The map is rendered at 4096x2048 and reduced to 2048x1024 rather than sampled
straight to 2k. Near the equator the source carries about 4096 texels per 360
degrees, so a 2048-wide output is coarser than its source and point sampling
would alias visibly across the maria. Supersampling and filtering down costs
nothing at build time and removes it.

This is a reprojection, not a NASA equirectangular product. The pixels are
NASA's; the projection, the resolution and the file format are not. It is
credited on /references/index.html regardless.

  Source, downloaded 2 September 2026:
    moon_small.glb  13,799,876 bytes
      NASA Scientific Visualization Studio item 14959, "Moon 3D Models for
      Web, AR, and Animation", released 29 January 2026. Imagery and
      topography from the Lunar Reconnaissance Orbiter.
      https://svs.gsfc.nasa.gov/14959/
      Credit: NASA's Goddard Space Flight Center.
      Producer Dan Gallagher (eMITS); data provider Ernie Wright (USRA).

    The .glb is not committed. It is a 13.8 MB source file that this script
    consumes once; only its extracted, reprojected, re-encoded output ships.
"""

import io
import json
import struct
import sys

import numpy as np
from PIL import Image

SRC_GLB = "moon_small.glb"
OUT = "public/assets/textures/moon-2k.webp"
OUT_W, OUT_H = 2048, 1024
SUPERSAMPLE = 2
QUALITY = 82

# major axis, sign, (minor_a, minor_b), (u from a, u from b, u const), (v from a, v from b, v const)
# s = D[minor_a]/|D[major]|, t = D[minor_b]/|D[major]|
FACES = [
    (0,  1, (1, 2), ( 0.125,  0.000, 0.500), ( 0.000, -0.125, 0.375)),  # +X
    (0, -1, (1, 2), ( 0.125,  0.000, 0.500), ( 0.000,  0.125, 0.875)),  # -X
    (1,  1, (0, 2), (-0.125,  0.000, 0.750), ( 0.000, -0.125, 0.375)),  # +Y
    (1, -1, (0, 2), ( 0.125,  0.000, 0.250), ( 0.000, -0.125, 0.375)),  # -Y
    (2,  1, (0, 1), ( 0.000,  0.125, 0.500), ( 0.125,  0.000, 0.125)),  # +Z
    (2, -1, (0, 1), ( 0.000,  0.125, 0.500), (-0.125,  0.000, 0.625)),  # -Z
]

# Lunar north is model +Y; longitude 0 (the near-side centre) is model -Z.
POLE_AXIS = 2       # 1-based index into (x, y, z), signed
LON0_AXIS = -3


def read_atlas(path):
    """Pull the single diffuse image out of the GLB's BIN chunk."""
    raw = open(path, "rb").read()
    _, _, length = struct.unpack_from("<4sII", raw, 0)
    off, chunks = 12, {}
    while off < length:
        clen, ctype = struct.unpack_from("<II", raw, off)
        off += 8
        chunks[ctype] = raw[off:off + clen]
        off += clen
    gltf = json.loads(chunks[0x4E4F534A].decode("utf-8"))
    binc = chunks[0x004E4942]
    image = gltf["images"][0]
    view = gltf["bufferViews"][image["bufferView"]]
    start = view.get("byteOffset", 0)
    return Image.open(io.BytesIO(binc[start:start + view["byteLength"]])).convert("RGB")


def reproject(src, width, height):
    img = np.asarray(src, dtype=np.float32)
    ih, iw = img.shape[:2]

    lon = (np.arange(width) + 0.5) / width * 2 * np.pi - np.pi
    lat = np.pi / 2 - (np.arange(height) + 0.5) / height * np.pi
    LON, LAT = np.meshgrid(lon, lat)

    north = np.zeros(3); north[abs(POLE_AXIS) - 1] = np.sign(POLE_AXIS)
    prime = np.zeros(3); prime[abs(LON0_AXIS) - 1] = np.sign(LON0_AXIS)
    east = np.cross(north, prime)

    cos_lat = np.cos(LAT)[..., None]
    D = (cos_lat * np.cos(LON)[..., None] * prime
         + cos_lat * np.sin(LON)[..., None] * east
         + np.sin(LAT)[..., None] * north)

    major = np.abs(D).argmax(2)
    out = np.zeros((height, width, 3), np.float32)

    for ax, sg, (ma, mb), (ka, kb, cu), (la, lb, cv) in FACES:
        mask = (major == ax) & (np.sign(D[..., ax]) == sg)
        if not mask.any():
            continue
        d = D[mask]
        denom = np.abs(d[:, ax])
        s, t = d[:, ma] / denom, d[:, mb] / denom
        u = ka * s + kb * t + cu
        v = la * s + lb * t + cv

        x = np.clip(u * iw - 0.5, 0, iw - 1)
        y = np.clip(v * ih - 0.5, 0, ih - 1)
        x0 = np.floor(x).astype(np.int32); y0 = np.floor(y).astype(np.int32)
        x1 = np.minimum(x0 + 1, iw - 1);   y1 = np.minimum(y0 + 1, ih - 1)
        fx, fy = (x - x0)[:, None], (y - y0)[:, None]
        out[mask] = ((img[y0, x0] * (1 - fx) + img[y0, x1] * fx) * (1 - fy)
                     + (img[y1, x0] * (1 - fx) + img[y1, x1] * fx) * fy)

    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def main():
    src = read_atlas(sys.argv[1] if len(sys.argv) > 1 else SRC_GLB)
    if src.size != (4096, 4096):
        raise SystemExit(f"expected a 4096x4096 cube atlas, got {src.size}")
    big = reproject(src, OUT_W * SUPERSAMPLE, OUT_H * SUPERSAMPLE)
    big.resize((OUT_W, OUT_H), Image.LANCZOS).save(OUT, "WEBP", quality=QUALITY, method=6)
    print(f"wrote {OUT}  {OUT_W}x{OUT_H}")


if __name__ == "__main__":
    main()
