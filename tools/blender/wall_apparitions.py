"""
Generates the "something is behind the wallpaper" clips for 919gaming.com.

Heads and hands are built and animated procedurally in Blender (no external
assets), pressing forward through the plane of the wall. What comes out is a
grayscale clip of *signed relief*: flat wall renders exactly neutral grey, and
anything pushing through lights or shades it -- which is what lets the clips
composite onto the page with mix-blend-mode:soft-light and no alpha channel.
See shade() for why it has to be signed rather than simply bright.


HOW THE FABRIC IS DONE, AND WHY NOT WITH CLOTH

The obvious approach -- a pinned cloth sim draped over the colliders -- was
tried and abandoned. Two problems, both fundamental rather than tuning issues:

  * A pinned, inextensible sheet cannot be pushed locally without tenting
    globally. That tent is far deeper than a nose or a knuckle, so it dominated
    every frame and blew the middle out to white.
  * Cranking tension to suppress the tent made the whole sheet wrinkle, and
    normal-based shading lit up every one of those wrinkles as loudly as it lit
    the face.

Viewed through an orthographic camera this effect is just a height field, so it
is solved as one. Blender renders the colliders' protrusion past the wall plane;
numpy then relaxes a membrane over that height field:

    repeat:  h = blur(h) - sag       -- resists curvature; pressure pushes back
             h = max(h, obstacle)    -- fabric cannot pass through what it covers

which is a minimal-surface-over-an-obstacle relaxation with a pressure term. The
blur is the sheet resisting curvature and is what spreads a bulge outward into a
drape; the sag is what makes the sheet *thin*, pushing unsupported fabric back
down so it sinks into an open mouth and into the webbing between fingers instead
of tenting over them; the max step snaps covered areas back so features stay
crisp. Because nothing is pinned, it decays to flat on its own -- no tent, no
wrinkles, and true flat everywhere nothing is pushing. It also runs in seconds
per clip rather than minutes.


WHY THE HANDS ARE TILTED

Everything here is a height field, so a subject only reads if it has depth
*range*. That is easy to forget with the hands, because a hand modelled facing
the wall is a perfectly good hand -- it just happens to be one whose knuckles,
fingertips and heel all sit at the same depth. Rendered, it has almost no
gradient to shade, and what comes out is a flat print pressed on glass rather
than something pushing through. The fix is not in the membrane or the lighting,
neither of which has anything to work with; it is HAND_TILT plus the flexion the
digits carry, which together put the fingertips about 0.43 ahead of the palm.

How that flexion is split between the rest pose and the grip is a separate
question with its own answer, and getting it wrong costs the articulation rather
than the depth -- see FINGER_CURL.

That tilt then sets the press depth rather than the other way around, which is
the part that is easy to get backwards: press is measured from the foremost
point, so the deeper the digits lead, the further back the same press leaves the
palm. Tilt the hand and keep the old shallow press and the palm never breaks the
wall at all.

Usage:
  blender -b -P wall_apparitions.py -- --clip face-a --out DIR
  blender -b -P wall_apparitions.py -- --clip all --out DIR
"""

import argparse
import math
import os
import random
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

FPS = 24
FRAMES = 144  # 6s -- slow enough that the press-in reads as deliberate


# ---------------------------------------------------------------- scene setup

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = FRAMES
    scene.render.fps = FPS

    world = bpy.data.worlds.new("void")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0, 0, 0, 1)
    bg.inputs[1].default_value = 0.0
    scene.world = world


def setup_render(res_x, res_y, ortho_scale):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "BW"
    # 16-bit: this render is measurement data, not a picture. At 8 bits the
    # height quantises into visible terraces that the normal pass turns into
    # contour lines across every surface.
    scene.render.image_settings.color_depth = "16"

    # Standard, not AgX. Emission strength here *is* the encoded height; a
    # filmic transform would quietly bend the values before we read them back.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.eevee.taa_render_samples = 16

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ortho_scale
    cam = bpy.data.objects.new("cam", cam_data)
    # Looking down +Y from in front of the wall. Orthographic is what makes the
    # render a true height field: no perspective, so one pixel is one (x, z).
    cam.location = (0.0, -4.0, 0.0)
    cam.rotation_euler = (math.radians(90), 0.0, 0.0)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam


def height_material(press_depth):
    """Encodes each surface point's protrusion past the wall plane as brightness.

    The wall is the plane Y=0 and things push toward -Y, so -position.y is the
    protrusion, normalised so the deepest press lands just under 1.0. Clamping
    at zero is doing real work: it means the parts of a head still behind the
    wall encode identically to empty space, so only what has actually broken the
    plane ends up in the height field.

    Depth testing gives us the nearest surface for free, which is exactly the
    front surface we want.
    """
    mat = bpy.data.materials.new("height")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    norm = nt.nodes.new("ShaderNodeMath")
    norm.operation = "MULTIPLY"
    norm.inputs[1].default_value = -1.0 / (press_depth * 1.05)
    norm.use_clamp = True

    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs[0].default_value = (1, 1, 1, 1)
    out = nt.nodes.new("ShaderNodeOutputMaterial")

    nt.links.new(geo.outputs["Position"], sep.inputs[0])
    nt.links.new(sep.outputs["Y"], norm.inputs[0])
    nt.links.new(norm.outputs[0], emit.inputs[1])
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    return mat


# ------------------------------------------------------- procedural colliders

def gauss(dx, dz, sx, sz):
    return math.exp(-((dx / sx) ** 2 + (dz / sz) ** 2))


# Expression lives in the negative features, and almost nowhere else.
#
# The first three heads here differed only in their positive relief -- a bigger
# nose, a heavier brow, a longer jaw -- and all three read as the same face,
# because the membrane treats every one of those identically: something pushing
# out. Changing how hard it is pushed changes the face's build, not what the
# face is doing. The mouth, the eye sockets and the brow furrow are the only
# places the sheet is *not* pushed, and a hole is the only mark on this surface
# the eye reads as an expression.
#
# So the dials that matter are mouth_sx/mouth_sz (a tall narrow cavity is a
# scream, a wide shallow one is a snarl, a short thin one is a mouth clamped
# shut), eye_sz against eyes (round and deep is a hollow stare, a thin slit is
# a face screwed shut), and furrow, which is the vertical crease between the
# brows and is worth more per unit than anything else on the head.
HEAD_BASE = dict(
    width=0.78, height=1.06, jaw=1.30,                     # proportions
    nose=0.26, brow=0.11, brow_z=0.30, cheek=0.07, chin=0.11,   # pushed out
    mouth=0.38, mouth_z=-0.46, mouth_sx=0.18, mouth_sz=0.27,    # not pushed
    eyes=0.10, eye_x=0.34, eye_z=0.15, eye_sx=0.14, eye_sz=0.10,
    furrow=0.0,
)

