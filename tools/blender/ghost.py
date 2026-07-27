"""
Generates the ghost mascot clips for 919gaming.com.

The ghost is built and animated procedurally in Blender, like the wall
apparitions and for the same reason: no external assets, and every part of the
look is a number somebody can change later.


WHY HE IS RENDERED ON BLACK, AND WHAT THAT BUYS

He composites onto the page with mix-blend-mode:screen. Screen leaves black
completely alone and can only ever lighten, which is doing four jobs at once:

  * No alpha channel. Screen *is* the transparency, so these are ordinary
    H.264/VP9 clips with no matte, no canvas compositing step and no WebGL --
    the same compatibility surface as the apparitions already on the page.
  * Real translucency for free. Screen preserves the backdrop underneath dim
    source pixels, so the damask weave reads straight through his body rather
    than being covered by it. He is *see-through*, not a cut-out at 60% opacity.
  * The face costs nothing. Screen cannot darken, so his eyes and mouth are
    simply places he does not glow, and the dark wall shows through them. A
    ghost's features are holes in the glow, which is exactly what we want.
  * Density reads as depth. Brighter is more opaque, so the fade down his tail
    is a genuine dissolve rather than a gradient painted on top of a solid.

The consequence to keep in mind is the one screen always has: he can only add
light. Over the burgundy wall that is the whole point; over a bright book cover
he will wash out, which is part of why he collides with the tomes on the page
rather than drifting across them.


WHY THERE ARE NO KEYFRAMES IN HERE

The wall apparitions keyframe object transforms because their subjects are
rigid. The ghost's hem has to undulate, which is vertex motion, and rigging that
would mean an armature or shape keys for something that is one line of
trigonometry. Since we drive the render loop ourselves, the mesh is simply
rebuilt at each frame before it is rendered. No rig, no keyframes, no
interpolation to fight.

Usage:
  blender -b -P ghost.py -- --clip idle --out DIR
  blender -b -P ghost.py -- --clip all --out DIR
"""

import argparse
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix

FPS = 24


# ------------------------------------------------------------------ the body
#
# A surface of revolution, sampled on a (ring, segment) grid and rebuilt every
# frame. RINGS runs from the crown of the head down to the hem.
RINGS = 64
SEGMENTS = 72

HEAD_R = 0.62      # head radius; also the body's widest point
HEAD_CZ = 0.35     # height of the head's centre, i.e. where the dome ends
BODY_LEN = 1.50    # from there down to the hem

WAIST = 0.16       # how much the body pinches under the head, as a fraction
FLARE = 0.42       # how much the skirt opens back out toward the hem

# The hem's undulation. WAVE_N is how many lobes run around him -- three is
# deliberate: two reads as a flat ribbon seen edge-on and four starts to look
# like a jellyfish.
WAVE_N = 3
WAVE_R = 0.15      # lobe depth, radially
WAVE_Z = 0.20      # lobe depth, vertically -- the hem lifts and dips
WAVE_SPEED = 1.0   # cycles per clip


def _profile(t):
    """Radius and height at parameter t, 0 at the crown and 1 at the hem."""
    if t <= 0.5:
        # A true hemisphere for the head, so the crown is round rather than
        # conical. Sampling by angle rather than by height is what keeps the
        # rings evenly spaced over the curve.
        a = (t / 0.5) * (math.pi / 2)
        return HEAD_R * math.sin(a), HEAD_CZ + HEAD_R * math.cos(a)

    u = (t - 0.5) / 0.5
    r = HEAD_R * (1.0 - WAIST * math.sin(u * math.pi))
    # smoothstep, so the skirt opens gradually instead of kinking at the waist
    f = min(1.0, max(0.0, (u - 0.55) / 0.45))
    r *= 1.0 + FLARE * f * f * (3 - 2 * f)
    return r, HEAD_CZ - u * BODY_LEN


