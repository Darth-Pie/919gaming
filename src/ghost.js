/* The ghost that lives on the wall.
 *
 * A small translucent thing that drifts around the page, takes an interest in
 * the cursor, occasionally prods a tome, and is badly startled when a face
 * comes through the wallpaper next to him.
 *
 * THREE THINGS MAKE THIS WORK, AND ALL THREE ARE EASY TO BREAK:
 *
 * 1. BLENDING. The clips have no alpha channel. He is rendered on pure black
 *    and composited with mix-blend-mode:screen, which leaves black untouched
 *    and can only ever lighten. That *is* his transparency -- the damask reads
 *    straight through his body because screen preserves the backdrop under his
 *    dim interior. It also means his eyes and mouth cost nothing: they are
 *    simply places he does not glow. Give him an alpha channel or switch this
 *    to normal blending and he becomes an opaque sticker.
 *
 * 2. PAINT ORDER. Like the apparitions, this layer sits after .wall and before
 *    .stage. Screen against the near-black page background produces almost
 *    nothing; he has to blend over the burgundy itself.
 *
 * 3. NO CROSSFADES. Clips cut, they never blend. Two screen-blended clips
 *    overlapping both add light, so a crossfade makes him flare brighter every
 *    time he changes his mind. Every clip is authored to open and close on the
 *    same neutral pose so the cut does not read.
 *
 * He can only add light, so he washes out over anything bright. That is most of
 * why he collides with the tomes rather than drifting over them, and why a poke
 * happens from beside a tome rather than on top of one.
 */

const CLIPS = {
  idle: { frames: 48, loop: true },
  drift: { frames: 40, loop: true },
  curious: { frames: 56, loop: true },
  poke: { frames: 52, loop: false },
  swat: { frames: 36, loop: false },
  startled: { frames: 48, loop: false },
  pleased: { frames: 32, loop: false },
};

/* Px on screen. Everything below that is measured against his body -- how far
 * he can reach, how close is close enough to swipe -- is written as a multiple
 * of this rather than as a number, because those are not independent settings.
 * His arm is a fixed fraction of the frame, so doubling SIZE doubles his reach
 * in page pixels, and a swat range left at its old value simply means he stops
 * two arm-lengths short and paws at nothing.
 *
 * Capped against the viewport as well, and that is not a nicety: at 264 flat he
 * is 70% of the width of a phone screen -- not a mascot on a wall any more, a
 * character standing in front of the page. The caps put a narrow screen back
 * around the size he used to be and leave anything desktop-shaped at the full
 * 264.
 *
 * Read once, deliberately. Everything downstream of SIZE is a module constant,
 * and re-deriving them on resize would mean rebuilding his physics mid-drift
 * for a case -- someone rotating a tablet -- where being briefly the wrong size
 * is not worth the machinery. */
const SIZE = Math.round(Math.min(
  264, window.innerWidth * 0.34, window.innerHeight * 0.36));
const FPS = 24;

/* How far his fingertips get from his centre, as a fraction of SIZE.
 *
 * Measured off the render rather than guessed: at full extension the arm sits
 * at 0.95 world units out and reaches another 0.41 past that, against a frame
 * 3.5 units wide. That is 1.36/1.75 of a half-frame, so 0.39 of SIZE. */
const REACH = 0.39;

/* Follow behaviour.
 *
 * The brief was "slowly", and slowly is harder than it sounds: a lerp toward
 * the cursor with a small coefficient still sets off the instant the cursor
 * does, and reads as a sluggish cursor-follower rather than as something
 * deciding. What makes it read as curiosity is the DWELL -- he ignores the
 * pointer entirely while it is moving, and only commits once it has been still
 * for a beat. Chasing a moving cursor is what a cursor-follower does; waiting
 * for it to settle and then coming to look is what an animal does.
 */
const DWELL_MS = 900;      // how long the pointer must rest before he notices
const SPEED = 40;          // px/sec at full tilt. Deliberately a crawl.
const ACCEL = 0.9;         // how fast he reaches that speed; low is floaty
const DRAG = 0.4;          // and how fast he sheds it again
const ARRIVE = SIZE * 0.35;       // close enough to count a wander target reached
const SWAT_RANGE = REACH * SIZE * 0.66;  // close enough to take a swipe at it

/* Chasing has to close tighter than arriving does, or he never gets near enough
 * to swipe. With one shared arrive radius he stopped accelerating at 46px,
 * coasted to rest around 33px, and sat there just outside a 34px swat range
 * until boredom took him -- he approached perfectly and then never did anything.
 */
const CHASE_ARRIVE = SWAT_RANGE * 0.6;

