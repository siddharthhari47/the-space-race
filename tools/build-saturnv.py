"""Turn NASA's 3D-printable Saturn V into the geometry the Apollo layer ships.

WHERE THIS COMES FROM

  Saturn V Rocket.zip   3,306,320 bytes
    NASA Science 3D Resources, "Saturn V Rocket".
    https://science.nasa.gov/3d-resources/saturn-v-rocket/
    https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/printable/saturn-v-rocket/Saturn%20V%20Rocket.zip

  Twelve binary STL files, 165,560 triangles in total. NASA content is
  generally not subject to copyright in the United States and may be used
  for educational purposes without explicit permission, provided NASA is
  acknowledged as the source; /references/index.html does that. The NASA
  insignia and logotype are separately protected and are not used anywhere
  on this site.

  The byte count is part of the citation, not decoration: it is how a
  downloaded file gets matched back to the URL it came from.

WHY THIS MODEL AND NOT A PROCEDURAL ONE

  The plan called for building the vehicle from published dimensions,
  because the CC-licensed Sketchfab model named in the brief turned out to
  be behind a login. That plan is superseded: NASA publishes its own Saturn
  V, it is public domain, and -- the part that actually decided it -- it
  arrives already cut into pieces at very nearly the planes the vehicle
  really separates at. There is an "S-IC bottom", an "S-IC top", a
  "stage 1-2 coupler" which is the interstage, an "S-II", an "S-IV b", a
  "lem shroud", a "service module", a "command moduel" [sic], an "escape
  tower", and one fin to be printed four times. Staging is the entire point
  of this sequence, and a model that is already separated where the rocket
  separates is worth more than one whose proportions are exact.

  It is a printable model, so it is a representation and not an engineering
  drawing. Measured against the published figures it is close but not
  exact: the S-IC comes out about three per cent short, the visible S-II
  and the interstage land within half a metre of their real lengths. The
  references page says this is NASA's printable model rather than implying
  it is dimensionally authoritative.

WHAT THIS SCRIPT HAS TO DO

  1. Reassemble it. The parts are not all in one coordinate system. Seven
     of them are still in assembly position, sharing an axis at about
     (0, +8.8) in the file's units, with the nose toward -Y. The S-IC's two
     halves, a second copy of the coupler and the fin were re-exported for
     printing: moved onto the origin, and in the fin's case shoved off to
     one side. They have to be put back.

  2. Cut the triangle count. 165,560 triangles is around four megabytes of
     buffers, for an object that is never more than about a hundred and
     eighty pixels tall. Quadric decimation to roughly a tenth of that is
     invisible at that size and is the difference between a homepage that
     loads and one that does not.

  3. Group by what separates. The output has five bodies, and they are
     five because that is how many things move independently during the
     ascent -- the same five that src/apollo/flight.js tracks. Anything
     that never comes apart from anything else is merged, because each
     body is a draw call.

  4. Quantise and pack. Positions as 16-bit integers against a per-body
     scale, normals as signed bytes. At this size the quantisation error
     is well under a thousandth of a pixel.

  No UVs are produced and none are needed. The black and white roll pattern
  is the single strongest recognition cue on a Saturn V at small sizes, and
  it is defined in cylindrical coordinates on the real vehicle -- bands at
  particular heights, quadrants at particular angles. The shader derives
  exactly those coordinates from object-space position, which is both
  cheaper than storing UVs and a better fit than any unwrap would be.

TWO BUILDS FROM THE SAME SOURCE

  The budget below was set for a vehicle that is "never more than about a
  hundred and eighty pixels tall", which was true until the Saturn V
  interlude put it across the whole window at roughly thirty pixels per
  metre. At that size the decimation is not invisible any more: the roll
  pattern's edges come apart into needles and the seam between the S-IC and
  the interstage grows a fringe. Neither is a shader bug. They are what
  four thousand triangles look like when you stand close enough.

  So the script builds either one. With no third argument it writes
  saturnv.bin, the flight model, unchanged. Given a multiplier -- or the
  word "full", which is no decimation at all -- it writes
  saturnv-detail.bin, which the interlude loads on its own and only on a
  viewport wide enough to be showing it. A budget above a part's own
  triangle count is not an error; the part simply comes through whole.

  What ships is "full", and that was decided by looking rather than by
  taste. At eight times the budget the tanks and the service module came
  good but the S-IC's forward skirt did not change at all, because that part
  stalls: quadric decimation on a long smooth cylinder finds almost no error
  in collapsing one ring of vertices into the next, so it runs past the
  target and stops when it stops moving, at about six and a half thousand
  triangles either way. Those triangles are metres long and a few
  centimetres wide, their interpolated normals are nonsense, and what they
  draw is a bundle of pale needles lying along the skin. Nothing but the
  full mesh removes them, and the full mesh is two megabytes, so that is
  what the interlude loads.

Run:  python tools/build-saturnv.py <src-zip-or-dir> <out-dir> [detail-multiplier|full]
"""

