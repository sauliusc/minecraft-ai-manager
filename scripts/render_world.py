#!/usr/bin/env python3
"""
Render part of the Minecraft world as an isometric image, straight from the save.

Why this exists
---------------
Building through RCON is blind. Twice a structure was declared finished and was
wrong — a statue floating off the back of its plinth, a church sealed off from
its own clerestory — and neither was visible from the commands that built it.
Probing blocks one at a time and printing ASCII sections is worse than useless:
it sampled every other block and hid half of every roof, which nearly caused a
"fix" to geometry that was already correct.

Reading the save and drawing it is the cheap, reliable answer. No game client,
no account, no GPU, no network. The server stays untouched apart from one
`save-all flush`.

Known limits, so nobody mistakes this for a screenshot:

  * Colours are per block type, approximate. No textures, no lighting.
  * Stairs, slabs and fences draw as full cubes, so roofs read chunkier here
    than they do in game.
  * Colours come from a hand-written table; unknown blocks fall back to grey.
  * Entities are not drawn.

Good enough for what actually goes wrong: proportion, silhouette, missing
geometry, things floating in the air.

Usage:
    render_world.py REGION_DIR X0 X1 Y0 Y1 Z0 Z1 OUT.png [TILE] [ROTATION]

REGION_DIR holds the r.<x>.<z>.mca files; whichever are needed are opened.

ROTATION turns the camera in 90-degree steps (0-3).
"""
import io
import os
import struct
import sys
import zlib

try:
    import nbtlib
    from PIL import Image, ImageDraw
except ImportError as exc:                                  # pragma: no cover
    sys.exit(f"missing dependency: {exc}. Try: pip install nbtlib Pillow")