# Variants state only what they change. Each is named for what it should read
# as at a glance and half-hidden behind a wall, which is the only way any of
# them is ever seen.
HEAD_VARIANTS = [
    # 0 -- the scream: the tall open cavity, jaw dragged down.
    dict(furrow=0.05),
    # 1 -- the wail: longer and narrower, eyes screwed shut to slits, brow down.
    dict(nose=0.21, brow=0.14, brow_z=0.26, cheek=0.09, chin=0.08,
         jaw=1.42, width=0.72, height=1.14,
         mouth=0.42, mouth_z=-0.49, mouth_sx=0.21, mouth_sz=0.31,
         eyes=0.13, eye_sz=0.055, furrow=0.07),
    # 2 -- the snarl: mouth wide and flat rather than open, jaw barely dropped,
    # heavy low brow. Broad where the scream is long.
    dict(nose=0.30, brow=0.16, brow_z=0.25, cheek=0.10, chin=0.13,
         jaw=1.10, width=0.86, height=0.98,
         mouth=0.30, mouth_z=-0.38, mouth_sx=0.32, mouth_sz=0.13,
         eyes=0.09, eye_z=0.13, eye_sz=0.065, furrow=0.09),
    # 3 -- the hollow stare: small round mouth, and the sockets doing the work.
    # The only one here that is not in pain, which is what makes it the worst
    # of them -- it reads as something looking back rather than suffering.
    #
    # A socket only reads as a socket if something around it is pushing. Given
    # the smooth high brow and flat cheeks this face wants, and sockets twice
    # the depth of anyone else's, they still came out as vague smudges: nothing
    # framed them, so there was no edge for the membrane to break over. The brow
    # and cheekbone here are the rim, not the expression.
    dict(nose=0.24, brow=0.12, brow_z=0.33, cheek=0.08, chin=0.09,
         jaw=1.15, width=0.74, height=1.08,
         mouth=0.32, mouth_z=-0.44, mouth_sx=0.12, mouth_sz=0.13,
         eyes=0.28, eye_x=0.33, eye_z=0.14, eye_sx=0.16, eye_sz=0.14),
    # 4 -- the strain: mouth clamped to a grim line, everything else bearing
    # down. Someone forcing their face into the sheet rather than crying out.
    dict(nose=0.28, brow=0.18, brow_z=0.27, cheek=0.12, chin=0.16,
         jaw=1.05, width=0.82, height=1.00,
         mouth=0.20, mouth_z=-0.42, mouth_sx=0.26, mouth_sz=0.075,
         eyes=0.11, eye_sx=0.15, eye_sz=0.055, furrow=0.11),
]


def build_head(variant, scale, mat):
    """A head is a UV sphere pushed around with gaussian bumps.

    It does not need to survive a close-up -- only what protrudes furthest ever
    breaks the plane, so brow, nose, cheekbones and chin do all the work. The
    mouth and eye sockets are *negative* bumps: the membrane never gets pushed
    there, so they stay dark, and that is what turns a lumpy sphere into a
    scream.
    """
    p = dict(HEAD_BASE, **HEAD_VARIANTS[variant])
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=1.0)
    obj = bpy.context.object
    obj.name = f"head{variant}"

    for v in obj.data.vertices:
        nx, ny, nz = v.co.x, v.co.y, v.co.z
        x = nx * p["width"]
        z = nz * p["height"]

        # Screaming jaw: everything below the cheekbones stretches downward.
        if z < -0.22:
            z = -0.22 + (z + 0.22) * p["jaw"]

        # Bumps live on the face side only, faded by how front-facing the vertex
        # is so they blend into the skull instead of ending in a seam.
        front = max(0.0, -ny) ** 0.7

        # Lip and jaw rims framing the mouth, so the hollow has a defined edge.
        # Sized off the mouth rather than fixed: at fixed offsets they sat a
        # full cavity's width clear of a short mouth and framed nothing, and
        # their fixed z-radius filled a thin one back in.
        rim_sx = p["mouth_sx"] * 1.40
        rim_sz = max(0.038, p["mouth_sz"] * 0.28)

        d = 0.0
        d += p["nose"] * gauss(x, z + 0.04, 0.13, 0.24)
        d += p["brow"] * gauss(abs(x) - 0.27, z - p["brow_z"], 0.21, 0.10)
        d += p["cheek"] * gauss(abs(x) - 0.44, z + 0.14, 0.17, 0.19)
        d += p["chin"] * gauss(x, z + 0.86, 0.21, 0.17)
        d += 0.06 * gauss(x, z - p["mouth_z"] - p["mouth_sz"] * 0.96, rim_sx, rim_sz)
        d += 0.05 * gauss(x, z - p["mouth_z"] + p["mouth_sz"] * 1.04,
                          rim_sx * 0.92, rim_sz)
        d -= p["mouth"] * gauss(x, z - p["mouth_z"], p["mouth_sx"], p["mouth_sz"])
        d -= p["eyes"] * gauss(abs(x) - p["eye_x"], z - p["eye_z"],
                               p["eye_sx"], p["eye_sz"])
        # The frown crease. A narrow vertical groove cut between the brow ridges
        # -- the one mark that says a face is straining rather than merely open.
        d -= p["furrow"] * gauss(x, z - p["brow_z"] + 0.02, 0.045, 0.11)

        v.co = Vector((x, ny - d * front, z))

    obj.scale = (scale, scale, scale)
    sub = obj.modifiers.new("Subdivision", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 2
    bpy.ops.object.shade_smooth()
    obj.data.materials.append(mat)
    return obj


def capsule(name, radius, length, mat, segments=24, section=(1.0, 1.0)):
    """A true capsule -- straight sided, hemispherical caps -- origin at the base.

    Built by splitting a UV sphere at its equator and sliding the top half up,
    which costs nothing and matters a lot: a stretched *ellipsoid* tapers along
    its whole length, and five of those read as claws rather than as fingers.

    Origin-at-base is the other half of the trick: a plain rotation keyframe then
    pivots the piece at its knuckle, so a finger flexes on one euler channel.
    """
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=segments // 2, radius=radius
    )
    obj = bpy.context.object
    obj.name = name

    barrel = max(0.0, length - 2.0 * radius)
    for v in obj.data.vertices:
        if v.co.z > 0.0:
            v.co.z += barrel
    obj.data.transform(Matrix.Translation((0, 0, radius)))
    # Fingers are wider than they are deep; a circular section is one of the
    # things that makes a capsule read as a sausage.
    if section != (1.0, 1.0):
        obj.data.transform(Matrix.Diagonal((section[0], section[1], 1.0, 1.0)).to_4x4())

    smooth_surface(obj)
    obj.data.materials.append(mat)
    return obj


