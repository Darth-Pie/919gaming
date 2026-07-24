"""
Encodes the wall-apparition PNG sequences to web video.

Blender bundles FFmpeg as a library rather than a binary, so encoding has to go
through a render. The image sequence is fed in via a compositor Image node
rather than the sequencer, which sidesteps the Sequence->Strip API rename in
Blender 4.4 entirely.

Two formats per clip: VP9/WebM for everything current, H.264/MP4 as the
universal fallback. Both are cheap here -- the footage is grayscale, mostly
black, and slow-moving, which is close to the best case for either codec.

Usage:
  blender -b -P encode_clips.py -- --frames DIR --out DIR
"""

import argparse
import os
import sys

import bpy

FPS = 24

# (container, video codec, file extension)
TARGETS = [
    ("WEBM", "WEBM", "webm"),   # VP9
    ("MPEG4", "H264", "mp4"),
]


def sequence_scene(frame_dir, res, frames):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = frames
    scene.render.fps = FPS
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100

    # The PNGs already hold final display values, so read them as sRGB and write
    # with the Standard view transform. That pair round-trips exactly; reading
    # them as Non-Color would treat display values as linear and wash the clip out.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"

    files = sorted(f for f in os.listdir(frame_dir) if f.endswith(".png"))
    img = bpy.data.images.load(os.path.join(frame_dir, files[0]))
    img.source = "SEQUENCE"
    img.colorspace_settings.name = "sRGB"

    scene.use_nodes = True
    nt = scene.node_tree
    nt.nodes.clear()
    node = nt.nodes.new("CompositorNodeImage")
    node.image = img
    node.frame_duration = frames
    node.frame_start = 1
    node.frame_offset = 0
    out = nt.nodes.new("CompositorNodeComposite")
    nt.links.new(node.outputs["Image"], out.inputs["Image"])
    return scene


def encode(scene, path, container, codec):
    scene.render.image_settings.file_format = "FFMPEG"
    ff = scene.render.ffmpeg
    ff.format = container
    ff.codec = codec
    ff.constant_rate_factor = "MEDIUM"
    ff.ffmpeg_preset = "GOOD"
    ff.gopsize = FPS  # a keyframe per second, so spawns start instantly
    ff.audio_codec = "NONE"
    scene.render.filepath = path
    bpy.ops.render.render(animation=True)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", required=True, help="dir of per-clip frame dirs")
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)

    # Absolute, always. Blender resolves a relative render path against the
    # .blend file's location, and in background mode with no .blend that lands
    # somewhere unrelated to the working directory -- the render still reports
    # success, it just writes where you will not find it.
    args.frames = os.path.abspath(args.frames)
    args.out = os.path.abspath(args.out)
    os.makedirs(args.out, exist_ok=True)
    names = sorted(
        d for d in os.listdir(args.frames)
        if os.path.isdir(os.path.join(args.frames, d))
    )

    for name in names:
        frame_dir = os.path.join(args.frames, name)
        pngs = sorted(f for f in os.listdir(frame_dir) if f.endswith(".png"))
        if not pngs:
            continue

        probe = bpy.data.images.load(os.path.join(frame_dir, pngs[0]))
        res = (probe.size[0], probe.size[1])
        bpy.data.images.remove(probe)

        for container, codec, ext in TARGETS:
            scene = sequence_scene(frame_dir, res, len(pngs))
            # Blender appends a frame range to the filename unless the path
            # already ends in the extension it is about to write.
            encode(scene, os.path.join(args.out, f"{name}.{ext}"), container, codec)

        print(f"[{name}] encoded {res[0]}x{res[1]} {len(pngs)}f", flush=True)


if __name__ == "__main__":
    main()
