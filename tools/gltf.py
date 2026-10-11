"""Enough of glTF 2.0 to pull triangle soup out of a .glb.

There are libraries for this. None of them are here, and this file needs
exactly one thing from the format -- positions, in world space, per drawable
piece -- so it reads the container itself: the JSON chunk, the binary chunk,
and a walk of the scene graph accumulating node transforms.

The one thing it cannot do without help is Draco. NASA's Lunar Module ships
its geometry as a Draco stream rather than as plain accessors, which is why
DracoPy is imported below; a file without the extension needs nothing beyond
numpy. Normals and texture coordinates are deliberately ignored. Every model
that comes through here is decimated afterwards, and decimated normals are
wrong -- meshkit.shade recomputes them from the geometry that survives.
"""
import json
import struct

import numpy as np

try:
    import DracoPy
except ImportError:  # only needed for Draco-compressed files
    DracoPy = None

_COMPONENT = {
    5120: np.int8, 5121: np.uint8, 5122: np.int16,
    5123: np.uint16, 5125: np.uint32, 5126: np.float32,
}
_COUNT = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def load(path):
    data = open(path, "rb").read()
    _, _, total = struct.unpack_from("<4sII", data, 0)
    off, chunks = 12, {}
    while off < total:
        clen, ctype = struct.unpack_from("<I4s", data, off)
        chunks[ctype.strip(b"\0")] = data[off + 8: off + 8 + clen]
        off += 8 + clen
    return json.loads(chunks[b"JSON"].decode("utf-8")), chunks[b"BIN"]


def accessor(gltf, buf, index):
    """One accessor as an (count, components) float64 array. Handles the
    byteStride case, which Blender's exporter uses for interleaved data."""
    acc = gltf["accessors"][index]
    dtype = _COMPONENT[acc["componentType"]]
    ncomp = _COUNT[acc["type"]]
    n = acc["count"]
    if "bufferView" not in acc:
        return np.zeros((n, ncomp))
    bv = gltf["bufferViews"][acc["bufferView"]]
    start = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = bv.get("byteStride") or ncomp * np.dtype(dtype).itemsize
    item = ncomp * np.dtype(dtype).itemsize
    if stride == item:
        out = np.frombuffer(buf, dtype=dtype, count=n * ncomp, offset=start)
        return out.reshape(n, ncomp).astype(np.float64)
    raw = np.frombuffer(buf, dtype=np.uint8, count=(n - 1) * stride + item, offset=start)
    rows = np.lib.stride_tricks.as_strided(raw, shape=(n, item), strides=(stride, 1))
    return np.frombuffer(rows.tobytes(), dtype=dtype).reshape(n, ncomp).astype(np.float64)


def _matrix(node):
    if "matrix" in node:                      # column-major in glTF
        return np.array(node["matrix"], dtype=np.float64).reshape(4, 4).T
    m = np.eye(4)
    if "scale" in node:
        m = np.diag(list(node["scale"]) + [1.0]) @ m
    if "rotation" in node:
        x, y, z, w = node["rotation"]
        r = np.array([
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0],
            [0, 0, 0, 1],
        ])
        m = r @ m
    if "translation" in node:
        t = np.eye(4)
        t[:3, 3] = node["translation"]
        m = t @ m
    return m


def triangles(path):
    """[(name, material index, (n, 3, 3) soup)] in the file's own frame."""
    gltf, buf = load(path)
    out = []

    def walk(index, parent):
        node = gltf["nodes"][index]
        world = parent @ _matrix(node)
        if "mesh" in node:
            mesh = gltf["meshes"][node["mesh"]]
            for prim in mesh.get("primitives", []):
                if prim.get("mode", 4) != 4:
                    continue
                draco = prim.get("extensions", {}).get("KHR_draco_mesh_compression")
                if draco:
                    # The geometry lives in a Draco stream, not in accessors.
                    # Only positions and connectivity are wanted here --
                    # normals are recomputed after decimation anyway, and
                    # texture coordinates are unused by this renderer.
                    bv = gltf["bufferViews"][draco["bufferView"]]
                    start = bv.get("byteOffset", 0)
                    blob = bytes(buf[start: start + bv["byteLength"]])
                    dm = DracoPy.decode(blob)
                    pos = np.asarray(dm.points, dtype=np.float64).reshape(-1, 3)
                    idx = np.asarray(dm.faces, dtype=np.int64).ravel()
                else:
                    pos = accessor(gltf, buf, prim["attributes"]["POSITION"])
                    if "indices" in prim:
                        idx = accessor(gltf, buf, prim["indices"]).astype(np.int64).ravel()
                    else:
                        idx = np.arange(len(pos), dtype=np.int64)
                h = np.concatenate([pos, np.ones((len(pos), 1))], axis=1)
                pos = (h @ world.T)[:, :3]
                tri = pos[idx[: len(idx) // 3 * 3]].reshape(-1, 3, 3)
                out.append((node.get("name", mesh.get("name", "?")),
                            prim.get("material", -1), tri))
        for child in node.get("children", []):
            walk(child, world)

    scene = gltf["scenes"][gltf.get("scene", 0)]
    for root in scene.get("nodes", []):
        walk(root, np.eye(4))
    return gltf, out