def body_coords(phase):
    """Every vertex of the body at a given point in the loop.

    phase is in turns, not seconds, so a clip loops seamlessly when it covers a
    whole number of them.
    """
    t = np.linspace(0.0, 1.0, RINGS)
    theta = np.linspace(0.0, 2.0 * math.pi, SEGMENTS, endpoint=False)

    prof = np.array([_profile(v) for v in t])
    r = prof[:, 0][:, None]
    z = prof[:, 1][:, None]

    # The wave only exists on the skirt. Ramping it in over the lower half
    # rather than applying it everywhere is what stops his shoulders wobbling.
    u = np.clip((t - 0.5) / 0.5, 0.0, 1.0)
    ramp = np.clip((u - 0.35) / 0.65, 0.0, 1.0) ** 2
    ramp = ramp[:, None]

    swing = np.sin(WAVE_N * theta[None, :] + phase * 2.0 * math.pi)
    r = r + WAVE_R * ramp * swing
    z = z + WAVE_Z * ramp * np.sin(
        WAVE_N * theta[None, :] + phase * 2.0 * math.pi + 0.9)

    x = r * np.cos(theta)[None, :]
    y = r * np.sin(theta)[None, :]
    return np.stack([x, y + 0.0 * x, z + 0.0 * x], axis=-1).reshape(-1, 3)


def build_body(mat):
    verts = body_coords(0.0)
    faces = []
    for i in range(RINGS - 1):
        for j in range(SEGMENTS):
            k = (j + 1) % SEGMENTS
            a = i * SEGMENTS + j
            b = i * SEGMENTS + k
            faces.append((a, b, b + SEGMENTS, a + SEGMENTS))

    mesh = bpy.data.meshes.new("ghost_body")
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.validate()
    obj = bpy.data.objects.new("ghost_body", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)

    sub = obj.modifiers.new("Subdivision", "SUBSURF")
    sub.levels = 0
    sub.render_levels = 1
    for p in mesh.polygons:
        p.use_smooth = True
    return obj


def set_body(obj, phase):
    """Push a new pose straight into the vertex buffer."""
    obj.data.vertices.foreach_set("co", body_coords(phase).ravel())
    obj.data.update()


# ------------------------------------------------------------------ the face
#
# Features are separate solid meshes sitting just proud of the head, and they
# are black. Against a screen-blended body that makes them holes in the glow --
# see the module docstring. Their scale is the entire expression system: a
# ghost with no brow and no mouth corners has only size and position to work
# with, which turns out to be plenty.

EYE_X = 0.235
EYE_Z = 0.60
MOUTH_Z = 0.30

# name -> (eye width, eye height, eye tilt deg, mouth width, mouth height)
#
# The mouths are all larger than they first were. At the size that looks correct
# next to the eyes on a face this simple, it renders as a full stop -- there is
# no lip, no shadow and no colour to help it, so it has to carry its meaning on
# area alone.
MOODS = {
    "calm":      (0.115, 0.135, 0.0, 0.105, 0.090),
    "curious":   (0.125, 0.160, -6.0, 0.090, 0.115),
    "playful":   (0.120, 0.100, 0.0, 0.150, 0.075),    # squinting, wide grin
    "shocked":   (0.165, 0.205, 0.0, 0.130, 0.180),    # everything open
    "pleased":   (0.130, 0.075, 0.0, 0.140, 0.060),    # eyes shut happy
}


def build_face(mat):
    parts = {}
    for name, x in (("eye_l", -EYE_X), ("eye_r", EYE_X)):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1.0)
        o = bpy.context.object
        o.name = f"ghost_{name}"
        o.data.materials.append(mat)
        bpy.ops.object.shade_smooth()
        parts[name] = o
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1.0)
    m = bpy.context.object
    m.name = "ghost_mouth"
    m.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    parts["mouth"] = m
    return parts


def mood_mix(a, b, k):
    """Blend two mood tuples, so an expression can change mid-clip."""
    k = min(1.0, max(0.0, k))
    return tuple(x + (y - x) * k for x, y in zip(MOODS[a], MOODS[b]))


