"""Resize + re-encode the textures inside a GLB, then rewrite the container.

Written because libvips (which @gltf-transform/cli uses) refuses these
particular PNGs with "colourspace: parameter space not set". PIL reads them
fine, so we do the image work here and rebuild the GLB by hand.
"""
import json
import struct
import sys
from io import BytesIO

from PIL import Image

MAX_DIM = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
src_path, dst_path = sys.argv[1], sys.argv[2]

raw = open(src_path, "rb").read()

# --- parse GLB container ---
magic, version, total_len = struct.unpack_from("<III", raw, 0)
assert magic == 0x46546C67, "not a GLB"

offset = 12
json_chunk = None
bin_chunk = None
while offset < total_len:
    clen, ctype = struct.unpack_from("<II", raw, offset)
    data = raw[offset + 8 : offset + 8 + clen]
    if ctype == 0x4E4F534A:
        json_chunk = data
    elif ctype == 0x004E4942:
        bin_chunk = data
    offset += 8 + clen + ((4 - (clen % 4)) % 4)

gltf = json.loads(json_chunk)
buffer_views = gltf.get("bufferViews", [])
images = gltf.get("images", [])

# --- pull every referenced binary slice out into a flat list we can rebuild ---
# Each bufferView becomes its own bytes object; images get replaced in place.
slices = []
for bv in buffer_views:
    start = bv.get("byteOffset", 0)
    slices.append(bytearray(bin_chunk[start : start + bv["byteLength"]]))

converted = 0
for img in images:
    bv_index = img.get("bufferView")
    if bv_index is None:
        continue
    payload = bytes(slices[bv_index])
    try:
        pil = Image.open(BytesIO(payload))
        pil.load()
    except Exception as exc:  # noqa: BLE001
        print(f"  skip image (unreadable): {exc}")
        continue

    original = (pil.width, pil.height, pil.mode, len(payload))

    if max(pil.width, pil.height) > MAX_DIM:
        scale = MAX_DIM / max(pil.width, pil.height)
        pil = pil.resize(
            (max(1, round(pil.width * scale)), max(1, round(pil.height * scale))),
            Image.LANCZOS,
        )

    # Preserve alpha where it exists (canopy glass needs it); otherwise JPEG,
    # which is dramatically smaller than PNG for photographic-ish skin texture.
    has_alpha = pil.mode in ("RGBA", "LA") or (
        pil.mode == "P" and "transparency" in pil.info
    )
    out = BytesIO()
    if has_alpha:
        pil.convert("RGBA").save(out, format="WEBP", quality=85, method=6)
        mime = "image/webp"
    else:
        pil.convert("RGB").save(out, format="JPEG", quality=88, optimize=True)
        mime = "image/jpeg"

    slices[bv_index] = bytearray(out.getvalue())
    img["mimeType"] = mime
    converted += 1
    print(
        f"  {original[0]}x{original[1]} {original[2]} {original[3]//1024}KB"
        f"  ->  {pil.width}x{pil.height} {mime.split('/')[1]} {len(slices[bv_index])//1024}KB"
    )

# --- rebuild the binary chunk with new offsets (4-byte aligned) ---
new_bin = bytearray()
for i, bv in enumerate(buffer_views):
    while len(new_bin) % 4:
        new_bin.append(0)
    bv["byteOffset"] = len(new_bin)
    bv["byteLength"] = len(slices[i])
    new_bin.extend(slices[i])
while len(new_bin) % 4:
    new_bin.append(0)

gltf["buffers"] = [{"byteLength": len(new_bin)}]

new_json = json.dumps(gltf, separators=(",", ":")).encode("utf8")
while len(new_json) % 4:
    new_json += b" "

out = bytearray()
out.extend(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(new_json) + 8 + len(new_bin)))
out.extend(struct.pack("<II", len(new_json), 0x4E4F534A))
out.extend(new_json)
out.extend(struct.pack("<II", len(new_bin), 0x004E4942))
out.extend(new_bin)

open(dst_path, "wb").write(out)
print(f"\n{converted} textures rewritten")
print(f"{len(raw)/1024/1024:.2f} MB -> {len(out)/1024/1024:.2f} MB")