def build_palm(name, side, mat, segments=64):
    """The palm: an ellipsoid pushed around with gaussian bumps, like the head.

    A bare ellipsoid was fine while the membrane was thick enough to smooth it
    away, and reads as a mitten now that it is not. The knuckle ridge is what
    actually sells it -- four bumps in a row at the base of the fingers is the
    single most recognisable thing about the back of a hand.
    """
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=segments // 2, radius=1.0
    )
    obj = bpy.context.object
    obj.name = f"{name}_palm"
    obj.data.transform(Matrix.Diagonal((*PALM, 1.0)).to_4x4())

    for v in obj.data.vertices:
        front = max(0.0, -v.co.y / PALM[1]) ** 0.7
        d = 0.0
        for bx, bz, sx, sz, amp in PALM_BUMPS:
            d += amp * gauss(v.co.x - bx * side, v.co.z - bz, sx, sz)
        v.co.y -= d * front

    smooth_surface(obj)
    obj.data.materials.append(mat)
    return obj


def smooth_surface(obj):
    """Subdivide, don't just shade smooth.

    Normals are computed from the rendered height field, not from the mesh, so
    smooth shading is invisible here -- it changes how a surface is lit, and we
    never use its lighting. Only the silhouette and the depth reach the height
    field, so the *geometry* has to be genuinely round or the UV sphere's quads
    print straight through as a grid of facets across the palm.
    """
    sub = obj.modifiers.new("Subdivision", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 2
    bpy.ops.object.shade_smooth()


# Half-extents: about as wide as tall, deeper than it looks like it needs to be
# and shorter than a hand really is. Both are the tilt. Tipping the hand throws
# the wrist end backwards, so the lower third of a full-length palm sits too far
# behind the wall to register at all and only costs the clip its composition;
# and what is left has to be deep enough to still be an obstacle once its own
# depth is foreshortened away.
PALM = (0.33, 0.128, 0.32)

# Relief on the palm, mirrored with the hand: x, z, gaussian radii, height.
# Deliberately restrained -- the palm is the shallowest thing in the clip, so
# these compete with the whole hand for the little depth there is.
PALM_BUMPS = [
    # The knuckle ridge carries the finger roots, which sit proud of the palm so
    # the membrane does not catch in a step at the base of each digit. Flatten
    # these and the outer fingers start reading as detached from the hand.
    #
    # These came down from 0.058 when the digits started leading. They were
    # raised to stop the index finger tearing loose from a flat hand, where the
    # roots barely cleared the palm at all; a tilted hand carries its knuckles
    # forward on its own, and at the old height the ridge overtook the roots and
    # put the step back the other way round.
    (-0.215, 0.25, 0.090, 0.11, 0.040),   # knuckles, under each finger
    (-0.072, 0.27, 0.090, 0.11, 0.040),
    (0.072, 0.26, 0.090, 0.11, 0.039),
    (0.215, 0.23, 0.085, 0.10, 0.038),
    # The mounds are pulled up out of the wrist for the same reason the palm was
    # shortened: down where they used to sit, the tilt had already taken them
    # behind the wall, so all they did was fail to render.
    (0.21, -0.02, 0.15, 0.20, 0.052),     # thenar mound, behind the thumb
    (-0.23, -0.07, 0.12, 0.19, 0.042),    # hypothenar mound, the pinky heel
    (0.0, 0.02, 0.17, 0.16, -0.030),      # the cup between the two
]

# knuckle x, finger length, base splay (deg), extra rest flexion (rad).
#
# Splay is generous. Adjacent knuckles are 0.143 apart and a finger is 0.123
# wide, so at the base they very nearly touch -- as they do on a hand. All the
# separation has to be won along the length, and that is what the splay buys:
# by the middle phalanx the gaps have opened to several times the membrane's
# smoothing scale, which is the point at which it stops bridging them and starts
# sinking in between.
#
# The per-finger flexion bias is what stops this reading as a wave. Four digits
# at one angle, evenly fanned, is the high-five silhouette however they are lit
# -- the eye reads the *even* fan, not the pose. Real fingers curling into
# something never agree: the index leads, the pinky tucks. Biasing the rest
# flexion is also cheaper than biasing the animation, because it survives the
# slack end of the grip cycle, which is exactly where the hand used to flatten
# out and go back to waving.
FINGERS = [
    (-0.215, 0.62, -15.0, 0.06),  # index -- reaches furthest, curls least
    (-0.072, 0.68, -5.0, 0.00),   # middle
    (0.072, 0.63, 7.0, 0.11),     # ring
    (0.215, 0.51, 19.0, 0.20),    # pinky -- tucked well under
]

# Per phalanx: fraction of total length, fraction of base radius, rest flexion.
#
# A finger is not a tube. Three tapering segments with a slight bend at each
# joint is the minimum that stops it reading as a sausage: the radius steps
# leave a visible waist at each knuckle once the membrane drapes over them, and
# the accumulating flexion means the tip meets the wall at an angle instead of
# the whole length lying against it like a rod.
#
# The taper is deliberately gentle and the overlap generous. Stepping the radius
# hard (0.86, 0.72) with less overlap separated the phalanges into distinct
# pods, which reads as an insect leg -- a knuckle is a crease, not a joint in
# an exoskeleton.
#
# PHALANX_OVERLAP is where along its parent a segment *starts*, so smaller means
# more overlap. It had to come down once the membrane got thin: a thick sheet
# tented straight over the gap between two segments, and a thin one drops into
# it and draws a hard black line at every joint.
#
# The rest flexion was nearly nothing -- 10 degrees over the whole digit, which
# is a straight finger. Straight fingers lying in the plane of the wall are why
# the hand read as a print pressed on glass: the tip finished barely 0.03 ahead
# of the palm, so tip, knuckle and heel all rendered at one depth and there was
# no gradient in the height field for the shading to find.
#
# It then went too far the other way. Resting the digits already half-closed
# used up most of the room between flat and the 90-degree ceiling, so the grip
# had only about 30 degrees left to move in and all four fingers sat at
# near-identical angles whatever the animation did with them -- an arm and a
# fist, not a hand. The rest pose is back to roughly a third closed, which still
# leads with the tips, and the range it frees up goes to FINGER_CURL.
PHALANGES = [(0.42, 1.00, 0.08), (0.33, 0.93, 0.13), (0.25, 0.85, 0.11)]
PHALANX_OVERLAP = 0.62

# Fingers were 0.160 wide across knuckles 0.143 apart -- that is, they
# intersected each other, and no amount of work on the membrane was ever going
# to find a gap between them that did not exist. 0.055 * 1.12 * 2 = 0.123 leaves
# a real one.
FINGER_RADIUS = 0.055
FINGER_SECTION = (1.12, 0.86)  # wider than deep

# The whole hand is tipped forward about X, so the digits travel out of the wall
# toward the camera and the wrist falls away behind it.
#
# This is the difference between a hand pushing through a membrane and a hand
# pressed flat on a window, and it is not a lighting or a membrane property --
# a hand parallel to the wall has no depth for either to work with. Tipping it
# spends projected length to buy depth range, and the exchange rate is good: the
# tilt itself costs only cos(21) of the hand's height, about 7%, while carrying
# the whole knuckle line forward and the whole wrist back.
#
# The tilt is not the only source of the depth, and on its own it would not be
# enough -- most of the 0.44 the fingertips end up leading the palm by comes
# from the rest flexion in PHALANGES. What the tilt uniquely does is swing the
# *palm* out of plane, which is what turns a flat slab into a receding one.
#
# It is also self-limiting, which is why it is this shallow. Press depth is
# measured from the foremost point, so every degree of tilt pushes the palm
# further back behind the wall for the same press; past about 30 degrees the
# palm stops breaking the plane at all and the clip becomes four fingers
# floating in front of nothing.
HAND_TILT = math.radians(21.0)


def _chain(name, base, radius, length, phalanges, mat, section):
    """Build a jointed digit as parented capsules, returning it tip-last."""
    segs = []
    parent = base
    for j, (lf, rf, flex) in enumerate(phalanges):
        seg = capsule(f"{name}_p{j}", radius * rf, length * lf, mat, section=section)
        # Each segment starts just short of its parent's tip so the surfaces
        # overlap; the height field takes the nearest one, so they merge into a
        # single digit instead of showing a gap at every joint.
        seg.location = (
            (0.0, 0.0, length * phalanges[j - 1][0] * PHALANX_OVERLAP) if j
            else (0.0, 0.0, 0.0))
        seg.rotation_euler = (flex, 0.0, 0.0)
        seg.parent = parent
        seg.matrix_parent_inverse = Matrix.Identity(4)
        segs.append(seg)
        parent = seg
    return segs


def build_hand(name, scale, mat, mirror=False):
    """A palm slab plus five jointed digits, parented into the palm.

    Digits deliberately start *inside* the palm so their surfaces overlap, and
    sit slightly proud of it in Y, because a hand clawing at something presses
    through its fingertips rather than its palm.

    Returns (palm, chains) where each chain is one digit's segments, base first.
    """
    side = -1 if mirror else 1
    palm = build_palm(name, side, mat)
    chains = []

    for i, (kx, length, splay, bias) in enumerate(FINGERS):
        root = bpy.data.objects.new(f"{name}_k{i}", None)  # knuckle pivot
        bpy.context.collection.objects.link(root)
        # Proud of the knuckle ridge, not level with it: rooted flush, the ridge
        # stands further forward than the finger base and the membrane drops
        # into the step between them, drawing a dark band across the knuckles.
        #
        # -0.062 was flush at best and behind at worst. The knuckle bumps stand
        # 0.055 off an ellipsoid that is itself 0.05 to 0.08 deep under each
        # finger, so the ridge reached -0.10 to -0.13 and the roots sat behind
        # all four of them -- which is the dark band that was cutting the digits
        # off from the hand. This clears the tallest of them.
        root.location = (kx * side, -0.152, 0.22)
        # X before Y in Blender's default euler order, so the bias tips the
        # digit out of the wall and the splay then fans it sideways.
        root.rotation_euler = (bias, math.radians(splay * side), 0.0)
        root.parent = palm
        root.matrix_parent_inverse = Matrix.Identity(4)
        chains.append([root] + _chain(f"{name}_f{i}", root, FINGER_RADIUS, length,
                                      PHALANGES, mat, FINGER_SECTION))

    # Well inside the palm's edge -- at the rim it swings clear as it rotates
    # out and reads as a detached wedge floating beside the hand. Pulled further
    # in and forward again for the same reason as the knuckles: behind the
    # thenar mound it was rendering as a loose pill lying beside the hand.
    thumb = bpy.data.objects.new(f"{name}_tk", None)
    bpy.context.collection.objects.link(thumb)
    # Up level with the base of the index finger, where a thumb actually crosses
    # a closing hand, and where the tilt has not yet carried the palm away
    # behind it. Down at the old height it was proud of a surface that had
    # already receded, so the membrane fell away all round it and it rendered as
    # a loose pill lying next to the hand.
    thumb.location = (0.215 * side, -0.132, -0.015)
    thumb.rotation_euler = (0.17, math.radians(57 * side), 0.0)
    thumb.parent = palm
    thumb.matrix_parent_inverse = Matrix.Identity(4)
    chains.append([thumb] + _chain(f"{name}_thumb", thumb, 0.064, 0.46,
                                   PHALANGES[:2], mat, (1.10, 0.90)))

    palm.scale = (scale, scale, scale)
    return palm, chains


# ------------------------------------------------------------------ animation

def wobble(t, seed, freqs=(0.7, 1.6, 2.7)):
    """Smooth, deterministic, sum-of-sines noise in roughly [-1, 1].

    Deliberately not an F-curve Noise modifier -- the slotted-action API moved in
    4.4, and plain keyframes are one less thing to break on a version bump.
    """
    rng = random.Random(seed)
    v = 0.0
    norm = 0.0
    for f in freqs:
        v += math.sin(t * f * 2 * math.pi + rng.uniform(0, 2 * math.pi)) / f
        norm += 1.0 / f
    return v / norm


def press_curve(t):
    """0 -> 1 -> 0 across the clip: a slow lean in, a long hold, a withdrawal.

    Weighted toward the hold, because the hold is the part worth watching.
    """
    if t < 0.10:
        return 0.0
    if t < 0.42:
        u = (t - 0.10) / 0.32
        return u * u * (3 - 2 * u)  # smoothstep in
    if t < 0.80:
        return 1.0
    u = (t - 0.80) / 0.20
    return 1.0 - (u * u * (3 - 2 * u))


def _front_extent_now(obj):
    deps = bpy.context.evaluated_depsgraph_get()
    origin_y = obj.matrix_world.translation.y
    front = origin_y

    for o in [obj] + list(obj.children_recursive):
        if o.type != "MESH":
            continue  # knuckle pivots are empties
        ev = o.evaluated_get(deps)
        mesh = ev.to_mesh()
        if mesh.vertices:
            front = min(front, min((o.matrix_world @ v.co).y for v in mesh.vertices))
        ev.to_mesh_clear()
    return origin_y - front


def front_extent(obj, samples=9):
    """How far the foremost point of obj *and its children* sits ahead of its origin.

    Children matter: with flexed fingers the fingertips reach well past the palm,
    so measuring the palm alone would compute a press depth from the wrong
    surface and drive the whole hand through the wall to get the palm in.

    Averaged over the clip rather than measured in one pose, because the digits
    are already keyframed by the time this runs and a curling finger reaches a
    long way further forward than a straight one -- over the range a grasp
    covers, further than the whole press depth. Measuring the rest pose alone
    buries the fingertips past the depth the height encoding can represent;
    measuring the deepest pose leaves the slack fingers hanging behind the wall,
    where they vanish. The mean puts the press where the hand spends its time
    and lets the digits work in and out either side of it.

    For a head this is a no-op: nothing is keyframed yet when it is called, so
    every sample returns the same number.
    """
    scene = bpy.context.scene
    restore = scene.frame_current
    total = 0.0
    for i in range(samples):
        scene.frame_set(1 + round(i * (FRAMES - 1) / (samples - 1)))
        total += _front_extent_now(obj)
    scene.frame_set(restore)
    return total / samples


def animate_press(obj, offset, press_depth, seed, rot_amp=0.16, step=2,
                  rest_rot=(0.0, 0.0, 0.0)):
    """Drive an object from clear of the wall to press_depth through it.

    rest_rot is the pose the writhing rides on rather than replaces: these
    keyframes overwrite rotation_euler outright every frame, so a tilt set at
    build time would simply be erased on frame 1.
    """
    obj.rotation_euler = rest_rot
    bpy.context.view_layer.update()
    reach = front_extent(obj)
    rest_y = reach + 0.55           # nothing touching
    deep_y = reach - press_depth    # foremost point past the plane

    for frame in range(1, FRAMES + 1, step):
        t = (frame - 1) / (FRAMES - 1)
        k = press_curve(t)

        obj.location = (
            offset[0] + wobble(t, seed + 11) * 0.05 * k,
            rest_y + (deep_y - rest_y) * k,
            offset[2] + wobble(t, seed + 22) * 0.05 * k,
        )
        # Writhing only ramps in once there is something to writhe against.
        obj.rotation_euler = (
            rest_rot[0] + wobble(t, seed + 33) * rot_amp * k,
            rest_rot[1] + wobble(t, seed + 44) * rot_amp * 1.4 * k,
            rest_rot[2] + wobble(t, seed + 55) * rot_amp * k,
        )
        obj.keyframe_insert("location", frame=frame)
        obj.keyframe_insert("rotation_euler", frame=frame)


# Flex swing per joint, in radians, knuckle outward, and how far a knuckle works
# in and out along Y. Both are bounded by the press depth: whatever a digit adds
# to its forward reach at full clutch it has to give back at full slack, and a
# digit that gives back more than the press has lifted off the wall and
# disappeared.
#
# The ceiling is 90 degrees out of the wall: a digit carried past that curls its
# fingertip back *toward* the wall, so the deepest point starts retreating at
# exactly the moment it clenches hardest. Rest flexion and this swing have to
# share the room underneath it, and the split matters more than the total. Spent
# on rest flexion it buys a pose; spent here it buys articulation, and only the
# second one moves.
FINGER_CURL = (0.30, 0.34, 0.28)

# Per-digit swing scaling, index outward, thumb last. Nothing anatomical -- it
# is here so that no two digits ever traverse the same arc, which is what the
# eye actually uses to tell them apart.
FINGER_AMP = (1.00, 0.92, 1.06, 0.84, 0.70)

FINGER_DIG = 0.10
FINGER_LAG = 0.07  # fraction of the clip each joint trails the one before it

# How far each digit trails the one inboard of it, as a fraction of the clip.
#
# This is the difference between four fingers moving independently and a hand
# closing. Independence was already there -- every digit had its own noise seed
# and its own rate -- and independence alone reads as four separate things that
# happen to be attached, or, when they drift into agreement, as one rigid unit.
# What a hand reaching for something actually does is close in a wave, and a
# wave needs the digits to share a rhythm and differ by a *phase*, which noise
# by construction cannot give you.
FINGER_SWEEP = 0.13
FINGER_SWEEP_RATE = 0.85

# How much of the curl is the digit's own irregularity rather than the shared
# wave. All wave and the hand is a machine; all own and it is weeds in a
# current. This much keeps the sweep legible while stopping it from looking
# clocked.
FINGER_OWN = 0.38

# Fingers draw together as they close and fan as they open, because a hand
# reaching to grab converges on the thing it is grabbing. This is adduction
# coupled to the grip, not the side-to-side sway that used to live on these
# knuckles -- that was an oscillation of its own and read as seaweed. Tied to
# the curl it cannot oscillate independently; it can only tighten the grasp.
FINGER_ADDUCT = 0.42

# The dig runs on its own phase, and faster than the curl. Sharing the curl's
# noise -- which it used to -- meant a digit only ever bore down harder at the
# moment it was already closing, so the dig contributed no motion of its own,
# just more of the curl's.
#
# Decorrelating it costs amplitude, and the dig has to be sized knowing that:
# in phase the two swings add coherently, out of phase they partly cancel, so
# the same dig buys about half the fore-and-aft travel. It is worth paying,
# because coherent motion is the thing that makes four digits read as one
# mechanism -- but it has to be paid for, not ignored.
#
# The rate matters as much as the size. The curl is slow enough that it only
# traverses a third of its cycle during the press hold; at this rate the dig
# completes two or three, which is what turns it from a slow lean into a wiggle.
FINGER_DIG_RATE = 2.1


def _curl(t, i, j, seed, rate):
    """How closed digit i's joint j is at time t, in 0..1.

    Two components. The first is a rhythm shared by the whole hand, delayed by
    FINGER_SWEEP per digit and FINGER_LAG per joint, so closing travels outward
    across the hand and down each digit -- a wave, which is what a hand reaching
    for something does and what makes four digits read as one hand rather than
    four worms. The second is the digit's own noise on its own rate, which keeps
    the wave from looking clocked.

    The distinction that matters here is between independent and *out of phase*.
    Four digits on four noise seeds are independent, and independence is not
    articulation: it has no structure, so it reads as either four unrelated
    things or -- whenever the seeds drift into agreement, which they do -- as one
    rigid unit. A phase offset is the thing noise cannot supply, because it is
    precisely a correlation.
    """
    sweep = 0.5 + 0.5 * wobble(
        t * FINGER_SWEEP_RATE - FINGER_SWEEP * i - FINGER_LAG * j, seed)
    own = 0.5 + 0.5 * wobble((t - FINGER_LAG * j) * rate * 1.7, seed + i * 97)
    return (1.0 - FINGER_OWN) * sweep + FINGER_OWN * own


def animate_fingers(chains, seed, step=2):
    """Close each digit as part of a wave across the hand, not on its own clock.

    What makes it read as a hand reaching to grab:

      * Flexion only. Curl runs 0..1 and never goes negative, so a digit closes
        and opens instead of oscillating about a straight rest pose.
      * A phase, not just a seed. See _curl -- this is the whole difference
        between a hand closing and an arm with a fist on the end of it.
      * A wave down each digit as well as across the hand, so the curl travels
        knuckle to fingertip instead of the digit hinging as a rod.
      * Adduction tied to the curl, so the fingers converge as they close.
        Coupled rather than free, it cannot become the side-to-side sway that
        made an earlier version read as weeds in a current.

    The knuckle also works in and out along Y, and that is what sells it in this
    medium: pressed against a membrane and seen head-on, a fingertip bearing
    down harder is a brighter fingertip. That reads at a glance, where a few
    degrees of flexion on its own does not.
    """
    for i, chain in enumerate(chains):
        # chain[0] is the knuckle pivot and chain[1] rotates about the same
        # point, so the curl starts at chain[1] -- the pivot would otherwise
        # double the flex at the knuckle. The pivot digs and adducts instead.
        root, segs = chain[0], chain[1:]
        rest_x = [seg.rotation_euler.x for seg in segs]
        rest_y = root.location.y
        rest_splay = root.rotation_euler.y
        rate = 0.75 + 0.21 * i
        amp = FINGER_AMP[i % len(FINGER_AMP)]

        for frame in range(1, FRAMES + 1, step):
            t = (frame - 1) / (FRAMES - 1)
            k = press_curve(t)
            for j, seg in enumerate(segs):
                seg.rotation_euler.x = (
                    rest_x[j] + FINGER_CURL[j] * amp * _curl(t, i, j, seed, rate) * k)
                seg.keyframe_insert("rotation_euler", frame=frame)

            grip = _curl(t, i, 0, seed, rate)
            # Only .y moves; .x carries the digit's rest flexion bias.
            root.rotation_euler.y = rest_splay * (1.0 - FINGER_ADDUCT * grip * k)
            root.keyframe_insert("rotation_euler", frame=frame)

            dig = 0.5 + 0.5 * wobble(t * rate * FINGER_DIG_RATE, seed + i * 97 + 7)
            root.location.y = rest_y - FINGER_DIG * dig * k
            root.keyframe_insert("location", frame=frame)


# ------------------------------------------------- membrane solve and shading

def box_blur(a, r):
    """Separable box blur with edge clamping, via summed-area along each axis."""
    if r < 1:
        return a
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]
        pad[axis] = (r + 1, r)
        p = np.pad(a, pad, mode="edge")
        c = np.cumsum(p, axis=axis)
        lo = np.take(c, np.arange(0, a.shape[axis]), axis=axis)
        hi = np.take(c, np.arange(2 * r + 1, a.shape[axis] + 2 * r + 1), axis=axis)
        a = (hi - lo) / (2 * r + 1)
    return a


