"""Mesh routines shared by the model builds.

Nothing here knows what it is looking at. build-saturnv.py hands it printable
STL shells and build-lm.py hands it a Draco-compressed glTF, and both want the
same four things done afterwards: rebuild the connectivity, cut the triangle
count, work out which edges are meant to look hard, and quantise the result
into the format src/apollo/vehicle.js reads.

The comments on each function are the reasons they are shaped the way they
are, and every one of them was learned from a model that came out wrong.
"""
import math

import numpy as np

import fast_simplification


def weld(tri, tol):
    """Triangle soup -> (vertices, faces).

    STL stores no connectivity at all, and a glTF file split across a
    hundred and fifty primitives stores it only within each one, so either
    way it has to be rebuilt before anything can decimate or smooth."""
    flat = tri.reshape(-1, 3)
    keys = np.round(flat / tol).astype(np.int64)
    _, first, inverse = np.unique(keys, axis=0, return_index=True, return_inverse=True)
    verts = flat[first]
    faces = inverse.reshape(-1, 3)
    ok = (faces[:, 0] != faces[:, 1]) & (faces[:, 1] != faces[:, 2]) & (faces[:, 0] != faces[:, 2])
    return verts, faces[ok]


def reduce_to(verts, faces, target):
    """Quadric decimation, run to the target or to the point where it stops
    moving.

    Two things had to be learned the hard way here. One call undershoots
    badly on anything with a boundary, and after culling these are all
    boundary. And asking for a big reduction in one call is worse than
    asking for several small ones: a single pass at ninety per cent gives up
    at about forty and then trips the no-progress check, while the same mesh
    walked down in halves reaches the target. So the step is capped well
    below what is being asked for, and the loop is allowed enough passes to
    get there -- twenty-two halvings is a reduction of ten million to one,
    far more headroom than any of these need."""
    for _ in range(22):
        if len(faces) <= target:
            break
        step = min(0.5, max(0.12, 1.0 - target / len(faces)))
        nv, nf = fast_simplification.simplify(
            verts.astype(np.float32), faces.astype(np.int32), step, agg=9
        )
        nv = np.asarray(nv, dtype=np.float64)
        nf = np.asarray(nf, dtype=np.int64)
        if len(nf) >= len(faces) * 0.985:
            break
        verts, faces = nv, nf
    return verts, faces


def shade(verts, faces, angle_deg):
    """Per-corner normals, averaging only across edges softer than the
    threshold, then de-duplicating (position, normal) pairs.

    The naive version -- average every face at a vertex -- rounds off the
    engine fairings and the skirt flanges into soft blobs. The other naive
    version -- one normal per face -- facets the tanks into a polygon at
    twenty-four sides, which at this size reads as a crumpled tube."""
    e1 = verts[faces[:, 1]] - verts[faces[:, 0]]
    e2 = verts[faces[:, 2]] - verts[faces[:, 0]]
    fn = np.cross(e1, e2)
    area = np.linalg.norm(fn, axis=1, keepdims=True)
    unit = fn / np.maximum(area, 1e-20)

    # Area-weighted sum of every face touching each vertex.
    total = np.zeros_like(verts)
    for c in range(3):
        np.add.at(total, faces[:, c], fn)
    tl = np.linalg.norm(total, axis=1, keepdims=True)
    smooth = total / np.maximum(tl, 1e-20)

    # Where a face disagrees with that average by more than the threshold,
    # it keeps its own normal instead: that corner is on a hard edge.
    limit = math.cos(math.radians(angle_deg))
    corner = np.empty((len(faces), 3, 3))
    for c in range(3):
        s = smooth[faces[:, c]]
        agrees = (np.sum(s * unit, axis=1) >= limit)[:, None]
        corner[:, c, :] = np.where(agrees, s, unit)

    pos = verts[faces].reshape(-1, 3)
    nrm = corner.reshape(-1, 3)
    key = np.concatenate([np.round(pos, 4), np.round(nrm, 3)], axis=1)
    _, first, inverse = np.unique(key, axis=0, return_index=True, return_inverse=True)
    return pos[first], nrm[first], inverse.reshape(-1, 3).astype(np.uint32)


def pack(name, pos, nrm, idx):
    """One body, quantised. Positions to 16 bits against the body's own
    bounding box, normals to signed bytes."""
    lo = pos.min(axis=0)
    hi = pos.max(axis=0)
    span = np.maximum(hi - lo, 1e-6)

    q = np.round((pos - lo) / span * 65535.0).astype(np.uint16)
    n = np.clip(np.round(nrm / np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-20) * 127.0), -127, 127).astype(np.int8)
    n4 = np.zeros((len(n), 4), dtype=np.int8)
    n4[:, :3] = n

    wide = len(pos) > 65535
    ind = idx.astype(np.uint32 if wide else np.uint16)

    meta = {
        "name": name,
        "count": int(len(pos)),
        "indexCount": int(ind.size),
        "indexType": "u32" if wide else "u16",
        "min": [float(v) for v in lo],
        "max": [float(v) for v in hi],
        "triangles": int(ind.size // 3),
    }
    return meta, q.tobytes(), n4.tobytes(), ind.tobytes()
