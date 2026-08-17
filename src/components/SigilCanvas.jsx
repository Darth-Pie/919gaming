import { useEffect, useRef } from 'react';

/* ---------------------------------------------------------------------------
   The mustr tome's "enter" moment. Scattered sparks (members) drift in, travel
   to the vertices of the mustr M + its carved arrow, thread themselves into a
   skeleton, and the real logo blooms in over it. Replaces the wax seal the
   other project tomes use.

   Progressive enhancement: the container only hides the mark/caption/CTA once
   the effect adds `.sigil-armed`. With JS off, the logo + caption + CTA are just
   shown statically — no blank tome.

   Geometry is in a 300x240 SVG coordinate box, eyeballed from the favicon; the
   bloom covers any drift. Tunable via `config` (Sigil Studio exports these). --- */

const NS = 'http://www.w3.org/2000/svg';
// vertices of the M (0..4) and the carved up-arrow (5=apex, 6/7=barbs)
const BASE = [
  { x: 87, y: 205, r: 4 }, { x: 87, y: 41, r: 5 }, { x: 141, y: 176, r: 5.5 },
  { x: 204, y: 41, r: 5 }, { x: 211, y: 205, r: 4 },
  { x: 186, y: 66, r: 4.5 }, { x: 168, y: 116, r: 3 }, { x: 209, y: 116, r: 3 },
];
const CORE_LINKS = [[0, 1], [1, 2], [2, 3], [3, 4]]; // the M strokes
const ARROW_LINKS = [[6, 5], [5, 7]];                // the carved chevron
const GLINT_PTS = [[87, 41], [204, 41], [186, 66], [141, 176], [87, 205], [211, 205]];

const DEFAULTS = { speed: 1, bloom: 'soft', thickness: 2.2, skeletonAfter: 0.18, glints: 3, sparks: 7, nodeScale: 1, halo: 1 };