DRAPE_PASSES = 5  # relaxation passes per level of the radius schedule

# The sheet's smoothing scale, in world units. It is a property of the wall, so
# it has to be the same for every clip no matter how each one is framed.
#
# Deriving it from the frame width instead (res_x * 0.016) looks equivalent and
# is not: face-hands is a wide frame holding a head no bigger than face-a's, so
# the same subject got more than twice the smoothing and came out visibly
# mushier than it does in a square frame.
DRAPE_SCALE = 0.032

# How hard the sheet is held against whatever is behind it, per pass at the
# coarsest radius, as a fraction of the clip's full press depth.
#
# This is the thickness dial, and it is the difference between cling film and a
# mattress protector. At zero the solve converges on a taut inextensible sheet,
# which bridges straight across an open mouth and skirts out with a long, lazy
# shoulder. Raising it pushes unsupported fabric back down: the mouth becomes a
# hollow, the webbing between fingers pulls in, and the skirt dies over a short
# distance with the concave profile that reads as tension.
DRAPE_SAG = 0.055


def _radius_schedule(radius, passes):
    """Blur radii for one solve, coarse to fine.

    Relaxing at a single radius conflates two things that radius controls at
    once: how far the solve carries the sheet's support outward, and how much
    detail survives the blur on the way. At the one radius wide enough to build
    a drape, a nose is 24px across and a 20px blur erases it -- which is exactly
    how a face ends up an inflated balloon.

    Going coarse to fine separates them. The wide early passes carry support out
    to where the drape has to reach; the narrow later passes let the sheet
    settle back down onto the nose, the lip rims and the knuckles. A box blur
    costs the same at any radius, so this is free.
    """
    levels = []
    r = radius
    while r > 1:
        levels.append(r)
        r = max(1, int(r * 0.55))
    levels.append(1)
    return [lvl for lvl in levels for _ in range(passes)]