/* He loses interest and wanders instead. Without this he parks under a resting
 * cursor forever, which is the one thing a curious animal never does.
 *
 * Sized against how far he can actually travel, not picked for feel: at this
 * crawl he covers roughly 400px in this long, and anything shorter meant a
 * cursor more than a few hundred pixels away could never be reached at all --
 * he would set off, lose interest halfway, and wander off every single time. */
const BORED_MS = 15000;
const WANDER_MS = [4000, 9000];

const POKE_CHANCE = 0.45;  // when a wander happens to land him beside a tome
/* Slightly beyond his actual reach, which is deliberate and was tuned by eye:
 * a poke that only ever fires at exact arm's length reads as him measuring the
 * distance first. Leaning into it is what makes it look like a poke. */
const POKE_RANGE = REACH * SIZE * 1.36;

/* How often a wander is not a wander at all but an errand: go over to a book
 * and prod it.
 *
 * Waiting for chance to put him beside a tome does not work, and the numbers
 * say why -- only 4% of the page he can reach is within poke range of a spine,
 * two bands about 60px wide either side of the shelf. At one target every four
 * to nine seconds and a 45% roll on arrival, that is a poke every five to ten
 * minutes: real, but nobody would ever see it. Choosing the destination on
 * purpose is the difference between an accident and an errand, and an errand is
 * also just better in character -- he has been eyeing that book.
 */
const ERRAND_CHANCE = 0.15;
/* He stops shorter when the spot itself is the point, rather than being one
 * random spot among many. ARRIVE is 92px, which is fine for "somewhere over
 * there" and useless for anything aimed: it let him call a book reached while
 * still 175px from it, well past his own arm, and let him call the gap at the
 * end of the shelf reached while still 27px short of actually being in it. */
const AIMED_ARRIVE = SIZE * 0.14;

/* Startle. The apparitions register themselves so he can be surprised by one;
 * see wallApparitions.js. */
const STARTLE_RANGE = 260;
const STARTLE_COOLDOWN = 12000;

/* How long he will keep at an obstacle WITHOUT MAKING PROGRESS before giving up
 * on whatever is behind it.
 *
 * Measured against progress rather than against contact. As a plain contact
 * timer this was wrong in the common case: sliding the length of the shelf is
 * ten-plus seconds of continuous contact, so he abandoned the target every 2.5s
 * mid-slide, re-targeted, and inched along in fits. Contact is not the problem;
 * contact that is getting him nowhere is. */
const BLOCKED_MS = 2500;
const PROGRESS_EPS = 6;    // px of closing distance that counts as progress

/* Scrambling round an obstacle is the one time he is allowed to hurry.
 *
 * Two things made this glacial, and the speed cap was only one of them: hitting
 * a surface zeroes his velocity along that axis, so he restarts from a
 * standstill every time, and at the ambient ACCEL that is over a second just to
 * get going again. The acceleration boost matters more than the speed boost.
 *
 * Eased in and out over a few hundred milliseconds rather than switched, so
 * clearing the obstacle does not snap him back to a crawl mid-glide. */
const BLOCKED_SPEED = 2.9;
const BLOCKED_ACCEL = 3.0;
const BOOST_RATE = 4.0;

/* How long a surface goes on counting as underfoot after he stops touching it.
 * Long enough to bridge the one-frame gaps of resting exactly on an edge, short
 * enough that a surface he has genuinely left stops steering him. */
const SLIP_HOLD = 400;

/* What he cannot pass through: objects, not type.
 *
 * The tomes and the shelf board themselves, not the box around them. It used to
 * be `.shelf-wrap`, which is the whole shelf component -- 992px wide and 362
 * tall, most of it empty wall above and beside the books. That single rectangle
 * was three quarters of the reachable page, and it is what made the poke
 * unreachable: the spines sit in the middle of it, so the closest he could ever
 * get to one was 236px against a 70px poke range. The poke never once fired on
 * the live page. Colliding with the things he can see instead lets him come
 * alongside a book, which is the whole premise of that animation.
 *
 * The masthead and the nav link came out for a different reason: they are text,
 * and he is already painted *behind* them -- this layer sits before .stage, so
 * the title draws over him and screen blending cannot darken it. He passes
 * behind the lettering rather than over it, which needs no permission from a
 * collider. Blocking them only walled off the top of the page, and with it the
 * one clear left-to-right run he has; the shelf spans nearly the full width, so
 * without the top he had no way across that was not a detour round the bottom.
 *
 * Each entry is a GROUP, merged into the one box that encloses it, and that
 * matters more than it looks. Five separate spines seemed the tidier reading of
 * "collide with the tomes" -- it even gives you the stepped top edge where a
 * shorter book sits. What it actually gives you is five boxes whose keep-out
 * zones are 223px wide on a 66px book, so he is inside three or four of them at
 * once; resolve settles them in DOM order, last one wins, and the escape push
 * is computed from whichever spine happened to be last. He spent five solid
 * minutes being shoved left by one book and right by its neighbour, sliding
 * along the top of the shelf in a 47px-tall band and never once getting down.
 * One box per solid object, and the push has one answer.
 */