export default function SigilCanvas({ mark, alt = 'mustr', caption, ctaText, url, host, config }) {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const net = root.querySelector('.sigil-net');
    const linksG = net.querySelector('.s-links');
    const nodesG = net.querySelector('.s-nodes');
    const glintsG = root.querySelector('.sigil-glints');
    const halo = root.querySelector('.sigil-halo');
    const markEl = root.querySelector('.sigil-mark');
    const stageEl = root.querySelector('.sigil-stage');
    const cap = root.querySelector('.sigil-caption');
    const cta = root.querySelector('.sigil-cta');

    const c = { ...DEFAULTS, ...(config || {}) };
    const s = 1 / c.speed;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let timers = [];
    let raf = 0;
    let dead = false;
    const T = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
    const cleanup = () => { dead = true; timers.forEach(clearTimeout); if (raf) cancelAnimationFrame(raf); };

    root.classList.add('sigil-armed');
    linksG.innerHTML = ''; nodesG.innerHTML = ''; glintsG.innerHTML = '';

    const V = BASE.map((n) => ({ x: n.x, y: n.y, r: n.r * c.nodeScale, sx: 20 + Math.random() * 260, sy: 10 + Math.random() * 220, el: null }));
    V.forEach((n) => {
      const e = document.createElementNS(NS, 'circle');
      e.setAttribute('class', 'sigil-node'); e.setAttribute('r', n.r);
      e.setAttribute('cx', n.sx); e.setAttribute('cy', n.sy); e.setAttribute('opacity', '0');
      e.style.filter = `drop-shadow(0 0 ${n.r * 1.4}px rgba(150,110,240,0.7))`;
      n.el = e; nodesG.appendChild(e);
    });

    const sparks = [];
    for (let i = 0; i < c.sparks; i++) {
      const sp = { sx: 20 + Math.random() * 260, sy: 10 + Math.random() * 220, tx: 120 + Math.random() * 60, ty: 100 + Math.random() * 60, el: null };
      const e = document.createElementNS(NS, 'circle');
      e.setAttribute('class', 'sigil-node'); e.setAttribute('r', 2 * c.nodeScale);
      e.setAttribute('cx', sp.sx); e.setAttribute('cy', sp.sy); e.setAttribute('opacity', '0');
      e.style.filter = 'drop-shadow(0 0 4px rgba(150,110,240,0.6))';
      sp.el = e; nodesG.appendChild(e); sparks.push(sp);
    }

    const mkLink = (a, b, core) => {
      const l = document.createElementNS(NS, 'line'); l.setAttribute('class', 'sigil-link');
      l.setAttribute('x1', V[a].x); l.setAttribute('y1', V[a].y); l.setAttribute('x2', V[b].x); l.setAttribute('y2', V[b].y);
      const len = Math.hypot(V[b].x - V[a].x, V[b].y - V[a].y);
      l.setAttribute('stroke-width', core ? c.thickness : Math.max(1, c.thickness * 0.7));
      l.setAttribute('stroke-opacity', core ? 0.9 : 0.7);
      l.style.strokeDasharray = len; l.style.strokeDashoffset = len;
      l.style.transition = `stroke-dashoffset ${0.6 * s}s ease`;
      linksG.appendChild(l); return l;
    };
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);

    const bloom = () => {
      if (dead) return;
      linksG.style.transition = `opacity ${0.8 * s}s ease`; linksG.style.opacity = String(c.skeletonAfter);
      nodesG.style.transition = `opacity ${0.8 * s}s ease`; nodesG.style.opacity = '0';
      halo.style.transition = `opacity ${1.1 * s}s ease`; halo.style.opacity = String(Math.min(1, c.halo));
      if (c.bloom === 'snap') {
        markEl.style.transition = `opacity ${0.28 * s}s ease, transform ${0.34 * s}s cubic-bezier(.2,1.4,.3,1)`;
      } else if (c.bloom === 'flash') {
        markEl.style.transition = `opacity ${0.18 * s}s ease, transform ${0.5 * s}s ease`;
        const fl = document.createElement('div');
        fl.style.cssText = `position:absolute;inset:0;border-radius:50%;pointer-events:none;opacity:0;transition:opacity ${0.12 * s}s ease;background:radial-gradient(circle at 50% 45%,rgba(230,215,255,.9),transparent 55%);`;
        stageEl.appendChild(fl);
        requestAnimationFrame(() => { fl.style.opacity = '1'; T(() => { fl.style.opacity = '0'; T(() => fl.remove(), 400 * s); }, 120 * s); });
      } else {
        markEl.style.transition = `opacity ${0.9 * s}s ease, transform ${0.9 * s}s cubic-bezier(.2,.9,.3,1.1)`;
      }
      markEl.style.opacity = '1'; markEl.style.transform = 'scale(1)';
      for (let g = 0; g < c.glints; g++) {
        const p = GLINT_PTS[g % GLINT_PTS.length]; const idx = g;
        const gl = document.createElementNS(NS, 'circle'); gl.setAttribute('class', 'sigil-glint');
        gl.setAttribute('cx', p[0]); gl.setAttribute('cy', p[1]); gl.setAttribute('r', 2.4 * c.nodeScale);
        gl.style.filter = 'drop-shadow(0 0 6px #fff)'; glintsG.appendChild(gl);
        T(() => { gl.style.animation = `sigilTwinkle ${(2 + idx * 0.4) * s}s ease-in-out infinite`; }, (300 + idx * 250) * s);
      }
      T(() => { cap.classList.add('show'); cta.classList.add('show'); }, 500 * s);
    };

    if (reduce) {
      V.forEach((n) => { n.el.setAttribute('cx', n.x); n.el.setAttribute('cy', n.y); n.el.setAttribute('opacity', '1'); });
      CORE_LINKS.concat(ARROW_LINKS).forEach((p) => { mkLink(p[0], p[1], true).style.strokeDashoffset = 0; });
      halo.style.opacity = String(Math.min(1, c.halo));
      markEl.style.transition = 'none'; markEl.style.opacity = '1'; markEl.style.transform = 'scale(1)';
      cap.classList.add('show'); cta.classList.add('show');
      return cleanup;
    }

    V.forEach((n, i) => T(() => { n.el.style.transition = `opacity ${0.5 * s}s ease`; n.el.setAttribute('opacity', '1'); }, (100 + i * 55) * s));
    sparks.forEach((sp, i) => T(() => { sp.el.style.transition = `opacity ${0.5 * s}s ease`; sp.el.setAttribute('opacity', '0.7'); }, (100 + i * 40) * s));

    let t0 = 0; const dur = 1050 * s;
    const travel = (ts) => {
      if (dead) return;
      if (!t0) t0 = ts;
      const t = Math.min(1, (ts - t0) / dur); const e = easeOut(t);
      V.forEach((n) => { n.el.setAttribute('cx', n.sx + (n.x - n.sx) * e); n.el.setAttribute('cy', n.sy + (n.y - n.sy) * e); });
      sparks.forEach((sp) => { sp.el.setAttribute('cx', sp.sx + (sp.tx - sp.sx) * e); sp.el.setAttribute('cy', sp.sy + (sp.ty - sp.sy) * e); sp.el.setAttribute('opacity', String(0.7 * (1 - e))); });
      if (t < 1) raf = requestAnimationFrame(travel); else draw();
    };
    const draw = () => {
      if (dead) return;
      CORE_LINKS.forEach((p, i) => T(() => { mkLink(p[0], p[1], true).style.strokeDashoffset = 0; }, i * 150 * s));
      T(() => ARROW_LINKS.forEach((p, i) => T(() => { mkLink(p[0], p[1], false).style.strokeDashoffset = 0; }, i * 160 * s)), (CORE_LINKS.length * 150 + 100) * s);
      T(bloom, (CORE_LINKS.length * 150 + ARROW_LINKS.length * 160 + 650) * s);
    };
    T(() => { t0 = 0; raf = requestAnimationFrame(travel); }, 900 * s);

    return cleanup;
  }, [mark, config]);

  return (
    <div className="sigil-wrap" ref={rootRef}>
      <div className="sigil-stage">
        <div className="sigil-halo" />
        <svg className="sigil-net" viewBox="0 0 300 240" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <g className="s-links" />
          <g className="s-nodes" />
        </svg>
        <img className="sigil-mark" src={mark} alt={alt} />
        <svg className="sigil-glints" viewBox="0 0 300 240" preserveAspectRatio="xMidYMid meet" aria-hidden="true" />
      </div>
      <p className="sigil-caption">{caption}</p>
      <a className="sigil-cta" href={url} target="_blank" rel="noopener">
        {ctaText} <span className="s-arrow">&rarr;</span>
      </a>
      <p className="seal-host sigil-host">{host}</p>
    </div>
  );
}
