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

const SIZE = 132;          // px on screen; he is a detail, not a character
const FPS = 24;

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
const ARRIVE = 46;         // px: close enough to count a wander target reached
const SWAT_RANGE = 34;     // px: close enough to take a swipe at it

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

const POKE_CHANCE = 0.45;  // when a wander lands him beside a tome
const POKE_RANGE = 70;

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

const COLLIDE = ['.shelf-wrap', '.masthead', '.top-nav'];
const PAD = 10;

const rand = ([lo, hi]) => lo + Math.random() * (hi - lo);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* Where the ghost may not go. Measured fresh every time: the shelf is
 * React-rendered and does not exist when this module first runs, and its box
 * moves on resize and reflow. */
function obstacles() {
  const out = [];
  for (const sel of COLLIDE) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push(r);
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

/* Push a circle out of any rect it has entered, along the shallowest axis.
 *
 * Shallowest rather than "away from centre" on purpose: pushed away from the
 * centre, a ghost that drifts into the long flat top of the bookshelf gets
 * shoved sideways along it for hundreds of pixels before it clears. Along the
 * shallowest axis he steps up over the edge he actually crossed, which is both
 * shorter and what a thing bumping into a shelf looks like.
 */
function resolve(x, y, r, rects) {
  let hitX = false;
  let hitY = false;
  let hitBox = null;
  for (const box of rects) {
    const l = box.left - PAD - r;
    const t = box.top - PAD - r;
    const rt = box.right + PAD + r;
    const b = box.bottom + PAD + r;
    if (x <= l || x >= rt || y <= t || y >= b) continue;
    const dl = x - l;
    const dr = rt - x;
    const dt = y - t;
    const db = b - y;
    const m = Math.min(dl, dr, dt, db);
    if (m === dl) { x = l; hitX = true; }
    else if (m === dr) { x = rt; hitX = true; }
    else if (m === dt) { y = t; hitY = true; }
    else { y = b; hitY = true; }
    hitBox = box;
  }
  return [x, y, hitX, hitY, hitBox];
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

  function pickWander(now) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    state.target = {
      x: rand([w * 0.08, w * 0.92]),
      y: rand([h * 0.30, h * 0.88]),
    };
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

    const rects = obstacles();
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
      const arrive = state.mode === 'chase' ? CHASE_ARRIVE : ARRIVE;
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
    state.x = clamp(state.x, half * 0.4, window.innerWidth - half * 0.4);
    state.y = clamp(state.y, half * 0.4, window.innerHeight - half * 0.4);
    let hitX;
    let hitY;
    let hitBox;
    const rad = half * 0.52;
    [state.x, state.y, hitX, hitY, hitBox] = resolve(state.x, state.y, rad, rects);

    /* Getting round it, rather than merely not going through it.
     *
     * Sliding only works when the steering already has a component along the
     * surface. Aim him at something directly behind the shelf and it has none:
     * every frame steers straight into the face, the normal component is zeroed,
     * and he sits at a dead stop against the edge. Speed cannot fix that -- zero
     * times anything is zero -- which is why boosting alone left him pinned.
     *
     * So when he is in contact, he is also pushed *along* the surface, toward
     * whichever end of that obstacle is the shorter way round. That is enough to
     * turn a dead stop into a scoot along the edge and round the corner, without
     * anything resembling a pathfinder.
     */
    if (hitBox) {
      const esc = SPEED * BLOCKED_SPEED;
      if (hitX) {
        const up = state.y - (hitBox.top - PAD - rad);
        const down = (hitBox.bottom + PAD + rad) - state.y;
        const dir = up < down ? -1 : 1;
        state.vy += (dir * esc - state.vy) * BLOCKED_ACCEL * dt;
      }
      if (hitY) {
        const left = state.x - (hitBox.left - PAD - rad);
        const right = (hitBox.right + PAD + rad) - state.x;
        const dir = left < right ? -1 : 1;
        state.vx += (dir * esc - state.vx) * BLOCKED_ACCEL * dt;
      }
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
    if (hitX) state.vx = 0;
    if (hitY) state.vy = 0;
    if (hitX || hitY) {
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
        state.blockedSince = 0;
        state.mode = 'wander';
        pickWander(now);
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
    if (Math.random() > POKE_CHANCE) return;
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