const COLLIDE = [
  ['.shelf-wrap .spine'],      // the tomes, as a block
  ['.plank', '.plank-lip'],    // the shelf board
];
const PAD = 10;

function union(sels) {
  let box = null;
  for (const sel of sels) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      box = box ? {
        left: Math.min(box.left, r.left),
        top: Math.min(box.top, r.top),
        right: Math.max(box.right, r.right),
        bottom: Math.max(box.bottom, r.bottom),
      } : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
  }
  if (box) {
    box.width = box.right - box.left;
    box.height = box.bottom - box.top;
  }
  return box;
}

/* Apparitions collide too, but only their middles.
 *
 * A face is framed with a lot of room around it -- the membrane needs somewhere
 * to fall away to, so the head is well under half the width of its element.
 * Colliding with the element box would stop him a face's width short of a face,
 * which reads as him bouncing off nothing at all. */
const APPARITION_BOX = 0.46;

function shrink(r, k) {
  const dw = (r.width * (1 - k)) / 2;
  const dh = (r.height * (1 - k)) / 2;
  return {
    left: r.left + dw,
    right: r.right - dw,
    top: r.top + dh,
    bottom: r.bottom - dh,
  };
}

const rand = ([lo, hi]) => lo + Math.random() * (hi - lo);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* Where the ghost may not go. Measured fresh every time: the shelf is
 * React-rendered and does not exist when this module first runs, and its box
 * moves on resize and reflow. */
function obstacles(apparitions) {
  const out = [];
  for (const group of COLLIDE) {
    const box = union(group);
    if (box) out.push(box);
  }
  // Optional, because these come and go: a wander target should be chosen
  // against the page as it will still be in twenty seconds' time, not against
  // a hand that will have sunk back into the wallpaper long before he arrives.
  if (apparitions) {
    for (const r of apparitions()) {
      if (r.width > 0 && r.height > 0) out.push(shrink(r, APPARITION_BOX));
    }
  }
  return out;
}

/* The book spines on the shelf, which are the things worth prodding.
 *
 * `.spine` and not `.tome` or a link/button guess -- the shelf is React-rendered
 * and the guess matched nothing at all, so the poke could never fire and looked
 * for all the world like the trigger logic was broken. Worth re-checking here if
 * the shelf markup is ever reworked.
 */
function tomes() {
  return [...document.querySelectorAll('.shelf-wrap .spine')]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0);
}

/* A place to stand where a book is within reach.
 *
 * Every spine, both sides, then throw away the ones he could not occupy. That
 * discards the inner positions on its own and without a special case: the books
 * are 14px apart and he needs 157px of clearance, so the only spots that
 * survive are outside the leftmost and rightmost spines. If a book is ever
 * pulled from the middle of the shelf, the gap it leaves becomes a legal spot
 * with no code change, which is the reason for doing it this way round.
 */
function errandSpot() {
  const r = (SIZE / 2) * 0.52;
  const keep = PAD + r;
  const rects = obstacles();
  const spots = [];
  for (const s of tomes()) {
    for (const side of [-1, 1]) {
      // The extra 4px is so he is not resting exactly on the contact surface,
      // where a rounding wobble would read as him twitching against the book.
      const x = side < 0 ? s.left - keep - 4 : s.right + keep + 4;
      const y = (s.top + s.bottom) / 2;
      if (x < (SIZE / 2) * 0.4 || x > window.innerWidth - (SIZE / 2) * 0.4) continue;
      const blocked = rects.some((b) => x > b.left - keep && x < b.right + keep
        && y > b.top - keep && y < b.bottom + keep);
      if (!blocked) spots.push({ x, y });
    }
  }
  return spots.length ? spots[Math.floor(Math.random() * spots.length)] : null;
}

/* Push a circle out of any rect it has entered, along the shallowest axis that
 * leaves him on screen.
 *
 * Shallowest rather than "away from centre" on purpose: pushed away from the
 * centre, a ghost that drifts into the long flat top of the bookshelf gets
 * shoved sideways along it for hundreds of pixels before it clears. Along the
 * shallowest axis he steps up over the edge he actually crossed, which is both
 * shorter and what a thing bumping into a shelf looks like.
 *
 * "That leaves him on screen" is the part the size change forced. The masthead
 * and the shelf both run to within about 55px of the window edge, and at 264 he
 * needs 79px of clearance -- so the shallowest way out of the masthead is
 * sideways, into a gap he no longer fits through, and the push put him at
 * x=-25: entirely outside the window, still dutifully being animated. Trying
 * every side and preferring one that lands in view costs three comparisons and
 * removes a whole class of that.
 */