import json
import math
import os
import struct
import sys
import zipfile

import numpy as np

try:
    from meshkit import pack, reduce_to, shade, weld
except ImportError:  # pragma: no cover
    sys.exit("needs fast-simplification:  python -m pip install fast-simplification")


# --------------------------------------------------------------------------
# Reassembly
# --------------------------------------------------------------------------
#
# Everything below is in the STL files' own units, in their own frame, where
# -Y points at the nose. The numbers are measured, not guessed: each part's
# radius profile along its axis was sampled to find the barrel diameter and
# the plug-and-socket joints, and the joints are what set the offsets.
#
# The two that needed deciding rather than measuring:
#
#   The S-IC is absent from the assembled group, so it is placed. Its
#   forward end carries an 18-unit plug whose radius, 38.5, matches the bore
#   the coupler presents at both ends, so it goes 18 units up inside the
#   coupler. Its two halves mate at a lip-and-socket pair that both show the
#   same signature -- an outer flange at radius 47.2 around a recess at 32.8
#   -- so they butt.
#
#   The fin's radial position is already right in the file. Its root sits at
#   radius 46.5 against a 44.4 barrel and its tip at 91.3, which is a span
#   of 182.7 units, about 66 feet against the real 63. Only its height along
#   the vehicle needed moving, down to the engine plane where the fins
#   actually are.

PRINT_FRAME_AXIS = {
    # The seven parts still in assembly position share this axis.
    "assembled": (0.0, 8.8),
    # The four re-exported for printing were moved onto the origin.
    "reposed": (0.0, 0.0),
}

# name -> (axis group, Y shift in print units, extra rotation about the axis)
PLACEMENT = [
    ("escape tower",        "assembled",   0.0,   0.0),
    ("command moduel",      "assembled",   0.0,   0.0),
    ("service module",      "assembled",   0.0,   0.0),
    ("lem shroud",          "assembled",   0.0,   0.0),
    ("S-IV b",              "assembled",   0.0,   0.0),
    ("S-II",                "assembled",   0.0,   0.0),
    ("stage 1-2 coupler",   "assembled",   0.0,   0.0),
    # Forward end of the S-IC goes 18 units up inside the coupler, whose aft
    # face is at 436.80. The part's own plug end is at -78.51.
    ("S-IC top",            "reposed",   497.31,  0.0),
    # And the aft half butts onto the forward half's other end, at +88.81.
    ("S-IC bottom",         "reposed",   586.12,  0.0),
    # Four fins, trailing edges on the engine plane at 789.20.
    ("fin (print 4)",       "reposed",   641.03,  0.0),
    ("fin (print 4)",       "reposed",   641.03,  90.0),
    ("fin (print 4)",       "reposed",   641.03, 180.0),
    ("fin (print 4)",       "reposed",   641.03, 270.0),
]

# Print-frame Y of the two ends of the assembled stack. -Y is up, so the
# first number is the tip of the escape tower and the second is the plane
# the F-1 bells hang below.
TOWER_TIP_Y = -216.03
ENGINE_PLANE_Y = 789.20