def set_face(parts, face, blink=0.0, look=0.0):
    """Place the features. `face` is a mood tuple, not a name -- see mood_mix.

    look shifts the eyes sideways. On a face with no pupils that shift *is* the
    gaze: there is nothing else in there that can point anywhere.
    """
    ew, eh, tilt, mw, mh = face
    dx = look * 0.075
    # Rotation is about Y, not Z. The camera looks down Y, so Y is the axis
    # that turns a feature within the visible plane; a Z rotation spins these
    # flattened ellipsoids about their own short axis and renders identically,
    # which is why the eye tilts did nothing at all until now.
    for name, sx in (("eye_l", -1.0), ("eye_r", 1.0)):
        o = parts[name]
        o.scale = (ew, 0.10, eh * (1.0 - 0.92 * blink))
        # Features recede slightly as they travel off-centre, so they stay on
        # the curve of the head instead of floating off its edge.
        o.location = (EYE_X * sx + dx, -0.50 + 0.05 * look * look, EYE_Z)
        o.rotation_euler = (0.0, math.radians(tilt) * sx, 0.0)
    parts["mouth"].scale = (mw, 0.10, mh)
    parts["mouth"].location = (dx * 0.6, -0.52 + 0.04 * look * look, MOUTH_Z)


# ------------------------------------------------------------------ the arms

def build_arm(name, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1.0)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    sub = o.modifiers.new("Subdivision", "SUBSURF")
    sub.levels = 0
    sub.render_levels = 1
    return o


def set_arm(obj, side, swing, reach=0.0, lift=0.0):
    """Little tapered nubs. `reach` extends one sideways; `lift` raises its arc.

    Height is the whole trick for reading them as arms. Level with the head --
    where they started, since that is the body's widest point and the obvious
    place to hang them -- they read unmistakably as ears, and he became a
    rabbit. Dropped to the waist they are arms. They also have to *break* the
    silhouette: tucked fully in front of the body, the same shape rendered as a
    faint outlined oval, because a translucent thing over an equally translucent
    thing shows only its rim.

    Reach goes sideways rather than toward the camera, which is what makes the
    poke legible. He lives in a flat page next to flat tomes; an arm extending
    at the viewer is a foreshortened blob, while one extending across the page
    visibly arrives at the thing it is prodding.
    """
    obj.scale = (0.12, 0.09, 0.21 + 0.20 * reach)
    # Comes forward as it extends. At rest it sits inside the body and only the
    # part clear of the silhouette shows, which is what we want; but held there
    # while extending, its inner half stayed buried behind a dim patch of torso
    # and the arm read as a detached disc floating beside him.
    obj.location = (side * (0.55 + 0.40 * reach),
                    -0.16 - 0.55 * reach,
                    -0.32 + 0.07 * math.sin(swing) + 0.30 * lift)
    # Rotation about Y is what swings a limb within the visible plane. The
    # earlier Z rotation was a no-op: these ellipsoids are near-symmetric about
    # their own long axis, so spinning them about it changed nothing on screen.
    # At rest they splay outward and down; at full reach they lie horizontal.
    swing_deg = -26.0 + 12.0 * math.sin(swing) + 116.0 * reach - 34.0 * lift
    obj.rotation_euler = (0.0, side * math.radians(swing_deg), 0.0)


# --------------------------------------------------------------- the material

# Where the light comes from, in world space. The camera looks down +Y, so -Y is
# toward the viewer: this is up, to his left, and slightly forward.
KEY_DIR = (-0.46, -0.50, 0.73)
KEY_MIN = 0.60     # emission multiplier on his shadow side
KEY_MAX = 1.34     # and on his lit side

# How much of his glow survives on the far wall of his own body -- see
# ghost_material. Low enough that looking up the open hem stays dark.
#
# It is also the density dial. Two-sided rendering adds a second layer of ghost
# to most of his area, and at the value that first looked right in isolation
# (0.34) it lifted his mean brightness by two thirds -- he gained depth and lost
# the see-through, which is a bad trade on a wall whose damask is the point.
BACK = 0.20