class Region:
    """Random access to the blocks of one .mca region file."""

    def __init__(self, path):
        self.f = open(path, 'rb')
        self._chunks = {}

    def _chunk(self, cx, cz):
        key = (cx & 31, cz & 31)
        if key in self._chunks:
            return self._chunks[key]

        self.f.seek(4 * (key[0] + key[1] * 32))
        offset = struct.unpack('>I', b'\x00' + self.f.read(3))[0]
        if offset == 0:                                     # never generated
            self._chunks[key] = None
            return None

        self.f.seek(offset * 4096)
        length = struct.unpack('>I', self.f.read(4))[0]
        scheme = self.f.read(1)[0]
        raw = self.f.read(length - 1)
        data = zlib.decompress(raw) if scheme == 2 else raw

        nbt = nbtlib.File.parse(io.BytesIO(data), byteorder='big')
        root = nbt if 'sections' in nbt else nbt.get('', nbt)

        sections = {}
        for section in root['sections']:
            states = section.get('block_states')
            if states is None:
                continue
            palette = [str(entry['Name']) for entry in states['palette']]
            sections[int(section['Y'])] = (palette, list(states.get('data', [])))

        self._chunks[key] = sections
        return sections

    def block(self, x, y, z):
        sections = self._chunk(x >> 4, z >> 4)
        if not sections:
            return 'minecraft:air'
        section = sections.get(y >> 4)
        if section is None:
            return 'minecraft:air'

        palette, data = section
        if len(palette) == 1 or not data:
            return palette[0]

        # 1.16+ packs indices into int64s without letting one span two longs.
        bits = max(4, (len(palette) - 1).bit_length())
        per_long = 64 // bits
        index = ((y & 15) << 8) | ((z & 15) << 4) | (x & 15)
        packed = data[index // per_long]
        value = (packed >> (index % per_long * bits)) & ((1 << bits) - 1)
        return palette[value] if value < len(palette) else 'minecraft:air'


class World:
    """The blocks of an area, across however many region files it spans.

    Builds near spawn routinely cross x=0 or z=0, which is a region boundary, so
    handling one file at a time would refuse the most common case.
    """

    def __init__(self, region_dir):
        self.dir = region_dir
        self._regions = {}

    def _region(self, rx, rz):
        if (rx, rz) not in self._regions:
            path = os.path.join(self.dir, f'r.{rx}.{rz}.mca')
            self._regions[(rx, rz)] = Region(path) if os.path.exists(path) else None
        return self._regions[(rx, rz)]

    def block(self, x, y, z):
        region = self._region(x >> 9, z >> 9)
        return region.block(x, y, z) if region else 'minecraft:air'


PALETTE = {
    'white_concrete': (236, 237, 237), 'quartz_pillar': (231, 226, 218),
    'quartz_block': (236, 233, 226), 'smooth_quartz': (236, 233, 226),
    'bricks': (150, 97, 83), 'brick_stairs': (150, 97, 83),
    'stone_bricks': (122, 122, 122), 'chiseled_stone_bricks': (118, 118, 118),
    'stone_brick_wall': (122, 122, 122), 'stone_brick_slab': (122, 122, 122),
    'polished_andesite': (132, 134, 133), 'polished_diorite': (207, 208, 209),
    'stone': (125, 125, 125), 'smooth_stone': (158, 158, 158),
    'cobblestone': (127, 127, 127), 'deepslate': (77, 77, 80),
    'grass_block': (106, 148, 66), 'dirt': (134, 96, 67), 'podzol': (91, 64, 30),
    'snow': (245, 250, 250), 'snow_block': (245, 250, 250),
    'copper_block': (192, 107, 79), 'exposed_copper': (161, 125, 100),
    'weathered_copper': (108, 153, 122), 'oxidized_copper': (82, 162, 132),
    'gold_block': (246, 208, 61), 'iron_block': (220, 220, 220),
    'iron_bars': (160, 160, 165), 'glass_pane': (175, 213, 219),
    'glass': (175, 213, 219), 'lantern': (247, 194, 106), 'torch': (247, 194, 106),
    'dark_oak_stairs': (66, 43, 21), 'dark_oak_fence': (66, 43, 21),
    'dark_oak_planks': (66, 43, 21), 'oak_planks': (162, 130, 78),
    'oak_wall_sign': (158, 128, 79), 'oak_log': (109, 85, 51),
    'oak_leaves': (60, 143, 60), 'spruce_log': (90, 66, 40),
    'spruce_leaves': (48, 110, 63), 'birch_log': (198, 191, 174),
    'water': (63, 118, 228), 'lava': (217, 108, 30),
    'sand': (219, 207, 163), 'gravel': (131, 127, 126),
    'bedrock': (85, 85, 85), 'netherrack': (97, 38, 38),
}
UNKNOWN = (140, 140, 140)
SKY = (150, 180, 210)


def colour_of(name):
    plain = name.replace('minecraft:', '')
    if plain in PALETTE:
        return PALETTE[plain]
    # Fall back to a related block rather than painting everything grey.
    for key, rgb in PALETTE.items():
        if key in plain or plain in key:
            return rgb
    return UNKNOWN


def shaded(rgb, factor):
    return tuple(max(0, min(255, int(c * factor))) for c in rgb)


def render(region_dir, x0, x1, y0, y1, z0, z1, out_path, tile=6, rotation=0):
    region = World(region_dir)
    half = tile // 2

    def view(x, z):
        """Block position in camera space, rotated in 90-degree steps."""
        u, v = x - x0, z - z0
        span_u, span_v = x1 - x0, z1 - z0
        if rotation == 1:
            u, v = v, span_u - u
        elif rotation == 2:
            u, v = span_u - u, span_v - v
        elif rotation == 3:
            u, v = span_v - v, u
        return u, v

    def screen(x, y, z):
        u, v = view(x, z)
        return (u - v) * tile, (u + v) * half - (y - y0) * tile

    corners = [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    xs = [screen(*c)[0] for c in corners]
    ys = [screen(*c)[1] for c in corners]
    pad = tile * 3
    origin = (-min(xs) + pad, -min(ys) + pad)

    image = Image.new('RGB', (max(xs) - min(xs) + pad * 2 + tile * 2,
                              max(ys) - min(ys) + pad * 2 + tile * 2), SKY)
    draw = ImageDraw.Draw(image)

    def solid(x, y, z):
        return region.block(x, y, z) != 'minecraft:air'

    drawn = 0
    # Painter's algorithm in camera space: far blocks first.
    for depth in range((x1 - x0) + (z1 - z0) + (y1 - y0) + 3):
        for x in range(x0, x1 + 1):
            for z in range(z0, z1 + 1):
                u, v = view(x, z)
                y = depth - u - v + y0
                if not y0 <= y <= y1:
                    continue
                name = region.block(x, y, z)
                if name == 'minecraft:air':
                    continue
                # Hidden behind its own neighbours — skip the work.
                if solid(x + 1, y, z) and solid(x, y, z + 1) and solid(x, y + 1, z):
                    continue

                sx, sy = screen(x, y, z)
                sx += origin[0]
                sy += origin[1]
                rgb = colour_of(name)
                draw.polygon([(sx, sy), (sx + tile, sy - half),
                              (sx + tile * 2, sy), (sx + tile, sy + half)],
                             fill=shaded(rgb, 1.0))
                draw.polygon([(sx, sy), (sx + tile, sy + half),
                              (sx + tile, sy + half + tile), (sx, sy + tile)],
                             fill=shaded(rgb, 0.72))
                draw.polygon([(sx + tile, sy + half), (sx + tile * 2, sy),
                              (sx + tile * 2, sy + tile), (sx + tile, sy + half + tile)],
                             fill=shaded(rgb, 0.55))
                drawn += 1

    image.save(out_path)
    return drawn, image.size


def main(argv):
    if len(argv) < 8:
        sys.exit(__doc__.strip())
    region_dir = argv[0]
    bounds = [int(v) for v in argv[1:7]]
    out = argv[7]
    tile = int(argv[8]) if len(argv) > 8 else 6
    rotation = int(argv[9]) if len(argv) > 9 else 0
    drawn, size = render(region_dir, *bounds, out, tile, rotation)
    print(f"{drawn} blocks drawn -> {out} ({size[0]}x{size[1]})")


if __name__ == '__main__':
    main(sys.argv[1:])