# NASA, "What Was the Saturn V? (Grades 5-8)": "The Saturn V rocket was 111
# meters (363 feet) tall". The finer figure, 110.6 m, is the one carried in
# src/apollo/flight.js as STACK_HEIGHT_M and the model is scaled to it so
# that the two agree.
TOTAL_HEIGHT_M = 110.6

# Which STL goes in which separable body. Six, because six things come apart
# from each other over the mission -- five during the ascent, and then one
# more three days later.
#
# The S-IVB and the command and service module used to be one body, on the
# reasoning that nothing separated them before the page ended. The page now
# goes to the Moon, and out there they do: the S-IVB is left behind a few
# hours after translunar injection, and the CSM is left behind in lunar orbit
# when the lander undocks. The adapter that housed the Lunar Module goes with
# the S-IVB, which is where it stayed in the real sequence -- it is the S-IVB
# that the panels are hinged to, not the spacecraft.
BODIES = {
    "sic":        ["S-IC bottom", "S-IC top", "fin (print 4)"],
    "interstage": ["stage 1-2 coupler"],
    "sii":        ["S-II"],
    "sivb":       ["S-IV b", "lem shroud"],
    "csm":        ["service module", "command moduel"],
    "tower":      ["escape tower"],
}

# Triangles to keep, per source part -- per part, not per body, and that
# distinction is worth more than it looks. Handed a body made of several
# disconnected shells, the decimator stalls: it got the S-IC from 53,000 to
# 18,700 and then would not move, no matter how many passes or how high the
# aggressiveness. Handed the same shells one at a time it goes to 8,000
# without complaint. So each part is reduced alone and the results are
# merged afterwards.
#
# The numbers are set by what each part has to hold on to at a hundred-odd
# pixels. The S-IC's aft end carries the engine fairings and five F-1 bells
# and gets a third of the whole budget; the tanks above it are tubes and get
# almost nothing; the escape tower is a thin lattice, which is the first
# thing any decimator eats, so it gets more than its screen area deserves.
BUDGET = {
    "S-IC bottom": 4000,
    "S-IC top": 400,
    "fin (print 4)": 66,
    "stage 1-2 coupler": 500,
    "S-II": 700,
    "S-IV b": 900,
    "lem shroud": 400,
    "service module": 1600,
    "command moduel": 600,
    "escape tower": 2400,
}

# Parts whose hidden interior is NOT removed before decimating. Only the
# fins: a fin is a flat plate, so its two faces sit at the same height and
# nearly the same angle, and the cull below -- which keeps the outermost
# surface in each cell of a cylindrical grid -- would keep one side and
# throw away the other. They are sixty-six triangles each. Nothing to save.
NO_CULL = {"fin (print 4)"}

# Beyond this angle between two faces, the edge between them is drawn hard
# instead of smoothed. Cylinders want smoothing; the flange at the bottom of
# a skirt does not.
SMOOTH_ANGLE_DEG = 46.0


def read_stl(path):
    """Binary STL -> (n, 3, 3) float32 array of triangle corners."""
    with open(path, "rb") as f:
        header = f.read(84)
        if len(header) < 84:
            raise ValueError(f"{path}: too short to be a binary STL")
        count = struct.unpack("<I", header[80:84])[0]
        body = f.read(count * 50)
    if len(body) != count * 50:
        raise ValueError(f"{path}: not a binary STL, or truncated")
    raw = np.frombuffer(body, dtype=np.uint8).reshape(count, 50)
    return raw[:, 12:48].copy().view("<f4").reshape(count, 3, 3)