def drape(obstacle, radius, height_scale):
    """Relax a membrane over the obstacle height field.

    Blur, sag, clamp back to the obstacle, repeatedly:

      * the blur is the sheet resisting curvature, and is what spreads a bulge
        outward into a drape and webs across the gap between two fingers;
      * the sag is the pressure holding it against what is behind it, and is
        what keeps it thin (see DRAPE_SAG);
      * the clamp is the sheet being unable to pass through what it covers, and
        is what keeps knuckles and lips crisp instead of dissolving into the
        blur.

    Sag scales with the square of the blur radius so it means the same thing at
    every level of the schedule: a blur-and-sag step settles where
    blur(h) - sag == h, and blur(h) - h goes as radius squared times curvature.
    A flat sag would be swamped at the coarse levels and dominate at the fine
    ones.

    Nothing is pinned, so it decays to flat on its own. That is the whole reason
    this beats a cloth sim here: no global tent, and the background stays at
    exactly zero.
    """
    h = obstacle.copy()
    for r in _radius_schedule(radius, DRAPE_PASSES):
        sag = DRAPE_SAG * height_scale * (r / radius) ** 2
        h = np.maximum(box_blur(h, r) - sag, obstacle)
    return h


# Radial stretch creases were tried here and removed. Taking them as iso-lines of
# the height gradient's direction -- sin(n * theta), which fans n creases around
# every bulge -- is cheap and needs no noise field, but it fixes the crease
# *count* rather than their spacing, so they converge wherever the bulge is
# small. Every fingertip came out wearing a fringe of bristles. Constant spacing
# would need the count to grow with radius, which that formulation cannot say.
NEUTRAL = 0.5