def ghost_material():
    """Emission, brightest at the silhouette and dying out down the tail.

    Three things give him volume, and each answers a different question the eye
    asks about a shape.

    FRESNEL -- "surface, or disc?" Weighting emission toward grazing angles
    gives the rim-bright, centre-dim falloff of something being seen into. Flat
    emission renders as a readable but entirely papery blob.

    A KEY DIRECTION -- "which way is it turned?" Fresnel is symmetric about the
    view axis, so on its own every part of the rim is equally bright and the
    head reads as a ring rather than a dome. Weighting by the surface normal
    against a fixed direction gives him a lit side and a shadow side. Of the
    three this is the one that does the most for the least.

    TWO-SIDED TRANSPARENCY -- "how thick is it?" With backfaces culled, every
    pixel of him was exactly one layer of ghost thick, and no amount of shading
    fixes that, because the information is not in the render to begin with.
    Blended and unculled, the far wall of his body shows faintly through the
    near wall: the hem crosses in front of his own tail, the inside of the dome
    sits behind his face, and the places where he folds over himself are
    genuinely brighter. That is thickness measured rather than painted, and it
    is the only one of the three that survives him turning around.

    The reason backfaces were culled in the first place is still real, and BACK
    is what handles it instead: the body is an open tube, so at the hem we look
    straight up the inside, which is all grazing angles, so fresnel lit it and
    the tail rendered as the brightest part of him -- precisely backwards for
    something dissolving into a wall. Dimming backfaces to a fifth fixes that at
    the source rather than throwing away the depth cue along with it.
    """
    mat = bpy.data.materials.new("ghost")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    fres = nt.nodes.new("ShaderNodeFresnel")
    fres.inputs["IOR"].default_value = 1.32

    ramp = nt.nodes.new("ShaderNodeValToRGB")
    # The centre has to be *much* dimmer than looks right in isolation. Judged
    # on black he then reads as underexposed; judged on the wall, which is the
    # only place he is ever seen, this is what lets the damask through him. He
    # is a translucent thing, so his interior is mostly backdrop by design.
    ramp.color_ramp.elements[0].position = 0.04
    ramp.color_ramp.elements[0].color = (0.045, 0.045, 0.045, 1)   # centre
    ramp.color_ramp.elements[1].position = 0.80
    ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1)         # rim

    # Height fade, so he dissolves into nothing rather than ending at a hem.
    coord = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    fade = nt.nodes.new("ShaderNodeMapRange")
    # Starts well up the body rather than at the hem: a fade confined to the
    # last few centimetres is a cut-off with a soft edge, not a dissolve.
    fade.inputs["From Min"].default_value = HEAD_CZ - BODY_LEN * 0.92
    fade.inputs["From Max"].default_value = HEAD_CZ - BODY_LEN * 0.10
    fade.inputs["To Min"].default_value = 0.0
    fade.inputs["To Max"].default_value = 1.0
    fade.clamp = True

    # Wispiness. Low detail on purpose: this is meant to read as him being
    # unevenly *there*, not as a marble texture.
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 2.6
    noise.inputs["Detail"].default_value = 2.0
    nmix = nt.nodes.new("ShaderNodeMapRange")
    nmix.inputs["To Min"].default_value = 0.72
    nmix.inputs["To Max"].default_value = 1.18
    nmix.clamp = True

    # The key direction. Dotting the shading normal against a fixed vector is
    # the whole of it -- there is no lamp in the scene and there cannot be one,
    # because emission does not receive light.
    n = math.sqrt(sum(c * c for c in KEY_DIR))
    dot = nt.nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    dot.inputs[1].default_value = tuple(c / n for c in KEY_DIR)
    key = nt.nodes.new("ShaderNodeMapRange")
    # Not from -1: a full hemisphere of falloff turns his shadow side off
    # entirely and he reads as a crescent. Compressing the range keeps the whole
    # silhouette present and only *grades* it.
    key.inputs["From Min"].default_value = -0.35
    key.inputs["From Max"].default_value = 0.95
    key.inputs["To Min"].default_value = KEY_MIN
    key.inputs["To Max"].default_value = KEY_MAX
    key.clamp = True

    # Backface dimming, which is what makes two-sided rendering usable here.
    back = nt.nodes.new("ShaderNodeMapRange")
    back.inputs["To Min"].default_value = 1.0    # front faces, unchanged
    back.inputs["To Max"].default_value = BACK   # far wall, seen through him
    back.clamp = True

    m1 = nt.nodes.new("ShaderNodeMath")
    m1.operation = "MULTIPLY"
    m2 = nt.nodes.new("ShaderNodeMath")
    m2.operation = "MULTIPLY"
    m4 = nt.nodes.new("ShaderNodeMath")
    m4.operation = "MULTIPLY"
    m5 = nt.nodes.new("ShaderNodeMath")
    m5.operation = "MULTIPLY"

    emit = nt.nodes.new("ShaderNodeEmission")
    # Faintly cold, so he sits apart from the warm burgundy rather than tinting
    # into it. Screen multiplies these against the wall, so the blue only shows
    # where he is bright.
    emit.inputs["Color"].default_value = (0.78, 0.88, 1.0, 1.0)
    emit.inputs["Strength"].default_value = 1.15   # overall brightness

    # Density doubles as coverage: the one number that says how brightly a patch
    # of him glows also says how much of what is behind it he hides. That is the
    # right relationship for a translucent thing and it costs nothing -- his dim
    # interior is 95% backdrop, his bright rim is nearly opaque.
    #
    # It has to arrive as the mix factor and NOT as emission strength. Feed it
    # to both and the density is squared, which crushes the interior to nothing
    # and leaves only the rim: a chalk outline of a ghost.
    alpha = nt.nodes.new("ShaderNodeClamp")
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    out = nt.nodes.new("ShaderNodeOutputMaterial")

    nt.links.new(fres.outputs[0], ramp.inputs[0])
    nt.links.new(coord.outputs["Position"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], fade.inputs[0])
    nt.links.new(coord.outputs["Normal"], dot.inputs[0])
    nt.links.new(dot.outputs["Value"], key.inputs[0])
    nt.links.new(coord.outputs["Backfacing"], back.inputs[0])
    nt.links.new(noise.outputs["Fac"], nmix.inputs[0])
    nt.links.new(ramp.outputs["Color"], m1.inputs[0])
    nt.links.new(fade.outputs[0], m1.inputs[1])
    nt.links.new(m1.outputs[0], m2.inputs[0])
    nt.links.new(nmix.outputs[0], m2.inputs[1])
    nt.links.new(m2.outputs[0], m4.inputs[0])
    nt.links.new(key.outputs[0], m4.inputs[1])
    nt.links.new(m4.outputs[0], m5.inputs[0])
    nt.links.new(back.outputs[0], m5.inputs[1])
    nt.links.new(m5.outputs[0], alpha.inputs[0])
    nt.links.new(clear.outputs[0], mix.inputs[1])
    nt.links.new(emit.outputs[0], mix.inputs[2])
    nt.links.new(alpha.outputs[0], mix.inputs[0])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])

    # Two-sided and blended. Both halves matter: unculled but opaque, the near
    # wall simply z-buffers the far one away and nothing changes at all.
    mat.use_backface_culling = False
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "BLENDED"      # EEVEE Next
    else:
        mat.blend_method = "BLEND"                 # legacy EEVEE
    if hasattr(mat, "use_transparency_overlap"):
        # Off, this keeps only the nearest transparent layer -- which is exactly
        # the single-layer render we are trying to get away from.
        mat.use_transparency_overlap = True
    if hasattr(mat, "show_transparent_back"):
        mat.show_transparent_back = True
    return mat