function resolve(x, y, r, rects, bounds) {
  // Which box stopped him, per axis, rather than one box and two flags. Those
  // came apart the moment he touched two things at once: the flags accumulated
  // across every box while the box itself was simply overwritten, so a ghost
  // wedged where the tomes meet the shelf could have his sideways escape
  // measured against the ends of the shelf board he was standing on.
  let hitX = null;
  let hitY = null;
  for (const box of rects) {
    const l = box.left - PAD - r;
    const t = box.top - PAD - r;
    const rt = box.right + PAD + r;
    const b = box.bottom + PAD + r;
    if (x <= l || x >= rt || y <= t || y >= b) continue;
    const outs = [
      { d: x - l, x: l, y, hx: true, hy: false },
      { d: rt - x, x: rt, y, hx: true, hy: false },
      { d: y - t, x, y: t, hx: false, hy: true },
      { d: b - y, x, y: b, hx: false, hy: true },
    ].sort((a, c) => a.d - c.d);
    // Falls back to the shallowest if nothing fits, which happens in pockets
    // too small to hold him at all -- the corridor between the masthead and the
    // shelf is 60px on a 900px-tall window. The clamp downstream keeps him in
    // view and the blocked timer gets him out of it.
    const pick = outs.find((o) => o.x >= bounds.minX && o.x <= bounds.maxX
      && o.y >= bounds.minY && o.y <= bounds.maxY) || outs[0];
    x = pick.x;
    y = pick.y;
    if (pick.hx) hitX = box;
    else hitY = box;
  }
  return [x, y, hitX, hitY];
}