def shade(h, world_per_px, mask_scale, mask_power=0.85, light=(-0.50, -0.62, 0.60),
          gain_lit=1.25, gain_shade=0.75):
    """Turn the draped height field into a frame centred on neutral grey.

    The output is *signed relief*, not brightness. Flat wall renders exactly
    NEUTRAL, slopes tilted into the light render above it, slopes tilted away
    render below it. Composited with soft-light, NEUTRAL means "change nothing",
    so the wall keeps its own colour everywhere and only its shading moves.

    This is the whole reason the apparitions are not white. An earlier version
    shaded unsigned -- flat wall was black, everything else was positive light,
    screen-blended on. Screen can only ever add toward white, so a face came out
    as pale light laid over the wallpaper rather than as the wallpaper itself
    being pushed out of shape. No amount of tinting fixes that; the signal has
    to be able to go negative, and the blend has to be one that leaves a neutral
    source alone.

    Hence the subtraction below: a flat surface's own dot product is the zero
    point, so flatness produces nothing rather than producing grey.
    """
    # Row index increases upward (Blender's bottom-up pixel order), so the
    # gradient signs here line up with a light whose +Z component is "above".
    dz, dx = np.gradient(h, world_per_px)
    n = np.stack([-dx, -np.ones_like(h), -dz], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)

    lv = np.array(light, dtype=np.float64)
    lv /= np.linalg.norm(lv)
    flat_response = np.array([0.0, -1.0, 0.0]) @ lv
    signed = (n @ lv) - flat_response

    # Asymmetric on purpose, and each side is pushed to just short of clipping.
    # The dot product swings much further negative than positive (-0.62 vs
    # +0.38 about flat), so a single gain either crushes the shadow side to
    # black or wastes most of the headroom on the lit side. Separate gains use
    # the full range both ways.
    #
    # Getting the lit side as bright as possible matters more than it looks:
    # soft-light over a wall this dark lightens only weakly, so a timid
    # highlight leaves the apparitions reading as stains rather than as
    # something bulging out toward the light.
    swing = np.where(signed >= 0.0, signed * gain_lit, signed * gain_shade)

    # Still masked by protrusion, but softly: this only fences the effect in and
    # suppresses solver noise out in the flat, since flat regions already
    # resolve to NEUTRAL on their own.
    mask = np.clip(h / mask_scale, 0.0, 1.0) ** mask_power
    return np.clip(NEUTRAL + mask * swing, 0.0, 1.0)