def dark_material():
    mat = bpy.data.materials.new("ghost_dark")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = 0.0   # black: a hole in the glow
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    return mat


# ---------------------------------------------------------------- scene setup

# Square, and generous relative to the size he is drawn at, because he is a soft
# glowing thing with no hard edge anywhere on him -- resampling costs him very
# little, and the alternative is re-rendering the library every time the page
# wants him bigger. ORTHO is the world width the frame covers; his silhouette is
# about 1.1 of the 3.5 units across, so roughly a third of the frame is him.
RES = 512
ORTHO = 3.5


def setup(res, ortho):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.eevee.taa_render_samples = 24

    world = bpy.data.worlds.new("void")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0, 0, 0, 1)
    bg.inputs[1].default_value = 0.0
    scene.world = world

    cam_data = bpy.data.cameras.new("cam")
    # Orthographic, so his silhouette is identical wherever he ends up on the
    # page. A perspective lens would make him subtly wrong every time the page
    # scales him, and scale is set at runtime here, not at render time.
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ortho
    cam = bpy.data.objects.new("cam", cam_data)
    # Framed on his own centre of mass, not on the world origin: he hangs well
    # below it, and centring on zero put the hem through the bottom edge.
    cam.location = (0.0, -6.0, -0.20)
    cam.rotation_euler = (math.radians(90), 0.0, 0.0)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return scene


# --------------------------------------------------------------------- clips