export function startGhost(apparitions) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (navigator.connection && navigator.connection.saveData) return;

  const layer = document.getElementById('mascot');
  if (!layer) return;
  // Idempotent: a second call must replace the first ghost, not add another.
  // Otherwise two animation loops drive two sets of clips over each other,
  // which under screen blending means two overlapping ghosts adding light.
  layer.replaceChildren();
  // The stylesheet carries 264px as the default so it still reads as a real
  // rule; this is what narrows him on a phone. It has to agree with SIZE --
  // his reach and swat ranges are derived from that number, so a mismatch is
  // not a cosmetic one, it is him lunging at things outside himself.
  layer.style.setProperty('--mascot-size', `${SIZE}px`);

  // One element per clip, all preloaded, only one visible at a time. Swapping a
  // single element's src re-buffers on every state change, which on a slow
  // connection means he freezes at the exact moments he is meant to be
  // reacting. Seven small clips cost less than one stall.
  const vids = {};
  for (const name of Object.keys(CLIPS)) {
    const v = document.createElement('video');
    v.className = 'mascot-clip';
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    v.loop = CLIPS[name].loop;
    for (const [ext, type] of [['webm', 'video/webm'], ['mp4', 'video/mp4']]) {
      const s = document.createElement('source');
      s.src = `/assets/ghost/${name}.${ext}`;
      s.type = type;
      v.appendChild(s);
    }
    v.style.opacity = '0';
    layer.appendChild(v);
    vids[name] = v;
  }

  const state = {
    x: window.innerWidth * 0.22,
    y: window.innerHeight * 0.62,
    vx: 0,
    vy: 0,
    facing: 1,
    clip: null,
    busyUntil: 0,          // a one-shot is playing and must not be interrupted
    target: null,
    errand: false,        // this target is a book he means to prod
    detoured: false,      // this target is a way round, not a place to be
    slipX: 0,             // committed slide direction while in contact, per axis
    slipY: 0,
    faceX: null,          // the surface blocking him, held briefly past contact
    faceY: null,
    faceXAt: -Infinity,
    faceYAt: -Infinity,
    mode: 'wander',
    restingSince: 0,
    lastMove: 0,
    nextWander: 0,
    blockedSince: 0,
    bestDist: Infinity,
    boost: 0,
    lastStartle: -Infinity,
    pointer: null,
  };

  function play(name, holdMs) {
    if (state.clip === name) return;
    const prev = state.clip && vids[state.clip];
    if (prev) prev.style.opacity = '0';
    const v = vids[name];
    v.currentTime = 0;
    v.style.opacity = '1';
    const p = v.play();
    if (p) p.catch(() => {});
    state.clip = name;
    if (holdMs) state.busyUntil = performance.now() + holdMs;
  }

  const clipMs = (name) => (CLIPS[name].frames / FPS) * 1000;

  window.addEventListener('pointermove', (e) => {
    state.pointer = { x: e.clientX, y: e.clientY };
    state.lastMove = performance.now();
  }, { passive: true });
  window.addEventListener('pointerleave', () => { state.pointer = null; });

  /* Somewhere he could actually get to.
   *
   * This was a uniform random point, which was survivable while he was small
   * and is not now. He needs 79px of clearance at full size, and on a 1100px
   * window that leaves him about a quarter of the page -- a band under the
   * shelf and not much else. Picking blind, four targets in five sat behind the
   * shelf, so his whole day was: choose the unreachable, press into the
   * underside of a shelf for 2.5 seconds, give up, choose the unreachable
   * again. Fifty seconds of watching him produced ninety pixels of travel.
   *
   * Rejection sampling rather than anything cleverer, because the free area is
   * a handful of rectangles' complement and 24 darts find a point in it
   * essentially always. When they genuinely do not -- a window too small to
   * hold him anywhere -- the last dart is used regardless, which is the old
   * behaviour, and the blocked timer keeps him from sulking at a wall forever.
   */
  /* Round the near end of this box and out the other side of it.
   *
   * Both halves are load-bearing. Aiming at the end alone -- same height, just
   * past the edge -- is not enough, because arriving there still leaves him on
   * the side he started: he clears the shelf, is told he has arrived, picks a
   * fresh random destination and is immediately blocked again by the same
   * shelf. The waypoint has to be somewhere he could not have reached without
   * going round, which means past the corner in *both* axes. */
  function detourPast(box, rad) {
    const half = SIZE / 2;
    const gap = PAD + rad + 8;
    const ends = [box.left - gap, box.right + gap]
      .filter((x) => x >= half * 0.4 && x <= window.innerWidth - half * 0.4)
      .sort((a, b) => Math.abs(a - state.x) - Math.abs(b - state.x));
    if (!ends.length) return null;
    let y = state.y;
    if (state.target) {
      if (state.target.y > box.bottom && state.y < box.top) y = box.bottom + gap;
      else if (state.target.y < box.top && state.y > box.bottom) y = box.top - gap;
    }
    return {
      x: ends[0],
      y: clamp(y, half * 0.4, window.innerHeight - half * 0.4),
    };
  }

  function pickWander(now) {
    state.errand = false;
    state.detoured = false;
    // A new destination is a new reason to be against this wall, so the slide
    // he committed to for the old one should not outlive it.
    state.slipX = 0;
    state.slipY = 0;
    if (Math.random() < ERRAND_CHANCE) {
      const spot = errandSpot();
      if (spot) {
        state.errand = true;
        state.target = spot;
        state.nextWander = now + rand(WANDER_MS);
        return;
      }
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    const rects = obstacles();
    const r = (SIZE / 2) * 0.52;
    let p;
    for (let i = 0; i < 24; i++) {
      // The band used to start at 0.30, which was the right number while the
      // masthead was a wall: there was nothing above it he could occupy. Now
      // that he passes behind the title, leaving it at 0.30 would have meant
      // opening the top of the page as a corridor he never has any reason to
      // enter -- he would only ever cross it by accident, on the way somewhere
      // else.
      p = { x: rand([w * 0.08, w * 0.92]), y: rand([h * 0.12, h * 0.88]) };
      const inside = rects.some((box) => p.x > box.left - PAD - r
        && p.x < box.right + PAD + r
        && p.y > box.top - PAD - r
        && p.y < box.bottom + PAD + r);
      if (!inside) break;
    }
    state.target = p;
    state.nextWander = now + rand(WANDER_MS);
  }

  function nearestApparition() {
    if (!apparitions) return null;
    let best = null;
    let bestD = Infinity;
    for (const r of apparitions()) {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = Math.hypot(cx - state.x, cy - state.y);
      if (d < bestD) { bestD = d; best = { d, cx, cy }; }
    }
    return best && best.d < STARTLE_RANGE ? best : null;
  }

  let last = performance.now();
  pickWander(last);
  play('idle');

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const rects = obstacles(apparitions);
    const busy = now < state.busyUntil;

    if (!busy) {
      // Startle takes priority over everything he might have been doing.
      const spook = now - state.lastStartle > STARTLE_COOLDOWN
        ? nearestApparition() : null;
      if (spook) {
        state.lastStartle = now;
        state.mode = 'startled';
        state.target = null;
        // He recoils away from it rather than toward it.
        state.vx -= Math.sign(spook.cx - state.x) * 40;
        play('startled', clipMs('startled'));
      } else {
        const resting = state.pointer && now - state.lastMove > DWELL_MS;
        if (resting && state.mode !== 'chase') {
          state.mode = 'chase';
          state.restingSince = now;
        } else if (!resting && state.mode === 'chase' && !state.pointer) {
          state.mode = 'wander';
          pickWander(now);
        }

        if (state.mode === 'chase' && state.pointer) {
          const d = Math.hypot(state.pointer.x - state.x, state.pointer.y - state.y);
          if (d < SWAT_RANGE) {
            // Caught it. Swipe, look smug, then lose interest.
            play('swat', clipMs('swat'));
            state.mode = 'wander';
            state.target = null;
            setTimeout(() => {
              if (performance.now() >= state.busyUntil) play('pleased', clipMs('pleased'));
            }, clipMs('swat'));
            pickWander(now + clipMs('swat'));
          } else {
            state.target = { x: state.pointer.x, y: state.pointer.y + SIZE * 0.1 };
            if (now - state.restingSince > BORED_MS) {
              state.mode = 'wander';
              pickWander(now);
            }
          }
        } else {
          if (!state.target || now > state.nextWander) pickWander(now);
        }
      }
    }

    // Eased toward 1 while he is in contact with something, back to 0 once he
    // is clear. Driven by last frame's contact, since collision is resolved
    // after integration below.
    const want = state.blockedSince ? 1 : 0;
    state.boost += (want - state.boost) * BOOST_RATE * dt;
    const speed = SPEED * (1 + (BLOCKED_SPEED - 1) * state.boost);
    const accel = ACCEL * (1 + (BLOCKED_ACCEL - 1) * state.boost);

    // Steering. A spring toward the target with heavy damping: he never snaps
    // to it, he leans and coasts.
    if (state.target && !busy) {
      const dx = state.target.x - state.x;
      const dy = state.target.y - state.y;
      const d = Math.hypot(dx, dy) || 1;
      const arrive = state.mode === 'chase' ? CHASE_ARRIVE
        : (state.errand || state.detoured) ? AIMED_ARRIVE : ARRIVE;
      if (d > arrive) {
        state.vx += (dx / d * speed - state.vx) * accel * dt;
        state.vy += (dy / d * speed - state.vy) * accel * dt;
      } else if (state.mode === 'wander') {
        state.target = null;
        maybePoke(now);
      }
    }
    // Drag, always. This is what stops him orbiting a target he overshoots.
    // It also caps his real speed well under SPEED -- steering and drag balance
    // at SPEED * ACCEL / (ACCEL + DRAG) -- which is worth knowing before
    // wondering why he never travels as fast as SPEED says.
    state.vx -= state.vx * DRAG * dt;
    state.vy -= state.vy * DRAG * dt;

    state.x += state.vx * dt;
    state.y += state.vy * dt;

    const half = SIZE / 2;
    const bounds = {
      minX: half * 0.4,
      maxX: window.innerWidth - half * 0.4,
      minY: half * 0.4,
      maxY: window.innerHeight - half * 0.4,
    };
    state.x = clamp(state.x, bounds.minX, bounds.maxX);
    state.y = clamp(state.y, bounds.minY, bounds.maxY);
    let hitX;
    let hitY;
    const rad = half * 0.52;
    [state.x, state.y, hitX, hitY] =
      resolve(state.x, state.y, rad, rects, bounds);
    // Again, after resolving. Clamping only before is what let a collision push
    // him off screen: the push is the last thing to touch his position, so it
    // is the one that has to be bounded.
    state.x = clamp(state.x, bounds.minX, bounds.maxX);
    state.y = clamp(state.y, bounds.minY, bounds.maxY);

    /* The window edge is a surface too, and it was the only one that did not
     * say so. The clamp above pins his position and then says nothing, so his
     * velocity into the glass was never cancelled and the patience timer below
     * never started: pressed into the side of the window he would stay there,
     * still accelerating, with nothing in the code aware that anything was
     * wrong. Only the outward component goes -- he is still free to travel
     * along an edge, which he does constantly. */
    const edgeX = (state.x <= bounds.minX && state.vx < 0)
      || (state.x >= bounds.maxX && state.vx > 0);
    const edgeY = (state.y <= bounds.minY && state.vy < 0)
      || (state.y >= bounds.maxY && state.vy > 0);
    if (edgeX) state.vx = 0;
    if (edgeY) state.vy = 0;

    /* GETTING ROUND IT, RATHER THAN MERELY NOT GOING THROUGH IT.
     *
     * Sliding only works when the steering already has a component along the
     * surface. Aim him at something directly behind the shelf and it has none:
     * every frame steers straight into the face, the normal component is
     * zeroed, and he sits at a dead stop. Speed cannot fix that -- zero times
     * anything is zero. So in contact he is also pushed *along* the surface,
     * which turns a dead stop into a scoot round the corner with nothing
     * resembling a pathfinder.
     *
     * Getting that push to survive is four separate things, and missing any one
     * of them put him back to vibrating in place:
     *
     * ORDER. Kill the component into each surface first, then push along it.
     * The other way round -- which is how it was -- made escape from a corner
     * unreachable by construction: touching in x and y at once, the x-surface's
     * push went into vy and the y-surface's zeroing wiped it on the same frame,
     * and vice versa. Both escapes cancelled each other on exactly the frames
     * he needed them.
     *
     * MEMORY. Contact is held briefly past its end. Resting exactly ON a
     * surface he is inside it one frame and outside it the next, and every
     * flicker reset the decision below.
     *
     * COMMITMENT. The direction is chosen once and then held. Recomputed each
     * frame it hunts: he slides until level with the target, at which point the
     * "toward the target" term falls below noise, the fallback sends him back
     * the way he came, which restores a target direction pointing the other
     * way, forever. A held choice is a slide, and surfaces have ends, so a
     * slide terminates.
     *
     * OUT BEATS TOWARD. In a corner, "toward the target" is not merely
     * unhelpful but precisely wrong -- with the target diagonally behind the
     * corner, both slides point into it. Whichever side of a box he is on, away
     * from it is the way out of it.
     *
     * Measured with the cursor parked on the books and him in the notch where
     * they meet the shelf board: he used to sit at a single pixel indefinitely,
     * oscillating four tenths of a pixel. He now never holds still for so much
     * as half a second.
     */
    const awayY = (box) => (state.y < (box.top + box.bottom) / 2 ? -1 : 1);
    const awayX = (box) => (state.x < (box.left + box.right) / 2 ? -1 : 1);

    /* Only the component INTO the surface goes.
     *
     * Zeroing the whole axis is what a wall does to a thing that has hit it,
     * and it is wrong for a thing that is resting against one: touching the
     * underside of the shelf board, every frame cancelled his vertical velocity
     * in both directions, so the one move that would free him -- going down,
     * away from it -- was the move he could never make. He slid the full length
     * of the shelf with his back to it and no way off. */
    if (hitX && state.vx * awayX(hitX) < 0) state.vx = 0;
    if (hitY && state.vy * awayY(hitY) < 0) state.vy = 0;

    const esc = SPEED * BLOCKED_SPEED;
    if (hitX) { state.faceX = hitX; state.faceXAt = now; }
    else if (now - state.faceXAt > SLIP_HOLD) { state.faceX = null; state.slipY = 0; }
    if (hitY) { state.faceY = hitY; state.faceYAt = now; }
    else if (now - state.faceYAt > SLIP_HOLD) { state.faceY = null; state.slipX = 0; }

    const along = (delta, nearer) => (Math.abs(delta) > PROGRESS_EPS
      ? Math.sign(delta) : nearer);

    if (state.faceX) {
      // Re-decided rather than latched when cornered, because he can arrive at
      // a corner along a face he was already committed to sliding down.
      if (state.faceY) state.slipY = awayY(state.faceY);
      else if (!state.slipY) {
        const up = state.y - (state.faceX.top - PAD - rad);
        const down = (state.faceX.bottom + PAD + rad) - state.y;
        state.slipY = along(state.target ? state.target.y - state.y : 0,
          up < down ? -1 : 1);
      }
      // Nor into the window, which is a surface he cannot slide off the end of.
      if (state.slipY < 0 && state.y <= bounds.minY + 1) state.slipY = 1;
      if (state.slipY > 0 && state.y >= bounds.maxY - 1) state.slipY = -1;
      // Remembered contact decides the DIRECTION; only real contact pushes.
      // Shoving him for a further 400ms after he is genuinely clear fights the
      // steering that is trying to take him somewhere, and he ends up
      // circulating in whatever pocket he escaped into.
      if (hitX) state.vy += (state.slipY * esc - state.vy) * BLOCKED_ACCEL * dt;
    }
    if (state.faceY) {
      if (state.faceX) state.slipX = awayX(state.faceX);
      else if (!state.slipX) {
        const left = state.x - (state.faceY.left - PAD - rad);
        const right = (state.faceY.right + PAD + rad) - state.x;
        state.slipX = along(state.target ? state.target.x - state.x : 0,
          left < right ? -1 : 1);
      }
      if (state.slipX < 0 && state.x <= bounds.minX + 1) state.slipX = 1;
      if (state.slipX > 0 && state.x >= bounds.maxX - 1) state.slipX = -1;
      if (hitY) state.vx += (state.slipX * esc - state.vx) * BLOCKED_ACCEL * dt;
    }

    /* Blocked. He has no pathfinding, and the shelf is a 990px-wide box across
     * the middle of the page, so a target on the far side of it is a target he
     * can press into forever -- which is exactly what he did: velocity climbing,
     * position frozen against the edge, indefinitely.
     *
     * Killing the velocity into the surface lets him slide along it, which
     * covers the common case of a target off to one side. When it does not --
     * a target directly behind the shelf leaves no tangential component to
     * slide on -- he gives up and finds something else to do. That is cheaper
     * than pathfinding and better in character: a curious thing that cannot
     * reach what it wanted loses interest in it.
     */
    if (hitX || hitY || edgeX || edgeY) {
      if (!state.blockedSince) {
        state.blockedSince = now;
        state.bestDist = Infinity;
      }
      // Patience resets whenever he actually gets closer. Sliding the length of
      // the shelf is one long unbroken contact, so timing the contact itself
      // made him quit mid-slide every 2.5s; what matters is whether the contact
      // is getting him anywhere.
      const d = state.target
        ? Math.hypot(state.target.x - state.x, state.target.y - state.y)
        : 0;
      if (d < state.bestDist - PROGRESS_EPS) {
        state.bestDist = d;
        state.blockedSince = now;
      } else if (now - state.blockedSince > BLOCKED_MS) {
        /* Give up -- but go round it once before giving up on it.
         *
         * The shelf board is 992px of a 1440px page and his keep-out turns it
         * into a bar 1149 wide and 195 tall, so the top of the page and the
         * bottom are joined only by two channels about 80px wide at the far
         * edges. Nothing greedy finds an 80px gate 600px away; he simply lived
         * on whichever side he woke up on. Before today that was the strip
         * under the shelf, and opening the top only moved which half he was
         * stuck in.
         *
         * So when he has run out of patience, he gets one waypoint: the near
         * end of the thing in his way. That is not a pathfinder and does not
         * want to become one -- it is the single fact he was missing, which is
         * that shelves have ends.
         */
        state.blockedSince = 0;
        state.mode = 'wander';
        const blocker = hitX || hitY;
        const via = (state.detoured || !blocker) ? null : detourPast(blocker, rad);
        if (via) {
          state.detoured = true;
          state.errand = false;
          state.target = via;
          // Held longer than an ordinary wander, or the timer replaces the
          // detour before he has cleared the obstacle it exists to clear.
          state.nextWander = now + BLOCKED_MS * 6;
        } else {
          pickWander(now);
        }
      }
    } else {
      state.blockedSince = 0;
    }

    const moving = Math.hypot(state.vx, state.vy) > 8;
    // Re-read busyUntil rather than reusing `busy` from the top of the frame.
    // The swat, poke and startle branches above set it *during* this frame, so
    // the stale value said "not busy" and this block overwrote the one-shot
    // with `drift` on the very frame it started. Every one-shot was being
    // triggered correctly and then discarded a millisecond later, which looked
    // exactly like the trigger never firing.
    if (now >= state.busyUntil) {
      if (moving) play('drift');
      else if (state.mode === 'chase') play('curious');
      else play('idle');
    }
    if (Math.abs(state.vx) > 5) state.facing = state.vx < 0 ? -1 : 1;

    const v = vids[state.clip];
    if (v) {
      v.style.transform =
        `translate3d(${(state.x - half).toFixed(1)}px, ${(state.y - half).toFixed(1)}px, 0)` +
        (state.facing < 0 ? ' scaleX(-1)' : '');
    }
    requestAnimationFrame(frame);
  }

  function maybePoke(now) {
    // No dice roll when he came here on purpose. The roll exists to keep him
    // from prodding every book he happens to drift past; it has no business
    // talking him out of the trip he just made.
    const deliberate = state.errand;
    state.errand = false;
    if (!deliberate && Math.random() > POKE_CHANCE) return;
    let best = null;
    let bestD = Infinity;
    for (const r of tomes()) {
      const cy = r.top + r.height / 2;
      // Beside it, not over it -- see the header. He prods the near edge.
      const ex = state.x < r.left ? r.left : r.right;
      const d = Math.hypot(ex - state.x, cy - state.y);
      if (d < bestD) { bestD = d; best = { d, ex, cy }; }
    }
    if (!best || best.d > POKE_RANGE) return;
    state.facing = best.ex > state.x ? 1 : -1;
    play('poke', clipMs('poke'));
    state.nextWander = now + clipMs('poke');
  }

  requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    for (const name of Object.keys(vids)) {
      if (document.hidden) vids[name].pause();
      else if (name === state.clip) { const p = vids[name].play(); if (p) p.catch(() => {}); }
    }
  });
}