def edge_fade(shape, margin=0.06):
    """Ramp the frame border back to neutral (applied as a lerp toward NEUTRAL).

    The drape spreads outward, and without this an apparition placed near the
    edge of its clip ends in a straight vertical cut -- which on the page reads
    instantly as a video rectangle rather than as something behind the wall.
    """
    rows, cols = shape
    fz = np.clip(np.minimum(np.arange(rows), rows - 1 - np.arange(rows)) / (rows * margin), 0, 1)
    fx = np.clip(np.minimum(np.arange(cols), cols - 1 - np.arange(cols)) / (cols * margin), 0, 1)
    f = np.outer(fz, fx)
    return f * f * (3 - 2 * f)


# ---------------------------------------------------------------------- clips

# press: how far past the wall an object's *foremost* point travels, per object.
# It has to exceed the depth of the features you want to read -- press a head
# only 0.2 and just the nose tip breaks the plane, giving a bright dot instead
# of a face.
#
# Hands used to want far less than a head, on the reasoning that a palm is
# shallow. That stopped being true when they were tipped forward: a tilted,
# half-closed hand is nearly as deep as it is wide, and measured on the built
# geometry its fingertips lead its palm by 0.44 -- so pressed the old 0.20 the
# palm cleared the wall by 0.01 and the clip was four fingers floating in front
# of nothing. Press has to cover that gap plus however far into the wall you
# want the palm itself.
#
# Press and mask are world distances against geometry that is scaled per clip,
# so both track the hand's own scale. Leave them flat across clips and the small
# hands in face-hands get pressed proportionally twice as deep as the big one in
# hand-a and come out as featureless plateaus.
#
# height: the deepest press in the clip, used to normalise the height encoding.
#
# mask: the protrusion at which a surface reaches full brightness. Set per clip
# rather than derived from height, because a hand is far shallower than a head:
# scaling both against the same deep normalisation leaves the hands a smudge.
CLIPS = {
    "face-a": dict(res=(512, 512), ortho=2.3, height=0.52, mask=0.38,
                   heads=[(0, 0.82, (0.0, 0.0, 0.0), 0.52)], hands=[]),
    "face-b": dict(res=(512, 512), ortho=2.3, height=0.56, mask=0.40,
                   heads=[(1, 0.78, (0.05, 0.0, -0.04), 0.56)], hands=[]),
    "face-c": dict(res=(512, 512), ortho=2.3, height=0.50, mask=0.36,
                   heads=[(2, 0.86, (-0.04, 0.0, 0.03), 0.50)], hands=[]),
    # The stare presses shallower than the rest on purpose. Its expression is
    # carried entirely by two deep sockets, and driving it as far through as a
    # scream floods the whole face bright enough that the sockets stop being the
    # darkest thing in the frame, which is the only thing holding it together.
    "face-d": dict(res=(512, 512), ortho=2.3, height=0.46, mask=0.33,
                   heads=[(3, 0.80, (0.03, 0.0, -0.02), 0.46)], hands=[]),
    "face-e": dict(res=(512, 512), ortho=2.3, height=0.54, mask=0.39,
                   heads=[(4, 0.84, (-0.02, 0.0, 0.02), 0.54)], hands=[]),
    # Hand presses run deeper than they used to, and the height headroom above
    # them is much wider. Both are the grasp: the press is now the *mean* reach
    # of a digit that is working in and out, so it has to clear the slack end of
    # that swing, and the height has to clear the clutching end.
    #
    # Height is roughly twice the press, which looks extravagant and is not. A
    # fingertip at full clutch reaches far past the mean the press is measured
    # from -- at height 0.26 the tips saturated on 9 frames in 144, flattening
    # the one part of the hand you most want to read into a white plateau.
    # Hand masks track the depth the digits actually reach, not the nominal
    # press. They were left at 0.15 when the press went up, which saturated the
    # mask across the whole hand -- and a saturated mask means depth stops
    # mapping to brightness, so a finger bearing down harder looked exactly like
    # one easing off. All the fore-and-aft motion was there and none of it was
    # visible.
    "hand-a": dict(res=(448, 512), ortho=1.32, height=0.74, mask=0.28,
                   heads=[], hands=[(0.92, False, (0.02, 0.0, -0.02), 0.49)]),
    "hand-b": dict(res=(448, 512), ortho=1.38, height=0.77, mask=0.29,
                   heads=[], hands=[(0.96, True, (0.0, 0.0, -0.01), 0.51)]),
    "hands-pair": dict(res=(768, 480), ortho=2.9, height=0.69, mask=0.26,
                       heads=[], hands=[(0.86, False, (-0.72, 0.0, 0.0), 0.46),
                                        (0.86, True, (0.76, 0.0, 0.08), 0.45)]),
    # One mask serves both subjects here, so it is a compromise: high enough
    # that the digits still modulate with depth, low enough that it does not
    # drain the head, which is far deeper than they are.
    "face-hands": dict(res=(832, 512), ortho=3.7, height=0.56, mask=0.24,
                       heads=[(0, 0.74, (0.0, 0.0, 0.05), 0.50)],
                       hands=[(0.68, False, (-1.02, 0.0, -0.16), 0.36),
                              (0.68, True, (1.06, 0.0, -0.10), 0.35)]),
}