def _step(a, b, x):
    """smoothstep, clamped."""
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def _pulse(centre, width, x):
    """1.0 at centre, falling to 0 either side. For blinks and hits."""
    return max(0.0, 1.0 - abs(x - centre) / width)


# Every pose function takes t in [0, 1) and returns the full state of the ghost
# at that moment. Splitting it out this way is what lets one render loop serve
# every clip, and it means a new behaviour is a function rather than a rig.
#
# Every clip opens and closes on the same neutral pose -- no bob, no lean, arms
# down, calm face. That is what lets the page cut between them without a
# crossfade. Crossfading was the obvious approach and is wrong here: two
# screen-blended clips overlapping both add light, so the ghost would flare
# brighter every time he changed his mind.

def _base(t, mood="calm", bob=1.0, blink_at=0.82):
    return dict(
        phase=t,
        bob=0.06 * math.sin(t * 2 * math.pi) * bob,
        lean=0.045 * math.sin(t * 2 * math.pi + 1.1) * bob,
        stretch=1.0,
        face=MOODS[mood],
        blink=_pulse(blink_at, 0.045, t) if blink_at is not None else 0.0,
        look=0.0,
        arm_l=(0.0, 0.0),   # (reach, lift)
        arm_r=(0.0, 0.0),
        swing_l=t * 2 * math.pi,
        swing_r=t * 2 * math.pi + 2.2,
    )


def pose_idle(t):
    return _base(t)


def pose_drift(t):
    """Leaning into the direction of travel, hem streaming behind him.

    The page moves him; this only sells that he is under way. The lean is
    constant rather than oscillating, because a lean that returns to upright
    reads as swaying on the spot however far he actually travels.
    """
    p = _base(t, mood="curious", blink_at=0.7)
    p["lean"] = 0.20 + 0.03 * math.sin(t * 2 * math.pi)
    p["phase"] = t * 1.5           # hem works harder when he is moving
    p["look"] = 0.35
    p["arm_l"] = (0.10, -0.10)     # trailing
    p["arm_r"] = (0.10, -0.10)
    return p


def pose_curious(t):
    """Looking around. He has noticed something but not decided about it."""
    p = _base(t, mood="curious", blink_at=0.55)
    p["look"] = math.sin(t * 2 * math.pi)
    p["lean"] = 0.10 * math.sin(t * 2 * math.pi)
    return p


def pose_poke(t):
    """Reach out, prod the thing, think about it, withdraw.

    The pause after contact is most of what makes this read as *playful* rather
    than mechanical -- he pokes, then waits to see whether anything happens.
    """
    ext = _step(0.10, 0.42, t) - _step(0.62, 0.92, t)
    p = _base(t, mood="curious", bob=0.5, blink_at=None)
    p["face"] = mood_mix("curious", "playful", _step(0.38, 0.52, t)
                         - _step(0.80, 0.98, t))
    p["lean"] = 0.16 * ext
    p["look"] = 0.75 * ext
    p["arm_r"] = (ext, 0.15 * ext)
    p["arm_l"] = (0.0, -0.12 * ext)
    # A small recoil at the instant of contact, so something clearly happened.
    p["bob"] += -0.035 * _pulse(0.46, 0.07, t)
    return p


def pose_swat(t):
    """Coil, whip, follow through, look pleased with himself.

    The wind-up is longer than the strike by a factor of three. That ratio is
    the entire difference between a swat and an arm-wave: fast is only legible
    as fast next to something slow.
    """
    coil = _step(0.0, 0.26, t) - _step(0.30, 0.42, t)
    whip = _step(0.28, 0.38, t) - _step(0.52, 0.78, t)
    p = _base(t, mood="playful", bob=0.4, blink_at=None)
    p["face"] = mood_mix("playful", "pleased", _step(0.62, 0.88, t))
    p["lean"] = -0.14 * coil + 0.26 * whip
    p["stretch"] = 1.0 + 0.09 * coil - 0.06 * whip   # squash then stretch
    p["look"] = 0.9 * whip - 0.3 * coil
    p["arm_r"] = (1.05 * whip, 0.55 * coil + 0.20 * whip)
    p["arm_l"] = (-0.10 * coil, 0.0)
    p["phase"] = t * 2.0            # the hem snaps about with him
    return p