def collect(src_dir):
    """Every placed part, as a list of (body, part name, world-frame soup)."""
    scale = TOTAL_HEIGHT_M / (ENGINE_PLANE_Y - TOWER_TIP_Y)
    placed = []
    where = {stl: body for body, stls in BODIES.items() for stl in stls}

    for stl_name, axis_group, dy, spin_deg in PLACEMENT:
        tri = read_stl(os.path.join(src_dir, stl_name + ".stl")).reshape(-1, 3).astype(np.float64)

        ax, az = PRINT_FRAME_AXIS[axis_group]
        x = tri[:, 0] - ax
        z = tri[:, 2] - az
        y = tri[:, 1] + dy

        if spin_deg:
            a = math.radians(spin_deg)
            ca, sa = math.cos(a), math.sin(a)
            x, z = x * ca - z * sa, x * sa + z * ca

        # Into the frame the renderer wants: +Y up, origin on the engine
        # plane, metres. Flipping Y reverses triangle winding, so Z is
        # negated as well -- two reflections are a rotation, and the winding
        # survives.
        out = np.empty_like(tri)
        out[:, 0] = x * scale
        out[:, 1] = (ENGINE_PLANE_Y - y) * scale
        out[:, 2] = -z * scale
        placed.append((where[stl_name], stl_name, out.reshape(-1, 3, 3)))

    return placed


def shell_cull(verts, faces, ny=110, nt=96, slack=0.90):
    """Throw away the surfaces nothing can see.

    These are printable parts, so they are shells with walls, sockets, ribs
    and mating features on the inside. None of it is ever visible on a
    rocket a hundred and fifty pixels tall, and all of it costs triangles --
    but worse than that, it is what stops the decimator working. Interior
    walls meet exterior ones along non-manifold edges, and a quadric
    decimator will not collapse those, which is why the S-IC would not go
    below eighteen thousand triangles however hard it was pushed. Remove the
    inside and the same part reduces to whatever is asked for.

    The test is cylindrical because the subject is: bin every face by height
    and angle about the vehicle's axis, and in each bin keep only what lies
    at the outermost radius. A lattice strut on the escape tower survives,
    because at the angle where the strut is, the strut is the outermost
    thing. The socket behind it does not.

    This leaves open shells, which is correct -- they are drawn front-side
    only and the back of a surface is never seen.

    The grid is coarse and the slack is loose, and both were measured rather
    than chosen. A cull can eat real surface as well as hidden surface, and
    the way to see that is to rasterise the finished model and count the
    background pixels that are not connected to the border -- a pixel you
    can see through that should be rocket. Sweeping the settings against
    that number: a fine grid at 0.985 removes the most, and triples the
    holes, from 265 to 825. This setting removes twelve per cent of the
    triangles for 264 holes, which is the no-cull baseline to within one
    pixel. Tighter than this buys triangles by punching holes, and the
    triangles are not worth it."""
    c = verts[faces].mean(axis=1)
    r = np.hypot(c[:, 0], c[:, 2])
    theta = np.arctan2(c[:, 2], c[:, 0])

    y0, y1 = verts[:, 1].min(), verts[:, 1].max()
    iy = np.clip(((c[:, 1] - y0) / max(y1 - y0, 1e-9) * ny).astype(np.int64), 0, ny - 1)
    it = np.clip(((theta + math.pi) / (2 * math.pi) * nt).astype(np.int64), 0, nt - 1)
    cell = iy * nt + it

    outermost = np.zeros(ny * nt)
    np.maximum.at(outermost, cell, r)
    return faces[r >= outermost[cell] * slack]


