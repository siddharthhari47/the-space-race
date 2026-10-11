"""Pack NASA's Lunar Module into the format the page's renderer reads.

    python tools/build-lm.py <Apollo Lunar Module.glb> <out dir> [triangles]

WHY THERE IS A SECOND MODEL AT ALL

The homepage flies a Saturn V, and for the first three hundred and sixty
seconds of the mission that is the whole vehicle. It is not what lands. What
lands is seven metres of the hundred and eleven, carried folded inside the
adapter for the ride up, and it looks nothing like the rocket around it --
which is the point of showing it. A page that lands a Saturn V on the Moon
has told the viewer something false about the one part of the mission
everybody already knows the shape of.

THE SOURCE

NASA 3D Resources, "Apollo Lunar Module", downloaded from the agency's own
repository at github.com/nasa/NASA-3D-Resources. It is one glTF binary,
ninety-seven thousand triangles across a hundred and fifty-seven primitives,
with the geometry Draco-compressed -- so tools/gltf.py carries a decoder that
the Saturn V's STLs never needed.

SCALE

The model is not dimensioned. Its own units put it 5.012 tall and 6.43 across
the footpads, a ratio of 1.28 against the real vehicle's 1.35, so no single
number makes both dimensions right and one of them has to be chosen. Height
wins: the Lunar Module in this page stands on a horizon with nothing beside
it to judge width against, and its height is what sets it against the
kilometres either side. Scaled so that it is 6.985 m tall the footpads come
out 8.96 m apart against a published 9.4 -- five per cent narrow, in a
silhouette a hundred pixels wide.

THE FRAME

Output is +Y up, +Y being the direction the docking hatch faces, with the
origin at the vehicle's own mid-height rather than at its feet. That is not
tidiness. This spacecraft is drawn in two attitudes: nose-forward and
inverted while it is docked to the command module for the coast out, and
upright on its legs for the descent and the landing. A model centred on its
mid-height turns between the two with a half-turn about a horizontal axis and
nothing else -- no compensating translation, and so nothing to get wrong at
the two ends of a rotation that is animated between them.
"""
import json
import math
import os
import struct
import sys

import numpy as np

import gltf
from meshkit import pack, reduce_to, shade, weld

# 22 ft 11 in tall with the legs extended, and 31 ft diagonally across the
# extended landing gear: Grumman, Apollo News Reference, "Lunar Module Quick
# Reference Data", p. LV-1. The Apollo 11 press kit (p. 96) and NASA SP-4029,
# Apollo by the Numbers (p. 276, 22.917 ft), give the same two figures. The
# span in metres is NSSDCA's, from its Apollo 11 LM entry (1969-059C): 9.4 m
# between the ends of the footpads on opposite legs.
HEIGHT_M = 22.917 * 0.3048  # 6.985
GEAR_SPAN_M = 9.4

# Triangles in the finished model. The Saturn V gets about eleven thousand
# for a hundred and eleven metres of vehicle seen mostly from far enough
# away to be a sliver. This is seven metres of vehicle that ends the page
# filling the frame, so it gets nearly as many for a fifteenth of the size.
DEFAULT_TARGET = 6000

# Nothing is reduced below this many triangles, and nothing already at or
# under it is touched at all. A hundred and fifty-seven primitives at a
# proportional share of six thousand hands some of them a budget of five,
# and a quadric decimator given five triangles returns a shard. Handrails,
# docking targets, antenna dishes and thruster bells are all small parts of
# a small vehicle, and they are most of what says Lunar Module rather than
# box. The floor is what the finished triangle count actually lands on --
# the count below comes out well above the target, because most of these
# hundred and fifty-seven pieces are already smaller than their share.
FLOOR = 30

# Same threshold as the Saturn V, and for the same reason: the tanks and
# bells want smoothing, the descent stage's panelled flanks do not.
SMOOTH_ANGLE_DEG = 46.0


def main():
    if len(sys.argv) not in (3, 4):
        sys.exit(__doc__.strip().splitlines()[2].strip())
    src, out_dir = sys.argv[1], sys.argv[2]
    target = int(sys.argv[3]) if len(sys.argv) == 4 else DEFAULT_TARGET
    os.makedirs(out_dir, exist_ok=True)

    _, prims = gltf.triangles(src)
    source_total = sum(len(t) for _, _, t in prims)

    # Measure before scaling: the file's own units, the file's own frame.
    everything = np.concatenate([t.reshape(-1, 3) for _, _, t in prims], axis=0)
    lo = everything.min(axis=0)
    hi = everything.max(axis=0)
    scale = HEIGHT_M / (hi[1] - lo[1])
    centre = np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2])

    # Proportional budget, floored. Parts already under the floor are passed
    # through untouched rather than reduced to it.
    share = target / source_total
    reduced = []
    for name, _material, tri in prims:
        placed = (tri.reshape(-1, 3) - centre) * scale
        placed = placed.reshape(-1, 3, 3)
        extent = float(np.ptp(placed.reshape(-1, 3), axis=0).max())
        verts, faces = weld(placed, max(extent, 1e-6) * 2e-5)
        if len(faces) > FLOOR:
            verts, faces = reduce_to(verts, faces, max(FLOOR, int(len(faces) * share)))
        reduced.append(verts[faces])

    tri = np.concatenate(reduced, axis=0)
    extent = float(np.ptp(tri.reshape(-1, 3), axis=0).max())
    verts, faces = weld(tri, extent * 2e-5)
    pos, nrm, idx = shade(verts, faces, SMOOTH_ANGLE_DEG)
    meta, qp, qn, qi = pack("lm", pos, nrm, idx)

    blobs = []
    offset = 0
    for key, blob in (("pos", qp), ("nrm", qn), ("idx", qi)):
        padding = (-offset) % 4
        if padding:
            blobs.append(b"\0" * padding)
            offset += padding
        meta[key] = offset
        blobs.append(blob)
        offset += len(blob)

    span = np.array(meta["max"]) - np.array(meta["min"])
    header = json.dumps({
        "format": "SATV1",
        "units": "metres",
        "frame": "+Y towards the docking hatch, origin at the vehicle's mid-height on its own axis",
        "totalHeight": HEIGHT_M,
        "source": "NASA 3D Resources, Apollo Lunar Module. Credit: NASA/Michael D. Carbajal. "
                  "https://science.nasa.gov/3d-resources/apollo-lunar-module/ (mirrored at "
                  "https://github.com/nasa/NASA-3D-Resources). Generally not subject to "
                  "copyright in the US, per NASA's Images and Media Usage Guidelines.",
        "parts": [meta],
    }, separators=(",", ":")).encode("utf-8")
    header += b" " * ((-len(header)) % 4)

    path = os.path.join(out_dir, "lm.bin")
    with open(path, "wb") as f:
        f.write(b"SATV")
        f.write(struct.pack("<I", len(header)))
        f.write(header)
        f.write(b"".join(blobs))

    print(f"{path}  {os.path.getsize(path):,} bytes")
    print(f"  primitives   {len(prims)}")
    print(f"  triangles    {source_total:,} -> {meta['triangles']:,}")
    print(f"  vertices     {meta['count']:,}")
    print(f"  height       {span[1]:.3f} m   (asked for {HEIGHT_M})")
    print(f"  gear span    {span[0]:.3f} x {span[2]:.3f} m   (real {GEAR_SPAN_M})")
    print(f"  y range      {meta['min'][1]:+.3f} .. {meta['max'][1]:+.3f}")


if __name__ == "__main__":
    main()