def pose_startled(t):
    """Recoil, hold wide-eyed, then remember himself.

    The hold is the point. A startle that resolves immediately reads as a
    twitch; holding it for two thirds of the clip is what makes it a reaction
    to something, and gives the face he is staring at time to still be there.
    """
    hit = _step(0.06, 0.16, t)
    calm_again = _step(0.72, 1.0, t)
    shock = hit - calm_again
    p = _base(t, mood="calm", bob=0.35, blink_at=None)
    p["face"] = mood_mix("calm", "shocked", shock)
    p["lean"] = -0.30 * shock
    p["stretch"] = 1.0 + 0.14 * shock
    # A tremble while he holds it, fast and small.
    p["bob"] += 0.022 * shock * math.sin(t * 22.0)
    p["arm_l"] = (0.55 * shock, 0.45 * shock)
    p["arm_r"] = (0.55 * shock, 0.45 * shock)
    p["phase"] = t * 2.2
    return p


def pose_pleased(t):
    """A little bounce. Used after a swat connects."""
    p = _base(t, mood="pleased", bob=0.0, blink_at=None)
    p["face"] = mood_mix("playful", "pleased", _step(0.0, 0.3, t))
    hop = math.sin(t * math.pi * 2.0) ** 2
    p["bob"] = 0.13 * hop
    p["stretch"] = 1.0 + 0.08 * math.sin(t * math.pi * 4.0)
    p["arm_l"] = (0.28 * hop, 0.5 * hop)
    p["arm_r"] = (0.28 * hop, 0.5 * hop)
    return p


CLIPS = {
    # Held deliberately short: he is on screen permanently, so every clip is
    # seen hundreds of times, and length is what makes a loop feel like a loop.
    "idle": dict(frames=48, pose=pose_idle),
    "drift": dict(frames=40, pose=pose_drift),
    "curious": dict(frames=56, pose=pose_curious),
    "poke": dict(frames=52, pose=pose_poke),
    "swat": dict(frames=36, pose=pose_swat),
    "startled": dict(frames=48, pose=pose_startled),
    "pleased": dict(frames=32, pose=pose_pleased),
}


def build():
    glow = ghost_material()
    dark = dark_material()
    body = build_body(glow)
    face = build_face(dark)
    arms = [build_arm("ghost_arm_l", glow), build_arm("ghost_arm_r", glow)]
    # Parented once, not per frame: re-parenting inside the render loop rebuilt
    # the transform every time and made the arms lag the body by a frame.
    for o in list(face.values()) + arms:
        o.parent = body
        o.matrix_parent_inverse = Matrix.Identity(4)
    return body, face, arms


def render_clip(name, cfg, out_dir):
    scene = setup((RES, RES), ORTHO)
    body, face, arms = build()
    frame_dir = os.path.join(out_dir, "frames", name)
    os.makedirs(frame_dir, exist_ok=True)

    n = cfg["frames"]
    for f in range(n):
        # Endpoint excluded, so a looping clip's last frame steps cleanly back
        # onto its first rather than repeating it.
        p = cfg["pose"](f / n)

        set_body(body, p["phase"])
        body.location = (0.0, 0.0, p["bob"])
        body.rotation_euler = (0.0, p["lean"], 0.0)
        s = p["stretch"]
        # Volume-preserving-ish: widening as he squashes is what keeps a stretch
        # from reading as him simply being scaled.
        body.scale = (1.0 / math.sqrt(s), 1.0 / math.sqrt(s), s)

        set_arm(arms[0], -1.0, p["swing_l"], *p["arm_l"])
        set_arm(arms[1], 1.0, p["swing_r"], *p["arm_r"])
        set_face(face, p["face"], blink=p["blink"], look=p["look"])

        scene.render.filepath = os.path.join(frame_dir, f"f{f + 1:04d}.png")
        bpy.ops.render.render(write_still=True)
        if (f + 1) % 12 == 0:
            print(f"    {f + 1}/{n}", flush=True)
    return frame_dir


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--clip", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)

    names = list(CLIPS) if args.clip == "all" else [args.clip]
    for name in names:
        print(f"[{name}] rendering", flush=True)
        render_clip(name, CLIPS[name], args.out)
        print(f"[{name}] done", flush=True)


if __name__ == "__main__":
    main()