def main():
    if len(sys.argv) not in (3, 4):
        sys.exit(__doc__.strip().splitlines()[-1])
    src, out_dir = sys.argv[1], sys.argv[2]
    arg = sys.argv[3] if len(sys.argv) == 4 else "1"
    detail = math.inf if arg.lower() == "full" else float(arg)
    budget = {k: (v if detail == 1.0 else max(v, int(min(v * detail, 1e9))))
              for k, v in BUDGET.items()}

    if os.path.isfile(src) and src.lower().endswith(".zip"):
        work = os.path.join(out_dir, "_stl")
        os.makedirs(work, exist_ok=True)
        zipfile.ZipFile(src).extractall(work)
        src = work
    os.makedirs(out_dir, exist_ok=True)

    placed = collect(src)

    # Reduce every part on its own, then merge the survivors into their body.
    reduced = {name: [] for name in BODIES}
    report = []
    for body, stl_name, tri in placed:
        extent = float(np.ptp(tri.reshape(-1, 3), axis=0).max())
        verts, faces = weld(tri, extent * 2e-5)

        # Slivers first. A triangle a thousandth of the average area carries
        # no shape and does hold edges hostage.
        area = 0.5 * np.linalg.norm(
            np.cross(verts[faces[:, 1]] - verts[faces[:, 0]],
                     verts[faces[:, 2]] - verts[faces[:, 0]]), axis=1)
        faces = faces[area > area.mean() * 1e-3]

        source = len(faces)
        # The detail build keeps the interior. The cull exists to spend
        # fewer triangles on surfaces nobody sees, and it pays for that with
        # holes: it keeps whatever is outermost in each cell of a
        # cylindrical grid, which on the F-1 cluster means the five bells
        # are reduced to whichever fragments of whichever nozzle happened to
        # be furthest out, and what draws is a spray of pale needles where
        # the engines should be. A build that is not saving triangles has no
        # reason to pay that, and the depth buffer hides the interior for
        # free.
        if detail == 1.0 and stl_name not in NO_CULL:
            faces = shell_cull(verts, faces)
        culled = len(faces)

        verts, faces = reduce_to(verts, faces, budget[stl_name])
        reduced[body].append(verts[faces])
        report.append((body, stl_name, source, culled, len(faces)))

    blobs = []
    parts = []
    offset = 0
    bodies = []

    for name in ["sic", "interstage", "sii", "sivb", "csm", "tower"]:
        tri = np.concatenate(reduced[name], axis=0)
        extent = float(np.ptp(tri.reshape(-1, 3), axis=0).max())
        verts, faces = weld(tri, extent * 2e-5)
        pos, nrm, idx = shade(verts, faces, SMOOTH_ANGLE_DEG)
        meta, qp, qn, qi = pack(name, pos, nrm, idx)

        for key, blob in (("pos", qp), ("nrm", qn), ("idx", qi)):
            pad = (-offset) % 4
            if pad:
                blobs.append(b"\0" * pad)
                offset += pad
            meta[key] = offset
            blobs.append(blob)
            offset += len(blob)

        parts.append(meta)
        bodies.append((name, meta["triangles"], meta["count"], meta["min"][1], meta["max"][1]))

    binary = b"".join(blobs)
    header = json.dumps({
        "format": "SATV1",
        "units": "metres",
        "frame": "+Y up, origin on the engine plane, +X and +Z through the vehicle's own quadrants",
        "totalHeight": TOTAL_HEIGHT_M,
        "source": "NASA Science 3D Resources, Saturn V Rocket (public domain). https://science.nasa.gov/3d-resources/saturn-v-rocket/",
        "parts": parts,
    }, separators=(",", ":")).encode("utf-8")
    header += b" " * ((-len(header)) % 4)

    name = "saturnv.bin" if detail == 1.0 else "saturnv-detail.bin"
    if detail != 1.0:
        print(f"detail build: budgets x{arg}")
    path = os.path.join(out_dir, name)
    with open(path, "wb") as f:
        f.write(b"SATV")
        f.write(struct.pack("<I", len(header)))
        f.write(header)
        f.write(binary)

    print(f"{path}  {os.path.getsize(path):,} bytes\n")
    print(f"{'body':11s} {'part':20s} {'welded':>8s} {'outer':>8s} {'kept':>7s}")
    for body, stl_name, source, culled, kept in report:
        print(f"{body:11s} {stl_name:20s} {source:8,d} {culled:8,d} {kept:7,d}")
    print()
    print(f"{'body':11s} {'tris':>8s} {'verts':>8s}   {'Y range (m)':>18s}")
    total = 0
    for name, tris, verts, y0, y1 in bodies:
        total += tris
        print(f"{name:11s} {tris:8,d} {verts:8,d}   {y0:8.2f} .. {y1:7.2f}")
    print(f"{'total':11s} {total:8,d}")


if __name__ == "__main__":
    main()