def build_clip(name):
    cfg = CLIPS[name]
    clear_scene()
    setup_render(cfg["res"][0], cfg["res"][1], cfg["ortho"])
    mat = height_material(cfg["height"])

    seed = abs(hash(name)) % 10000
    for i, (variant, scale, offset, press) in enumerate(cfg["heads"]):
        head = build_head(variant, scale, mat)
        animate_press(head, offset, press, seed + i * 137, rot_amp=0.20)

    for i, (scale, mirror, offset, press) in enumerate(cfg["hands"]):
        palm, chains = build_hand(f"hand{i}", scale, mat, mirror)
        # Fingers first: press depth is measured from the foremost point, and
        # with jointed digits that is a fingertip whose position depends on the
        # rest flexion these keyframes establish.
        animate_fingers(chains, seed + 900 + i * 311)
        animate_press(palm, offset, press, seed + 500 + i * 211, rot_amp=0.13,
                      rest_rot=(HAND_TILT, 0.0, 0.0))
    return cfg


def read_gray(path, shape):
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = "Non-Color"  # read the stored numbers, not a picture
    buf = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(buf)
    bpy.data.images.remove(img)
    return buf.reshape(shape[0], shape[1], 4)[:, :, 0].astype(np.float64)


def write_gray(path, a):
    rows, cols = a.shape
    img = bpy.data.images.new("out", width=cols, height=rows, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    rgba = np.empty((rows, cols, 4), dtype=np.float32)
    rgba[:, :, 0] = rgba[:, :, 1] = rgba[:, :, 2] = a
    rgba[:, :, 3] = 1.0
    img.pixels.foreach_set(rgba.ravel())
    img.file_format = "PNG"
    img.filepath_raw = path
    img.save()
    bpy.data.images.remove(img)


def render_clip(name, cfg, out_dir):
    scene = bpy.context.scene
    res_x, res_y = cfg["res"]
    height_scale = cfg["height"] * 1.05  # matches the material's normalisation
    mask_scale = cfg["mask"]

    frame_dir = os.path.join(out_dir, "frames", name)
    raw_dir = os.path.join(out_dir, "_height", name)
    os.makedirs(frame_dir, exist_ok=True)
    os.makedirs(raw_dir, exist_ok=True)

    world_per_px = cfg["ortho"] / res_x
    radius = max(2, round(DRAPE_SCALE / world_per_px))
    soften = max(1, int(res_x * 0.005))
    fade = edge_fade((res_y, res_x))

    for frame in range(1, FRAMES + 1):
        scene.frame_set(frame)
        raw = os.path.join(raw_dir, f"h{frame:04d}.png")
        scene.render.filepath = raw
        bpy.ops.render.render(write_still=True)

        obstacle = read_gray(raw, (res_y, res_x)) * height_scale
        h = drape(obstacle, radius, height_scale)
        # A final softening pass. Not cosmetic: the height field is quantised to
        # a pixel grid, and its gradient turns that staircase into faint
        # terracing across every smooth surface.
        img = box_blur(shade(h, world_per_px, mask_scale), soften)
        # Toward NEUTRAL, not toward zero -- fading to black would paint a dark
        # border that soft-light would then burn into the wallpaper.
        img = NEUTRAL + (img - NEUTRAL) * fade
        write_gray(os.path.join(frame_dir, f"f{frame:04d}.png"), img)

        if frame % 24 == 0:
            print(f"    {frame}/{FRAMES}", flush=True)

    return frame_dir


def main():
    global FRAMES
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--clip", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--frames", type=int, default=FRAMES)
    args = ap.parse_args(argv)
    FRAMES = args.frames

    names = list(CLIPS) if args.clip == "all" else [args.clip]
    for name in names:
        print(f"[{name}] building", flush=True)
        cfg = build_clip(name)
        print(f"[{name}] rendering", flush=True)
        render_clip(name, cfg, args.out)
        print(f"[{name}] done", flush=True)


if __name__ == "__main__":
    main()
