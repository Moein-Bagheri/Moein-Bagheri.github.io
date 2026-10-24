// Sound Journey: a particle field that changes shape with each chapter, scroll-driven text and photographs,
// and optional sound: a quiet score in B major that hands over to "Lost" in chapter 2 and back.
import * as THREE from './vendor/three.module.min.js';

const { gsap, ScrollTrigger, Lenis } = window;
gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const short = matchMedia('(max-height: 560px)').matches;
const mobile = matchMedia('(max-width: 820px)').matches;
const motion = !reduce && !short; // scroll choreography; otherwise the page is plain, readable text
if (motion) root.classList.add('motion');
const sections = [...document.querySelectorAll('.ch')];
const STRINGS = mobile ? 6 : 8; // piano strings in chapter 2, one per frequency band of the music

// Shared state, animated by scroll and read by the renderer every frame
const state = { morph: 0, tremble: 0, pulse: 0, look: 0, peaks: 0, walk: 0, enter: 0, focus: 0, reveal: motion ? 0 : 1, fade: motion ? 0 : 1, leap: false, dim: 0 };
const bandVals = new Float32Array(16);
const plucks = new Float32Array(16); // strings plucked by the visitor, decaying
let level = 0;
let dirty = true; // reduced motion renders only when something changes

// "Lost": streamed from its peak section to the end of the song, then round again (see the sound section)
const lost = { el: null, active: false, fresh: true, stopTimer: 0, mix: 0 };
// The visitor's microphone in chapter 6: analysed in the browser only, never recorded or sent
const mic = { stream: null, src: null, analyser: null, own: null, data: null, wave: null, raw: 0, level: 0, bands: [0, 0, 0, 0] };
// What chapter 6's sphere keeps of a voice: an engraving (moments round the sphere × pitch bands, fading), the sphere's
// turn, and the melody of the last phrase. Only these numbers are kept, never the sound.
const VW = 128, VH = 32;
const voice = { level: new Float32Array(VW * VH), data: new Uint8Array(VW * VH * 4), dirty: false, any: false, spin: 0, play: -1, sing: 0, col: -1, phrase: null, quiet: 0, rewind: null, playing: null, playUntil: 0 };

/* ---------------------------------------------------------------- particle field */

createField();

function createField() {
  const canvas = document.getElementById('gl');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch (e) {
    canvas.remove();
    root.classList.add('no-gl');
    return;
  }
  renderer.setClearColor(0x070a14, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  let camZ = 9;
  camera.position.set(0, 0, camZ);

  const N = mobile ? 18000 : 60000;
  const SPAN = 4.2;
  const OX = mobile ? 0 : 1.5; // shapes sit right of the text column on wide screens
  const LY = mobile ? -2.75 : -1.6; // the line rests below the text
  const p0 = new Float32Array(N * 3), p2 = new Float32Array(N * 3);
  const rnd = new Float32Array(N), str = new Float32Array(N), along = new Float32Array(N);
  const gauss = () => {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // A few fine piano strings receding far into the dark, seen from the keyboard: near ends low and apart, far ends
  // gathering toward one point. Bass strings (left) are the longest. Each string listens to its own band of the music.
  // (on phones they sit low on the right, clear of the text and the button)
  const near0 = mobile ? [0.3, -3.05, 1.0] : [0.6, -1.8, 1.0], near1 = mobile ? [1.3, -3.0, 0.9] : [2.9, -1.72, 0.9];
  const far0 = mobile ? [0.75, -2.5, -11] : [2.55, 1.6, -16], far1 = mobile ? [0.95, -2.5, -9] : [3.05, 1.55, -12.5];
  const dust = mobile ? [0.8, -2.5, -4] : [2.4, 0, -6];

  // Chapters 3 to 6, computed in the shader: the path continues the strings' line into the distance; the
  // landscape lies low on the right and recedes; the sphere floats right of the text (below it on phones)
  const V = (a) => new THREE.Vector3(...a);
  const pathA = V(mobile ? [0.8, -3.05, 1.2] : [1.75, -1.85, 1.2]), pathB = V(mobile ? [0.9, -2.0, -20] : [3.9, 5.0, -30]);
  const terrA = V(mobile ? [-1.6, -2.7, 1.5] : [-0.3, -1.7, 1.5]), terrB = V(mobile ? [1.6, -2.7, -14] : [5.6, -1.7, -16]);
  const orb = V(mobile ? [0, -2.2, 0] : [2.7, 0, -1]), orbR = mobile ? 0.9 : 1.25;

  for (let i = 0; i < N; i++) {
    rnd[i] = Math.random();

    // 0 · a line of light, densest in the middle
    const lx = Math.random() < 0.62 ? gauss() * SPAN * 0.36 : (Math.random() * 2 - 1) * SPAN;
    p0.set([clamp(lx, -SPAN * 1.5, SPAN * 1.5), LY + gauss() * 0.012, gauss() * 0.08], i * 3);

    // 1 · the strings; "along" runs from the near end (0) to the far end (1), and both ends are nodes.
    // Points crowd toward the near end, which covers more of the screen. Some points are motes of light
    // that leave a string and float up while it sounds (aStr = -1 - string); the rest is faint, distant dust.
    const r = Math.random();
    if (r < 0.85) {
      const s = (Math.random() * STRINGS) | 0, f = s / (STRINGS - 1);
      const a = Math.pow(Math.random(), 1.35);
      const q = lerp3(lerp3(near0, near1, f), lerp3(far0, far1, f), a);
      p2.set([q[0] + gauss() * 0.0025, q[1] + gauss() * 0.0025, q[2]], i * 3);
      str[i] = r < 0.6 ? s : -1 - s;
      along[i] = a;
    } else {
      p2.set([dust[0] + gauss() * (mobile ? 2 : 4), dust[1] + gauss() * (mobile ? 1.6 : 2.4), dust[2] - 3 + gauss() * 3], i * 3);
      str[i] = -100;
    }
  }

  // 3 · the gate (chapter 4): a Persian portal drawn in light, as on the old buildings of Yazd. A pointed arch with a
  // cusped inner edge stands in a band of voussoirs; the frame around it carries an inscription made of bits, with a
  // twisted colonette at each side and a cresting along the top. In the spandrels, eight-pointed stars send circuit
  // traces out toward the frame, and a chip sits at the crown; lattice panels fill the foot of the frame, steps lead
  // up to the threshold over a tiled court, and two windcatchers stand behind. A glow beyond the curtain spills down
  // the steps. It is built from segments in the gate's own units (u across, v up, w toward the viewer; the origin is
  // the middle of the threshold), then scaled into place right of the text, or below it on phones. The curtain of
  // bits that hangs in the doorway and the traveller on the steps are drawn separately (see createGate).
  const GS = mobile ? 0.56 : 1.06;
  const G0 = mobile ? [0, -2.95, -1] : [1.95, -1.42, -1.2];
  // opening half-width, springing height, arc-centre offset, the voussoir band's two edges, the frame and its band
  const AR = { a: 0.78, hs: 1.45, d: 0.312, t: 0.1, t2: 0.22, A: 1.36, V: 3.12, band: 0.1 };
  AR.r = AR.a + AR.d;
  AR.A2 = AR.A - AR.band;
  AR.V2 = AR.V - AR.band;
  const archV = (u, off = 0) => AR.hs + Math.sqrt(Math.max(0, (AR.r + off) ** 2 - (Math.abs(u) + AR.d) ** 2));
  const toWorld = (u, v, w) => [G0[0] + u * GS, G0[1] + v * GS, G0[2] + w * GS];
  const NS = mobile ? 9 : 22; // strands in the curtain, each hanging from a pad just under the cusps
  const strandU = (i) => (-1 + (2 * i + 1) / NS) * (AR.a - 0.07);
  const anchorV = (u) => archV(u) - 0.075;
  const CHIP = [0, 2.87, 0.1];
  const p3 = new Float32Array(N * 4), g3 = new Float32Array(N), q3 = new Float32Array(N);
  buildGate();

  function buildGate() {
    // segments grouped by part: [from, to, value at from, value at to, param at from, param at to, length]. The value
    // is a brightness (for a trace, its index); the param runs along the part, for light that travels along it
    const groups = {};
    const seg = (name, role, a, b, g0 = 1, g1 = g0, q0 = 0, q1 = q0) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (len < 1e-6) return;
      (groups[name] = groups[name] || { role, list: [] }).list.push([a, b, g0, g1, q0, q1, len]);
    };
    // a polyline whose param runs from 0 to 1 along its length
    const poly = (name, role, pts, g = 1) => {
      const lens = pts.slice(1).map((q, k) => Math.hypot(q[0] - pts[k][0], q[1] - pts[k][1], q[2] - pts[k][2]));
      const total = lens.reduce((x, y) => x + y, 0) || 1;
      let run = 0;
      lens.forEach((len, k) => {
        seg(name, role, pts[k], pts[k + 1], g, g, run / total, (run + len) / total);
        run += len;
      });
    };
    const ring = (name, role, c, r, g = 1, n = 12) => {
      const pts = [];
      for (let k = 0; k <= n; k++) pts.push([c[0] + r * Math.cos((k / n) * 2 * Math.PI), c[1] + r * Math.sin((k / n) * 2 * Math.PI), c[2]]);
      poly(name, role, pts, g);
      seg(name, role, [c[0] - r * 0.3, c[1], c[2]], [c[0] + r * 0.3, c[1], c[2]], g);
    };
    const sides = [-1, 1];
    const { a, hs, d, t, t2, A, V, A2, V2 } = AR;

    // the arch, one side at a time: a circle about the centre on the other side of the axis, from the springing
    // (th = 0) to the crown; on the front edge, four cusps a side
    const half = (s, off, w, cusps, steps = 48) => {
      const R = AR.r + off, th0 = Math.acos(d / R), pts = [];
      for (let k = 0; k <= steps; k++) {
        const th = (th0 * k) / steps, f = ((cusps * k) / steps + 0.5) % 1;
        const rr = cusps ? R - 0.05 * (1 - Math.sin(Math.PI * f)) : R;
        pts.push([s * (-d + rr * Math.cos(th)), hs + rr * Math.sin(th), w]);
      }
      return pts;
    };
    // the whole line: up the left jamb, over the crown, down the right jamb
    const archLine = (off, w, cusps = 0) => [[-(a + off), 0, w], ...half(-1, off, w, cusps), ...half(1, off, w, cusps).reverse().slice(1), [a + off, 0, w]];
    poly('front', 0, archLine(0, 0.1, 4));
    poly('back', 0, archLine(0, -0.12), 0.4);
    poly('volt', 0, archLine(t, 0.1), 0.8);
    poly('volt', 0, archLine(t2, 0.1), 0.6);
    // voussoirs: short ticks across the band, and the arch's depth every so often. Their param is where they sit
    // along the arch (as for the arch lines: 0 at the left foot, 1 at the right), so the surge passes them in turn
    const archLen = 2 * (hs + (AR.r + t) * Math.acos(d / (AR.r + t)));
    const along = (s, l) => (s < 0 ? l / archLen : 1 - l / archLen);
    sides.forEach((s) => {
      const R1 = AR.r + t, R2 = AR.r + t2, th0 = Math.acos(d / R2);
      for (let th = 0.06; th < th0 - 0.03; th += 0.085) {
        const c = Math.cos(th), sn = Math.sin(th), q = along(s, hs + R1 * th);
        seg('vouss', 0, [s * (-d + R1 * c), hs + R1 * sn, 0.1], [s * (-d + R2 * c), hs + R2 * sn, 0.1], 0.5, 0.5, q, q);
      }
      for (let v = 0.12; v < hs; v += 0.11) seg('vouss', 0, [s * (a + t), v, 0.1], [s * (a + t2), v, 0.1], 0.5, 0.5, along(s, v), along(s, v));
      for (let th = 0.1; th < Math.acos(d / AR.r); th += 0.32) {
        const p = [s * (-d + AR.r * Math.cos(th)), hs + AR.r * Math.sin(th)], q = along(s, hs + AR.r * th);
        seg('soffit', 0, [p[0], p[1], 0.1], [p[0], p[1], -0.12], 0.3, 0.3, q, q);
      }
      for (let v = 0.25; v < hs; v += 0.4) seg('soffit', 0, [s * a, v, 0.1], [s * a, v, -0.12], 0.3, 0.3, along(s, v), along(s, v));
    });

    // the frame: an outer line, and the inner edge of its band; a dado and a base line in each side panel
    poly('frame', 1, [[-A, 0, 0.1], [-A, V, 0.1], [A, V, 0.1], [A, 0, 0.1]]);
    poly('frame', 1, [[-A2, 0, 0.1], [-A2, V2, 0.1], [A2, V2, 0.1], [A2, 0, 0.1]], 0.6);
    sides.forEach((s) => {
      seg('frame', 1, [s * (a + t2), 0.44, 0.1], [s * A2, 0.44, 0.1], 0.5);
      seg('frame', 1, [s * (a + t2), 0.03, 0.1], [s * A2, 0.03, 0.1], 0.4);
    });
    // a lattice of diamonds in the panels below the dado
    sides.forEach((s) => {
      const u0 = a + t2 + 0.02, u1 = A2 - 0.02, v0 = 0.07, v1 = 0.4, k = 0.065;
      for (let c = u0 - (v1 - v0); c < u1; c += k) {
        [1, -1].forEach((dir) => {
          // the line u = c + dir·(v − v0) (or its mirror), clipped to the panel
          const pts = [];
          for (let v = v0; v <= v1 + 1e-6; v += (v1 - v0) / 24) {
            const u = dir > 0 ? c + (v - v0) : c + (v1 - v);
            if (u >= u0 && u <= u1) pts.push([s * u, v, 0.1]);
          }
          if (pts.length > 1) seg('dado', 1, pts[0], pts[pts.length - 1], 0.5);
        });
      }
    });

    // an inscription in the band, written in bits: rows of short dashes, on or off by a seeded pattern, with a full
    // stroke every few columns, as in square Kufic. Its param runs round the band from the left foot to the right
    const path = [[-A + AR.band / 2, 0.05], [-A + AR.band / 2, V - AR.band / 2], [A - AR.band / 2, V - AR.band / 2], [A - AR.band / 2, 0.05]];
    const plen = path.slice(1).map((q, k) => Math.hypot(q[0] - path[k][0], q[1] - path[k][1]));
    const ptotal = plen.reduce((x, y) => x + y, 0);
    let bitSeed = 3;
    const bit = () => (bitSeed = (bitSeed * 48271) % 2147483647) % 100;
    for (let k = 0, run = 0, col = 0; k < 3; run += plen[k], k++) {
      const [x0, y0] = path[k], [x1, y1] = path[k + 1], dx = (x1 - x0) / plen[k], dy = (y1 - y0) / plen[k];
      for (let s = 0.016; s < plen[k] - 0.01; s += 0.032, col++) {
        const stroke = col % 7 === 3;
        [-0.028, 0, 0.028].forEach((o) => {
          if (!stroke && bit() > 46) return;
          const cx = x0 + dx * s - dy * o, cy = y0 + dy * s + dx * o, q = (run + s) / ptotal;
          seg('inscr', 10, [cx - dx * 0.011, cy - dy * 0.011, 0.1], [cx + dx * 0.011, cy + dy * 0.011, 0.1], 1, 1, q, q);
        });
      }
    }

    // a twisted colonette at each side of the frame, with a base and a capital
    sides.forEach((s) => {
      const uc = s * (A + 0.05), top = V - 0.07;
      [0, Math.PI].forEach((ph) => {
        const pts = [];
        for (let v = 0.08; v <= top; v += 0.012) pts.push([uc + 0.024 * Math.cos(v * 45 + ph), v, 0.1 + 0.024 * Math.sin(v * 45 + ph)]);
        poly('colon', 1, pts, 0.7);
      });
      poly('colon', 1, [[uc - 0.045, 0, 0.1], [uc - 0.045, 0.08, 0.1], [uc + 0.045, 0.08, 0.1], [uc + 0.045, 0, 0.1]], 0.6);
      poly('colon', 1, [[uc - 0.03, top, 0.1], [uc - 0.05, V, 0.1], [uc + 0.05, V, 0.1], [uc + 0.03, top, 0.1]], 0.6);
    });

    // the cresting: a row of small pointed merlons along the top
    for (let m = 0; m < 13; m++) {
      const uc = -A + ((m + 0.5) * 2 * A) / 13, hw = 0.075, pts = [];
      for (let k = 0; k <= 16; k++) {
        const f = k / 16, side = f < 0.5 ? -1 : 1, g = side < 0 ? f * 2 : 2 - f * 2; // 0 at the foot, 1 at the tip
        pts.push([uc + side * hw * Math.cos((g * Math.PI) / 2) ** 0.9, V + 0.12 * g ** 0.85, 0.1]);
      }
      poly('crest', 1, pts, 0.55);
    }

    // an eight-pointed star in each spandrel: its outline, an inner circle and a centre
    const STARS = sides.map((s) => [s * 0.98, 2.62]), SR = 0.17;
    STARS.forEach(([cx, cy]) => {
      const pts = [];
      for (let k = 0; k <= 16; k++) {
        const r = k % 2 ? SR * 0.72 : SR, th = (k / 16) * 2 * Math.PI + Math.PI / 8;
        pts.push([cx + r * Math.cos(th), cy + r * Math.sin(th), 0.1]);
      }
      poly('stars', 11, pts);
      ring('stars', 11, [cx, cy, 0.1], SR * 0.42, 0.8, 16);
      ring('stars', 11, [cx, cy, 0.1], 0.02, 1);
    });

    // the chip at the crown, with its pins
    const [, cy, cw] = CHIP, ch = 0.065;
    poly('chip', 9, [[-ch, cy - ch, cw], [ch, cy - ch, cw], [ch, cy + ch, cw], [-ch, cy + ch, cw], [-ch, cy - ch, cw]]);
    poly('chip', 9, [[-0.03, cy - 0.03, cw], [0.03, cy - 0.03, cw], [0.03, cy + 0.03, cw], [-0.03, cy + 0.03, cw], [-0.03, cy - 0.03, cw]], 0.55);
    [-0.04, 0, 0.04].forEach((o) => {
      sides.forEach((s) => seg('chip', 9, [s * ch, cy + o, cw], [s * (ch + 0.035), cy + o, cw], 0.7));
      seg('chip', 9, [o * 0.75, cy + ch, cw], [o * 0.75, cy + ch + 0.025, cw], 0.7);
    });

    // circuit traces: random walks on a fine grid (eight directions, never crossing, never turning back) from the
    // arch's band, the stars and the chip out toward the frame, each ending in a via; the right half is mirrored
    let seed = 11;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const C = 0.055, GW = Math.floor(A2 / C), GH = Math.floor(V2 / C);
    const used = new Uint8Array((GW + 2) * (GH + 2));
    const at = (i, j) => j * (GW + 2) + i;
    const clear = (u, v) => v > 0.5 && !(u < 0.17 && v > 2.74) && Math.hypot(u - STARS[1][0], v - STARS[1][1]) > SR + 0.05 &&
      (v < hs ? u > a + t2 + 0.04 : Math.hypot(u + d, v - hs) > AR.r + t2 + 0.04);
    const free = (i, j) => i >= 1 && j >= 1 && i < GW && j < GH && !used[at(i, j)] && clear(i * C, j * C);
    const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const R2 = AR.r + t2, starts = [];
    [12, 26, 40, 54, 66].forEach((deg) => {
      const th = (deg * Math.PI) / 180, c = Math.cos(th), sn = Math.sin(th);
      starts.push([[-d + R2 * c, hs + R2 * sn], [-d + (R2 + 0.08) * c, hs + (R2 + 0.08) * sn], Math.round(th / (Math.PI / 4))]);
    });
    [0.7, 0.98, 1.26].forEach((v) => starts.push([[a + t2, v], [a + t2 + 0.08, v], 0]));
    [cy - 0.04, cy + 0.04].forEach((v) => starts.push([[ch + 0.035, v], [ch + 0.11, v], 0]));
    for (let k = 0; k < 8; k++) {
      const th = (k / 8) * 2 * Math.PI + Math.PI / 8, c = Math.cos(th), sn = Math.sin(th);
      const [sx, sy] = STARS[1];
      starts.push([[sx + SR * c, sy + SR * sn], [sx + (SR + 0.07) * c, sy + (SR + 0.07) * sn], (Math.round(th / (Math.PI / 4)) + 8) % 8]);
    }
    for (let k = starts.length - 1; k > 0; k--) {
      const q = Math.floor(rand() * (k + 1));
      [starts[k], starts[q]] = [starts[q], starts[k]];
    }
    let traceN = 0;
    starts.forEach(([pin, first, d0]) => {
      let i = Math.round(first[0] / C), j = Math.round(first[1] / C), dir = d0;
      if (!free(i, j)) return;
      const pts = [pin, [i * C, j * C]];
      used[at(i, j)] = 1;
      for (let s = 0, max = 5 + Math.floor(rand() * 11); s < max; s++) {
        const r = rand(), order = r < 0.7 ? [0, 1, -1] : r < 0.85 ? [1, 0, -1] : [-1, 0, 1];
        const o = order.map((tq) => (dir + tq + 8) % 8).find((o) => {
          const [di, dj] = DIRS[o];
          return di * DIRS[d0][0] + dj * DIRS[d0][1] >= 0 && free(i + di, j + dj) && !(di && dj && used[at(i + di, j)] && used[at(i, j + dj)]);
        });
        if (o === undefined) break;
        i += DIRS[o][0];
        j += DIRS[o][1];
        dir = o;
        used[at(i, j)] = 1;
        pts.push([i * C, j * C]);
      }
      if (pts.length < 4) return;
      const end = i >= GW - 1 || j >= GH - 1;
      if (end) pts.push(i >= GW - 1 ? [A2, j * C] : [i * C, V2]); // it runs into the frame
      const tr = traceN++;
      sides.forEach((s) => {
        let along = 0;
        pts.slice(1).forEach((q, k) => {
          const p = pts[k], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
          seg('traces', 2, [s * p[0], p[1], 0.1], [s * q[0], q[1], 0.1], tr, tr, along, along + len);
          along += len;
        });
        if (!end) ring('vias', 3, [s * pts[pts.length - 1][0], pts[pts.length - 1][1], 0.1], 0.022, tr % 3 ? 0.9 : 10.9); // every third via is gold
      });
    });
    sides.forEach((s) => seg('traces', 2, [s * 0.03, cy - ch, cw], [s * 0.03, archV(0.03, t2), cw], 20, 20, 0.15, 0));

    // a pad for each strand of the curtain
    for (let i = 0; i < NS; i++) ring('pads', 3, [strandU(i), anchorV(strandU(i)), 0], 0.012, 0.6);

    // the steps: the threshold's edge, five nosings and the profile at each side
    const sh = a + 0.3;
    seg('steps', 4, [-sh, 0, 0.12], [sh, 0, 0.12]);
    for (let k = 1; k <= 5; k++) seg('steps', 4, [-sh, -0.09 * k, 0.12 + 0.17 * k], [sh, -0.09 * k, 0.12 + 0.17 * k], 1 - k * 0.1);
    sides.forEach((s) => {
      const pts = [];
      for (let k = 0; k <= 5; k++) pts.push([s * sh, -0.09 * k, 0.12 + 0.17 * k], [s * sh, -0.09 * (k + 1), 0.12 + 0.17 * k]);
      poly('steps', 4, pts, 0.4);
    });
    // the tiled court before the steps, its lines fading out to the sides and toward the viewer
    for (let k = 0; k < 6; k++) {
      const w = 0.97 + k * 0.3, g = 0.5 - k * 0.07;
      seg('court', 4, [-2.8, -0.54, w], [0, -0.54, w], 0.03, g);
      seg('court', 4, [0, -0.54, w], [2.8, -0.54, w], g, 0.03);
    }
    for (let u = -2.55; u <= 2.56; u += 0.3) seg('court', 4, [u, -0.54, 0.97], [u, -0.54, 2.47], 0.32 * (1 - Math.abs(u) / 2.8), 0.04);

    // two windcatchers behind, faint: a tall body with a small arched window, a crown of vents, and a cap
    sides.forEach((s) => {
      const uc = s * 2.3, w = -1.5, hw = 0.2;
      poly('wind', 14, [[uc - hw, 0, w], [uc - hw, 3.55, w], [uc + hw, 3.55, w], [uc + hw, 0, w]]);
      seg('wind', 14, [uc - hw, 2.75, w], [uc + hw, 2.75, w]);
      for (let k = 1; k < 5; k++) seg('wind', 14, [uc - hw + k * 0.08, 2.78, w], [uc - hw + k * 0.08, 3.5, w], 0.8);
      poly('wind', 14, [[uc - hw - 0.03, 3.55, w], [uc - hw - 0.03, 3.68, w], [uc + hw + 0.03, 3.68, w], [uc + hw + 0.03, 3.55, w]]);
      const win = [];
      for (let k = 0; k <= 12; k++) {
        const f = k / 12, sd = f < 0.5 ? -1 : 1, g = sd < 0 ? f * 2 : 2 - f * 2;
        win.push([uc + sd * 0.07 * Math.cos((g * Math.PI) / 2), 1.55 + 0.16 * Math.sin((g * Math.PI) / 2), w]);
      }
      poly('wind', 14, [[uc - 0.07, 1.25, w], ...win, [uc + 0.07, 1.25, w], [uc - 0.07, 1.25, w]], 0.8);
    });

    // particles go to the parts by a fixed budget (scaled for phones), spread evenly along each part's length
    let fill = 0;
    const put = (q, role, g, qq = 0) => {
      if (fill >= N) return;
      const w = toWorld(q[0], q[1], q[2]);
      p3.set([w[0], w[1], w[2], role], fill * 4);
      q3[fill] = qq;
      g3[fill++] = g;
    };
    const sample = (name, count, jit = 0.004) => {
      const gr = groups[name];
      if (!gr) return;
      let acc = 0;
      const cum = gr.list.map((s) => (acc += s[6]));
      for (let k = 0; k < count; k++) {
        const x = Math.random() * acc;
        let lo = 0, hi = cum.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (cum[mid] < x) lo = mid + 1;
          else hi = mid;
        }
        const [p, q, g0, g1, q0, q1, len] = gr.list[lo], f = 1 - (cum[lo] - x) / len;
        put([p[0] + (q[0] - p[0]) * f + gauss() * jit, p[1] + (q[1] - p[1]) * f + gauss() * jit, p[2] + (q[2] - p[2]) * f], gr.role, g0 + (g1 - g0) * f, q0 + (q1 - q0) * f);
      }
    };
    const B = (n) => Math.round((n * N) / 60000);
    [['front', 4200], ['back', 1600], ['volt', 4400], ['vouss', 1400], ['soffit', 500], ['frame', 3400], ['dado', 1200],
      ['inscr', 2800], ['colon', 2200], ['crest', 1400], ['stars', 2200], ['chip', 900], ['traces', 4800], ['vias', 900],
      ['pads', 700], ['steps', 4000], ['court', 2200], ['wind', 3800]].forEach(([name, n]) => sample(name, B(n)));
    // the glow beyond the curtain, brightest low in the doorway
    for (let k = 0, n = B(4000); k < n; k++) {
      const u = clamp(gauss() * 0.3, -a + 0.03, a - 0.03), top = archV(u) - 0.04;
      const v = Math.random() < 0.75 ? Math.min(top, -Math.log(1 - Math.random()) * 0.4) : Math.random() * top;
      put([u, v, -0.3 + gauss() * 0.08], 5, 0.5 + Math.random());
    }
    // its light on the threshold, the steps and the court, fading with distance
    for (let k = 0, n = B(4000); k < n; k++) {
      const s = Math.min(6, Math.floor(Math.pow(Math.random(), 1.5) * 7));
      const u = s < 6 ? clamp(gauss() * (0.28 + s * 0.07), -sh, sh) : gauss() * 0.7;
      const w = s === 0 ? -0.1 + Math.random() * 0.22 : s < 6 ? 0.12 + 0.17 * (s - 1 + Math.random()) : 0.97 + Math.random() * 0.7;
      put([u, s < 6 ? -0.09 * s : -0.54, w], 6, Math.exp(-s * 0.32) * (1 - Math.min(1, Math.abs(u) / (a + 0.6))));
    }
    // motes floating up through the light, and faint dust all around
    for (let k = 0, n = B(4000); k < n; k++) put([gauss() * 0.38, Math.random() * 1.7 - 0.55, -0.3 + Math.random() * 1.5], 7, 0.5 + Math.random());
    while (fill < N) put([gauss() * 2.4, Math.random() * 4.6 - 0.9, -0.8 + gauss() * 1.4], 8, 0.4 + Math.random() * 0.8);
  }

  // Strings vibrate across the plane they lie in
  const mid = (a, b) => lerp3(a, b, 0.5);
  const dir = new THREE.Vector3(...mid(far0, far1)).sub(new THREE.Vector3(...mid(near0, near1)));
  const side = new THREE.Vector3(...near1).sub(new THREE.Vector3(...near0));
  const normal = side.cross(dir).normalize();
  if (normal.y < 0) normal.negate();

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p0, 3));
  geo.setAttribute('aP2', new THREE.BufferAttribute(p2, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  geo.setAttribute('aStr', new THREE.BufferAttribute(str, 1));
  geo.setAttribute('aU', new THREE.BufferAttribute(along, 1));
  geo.setAttribute('aP3', new THREE.BufferAttribute(p3, 4));
  geo.setAttribute('aG', new THREE.BufferAttribute(g3, 1));
  geo.setAttribute('aQ', new THREE.BufferAttribute(q3, 1));

  // the voice engraved on chapter 6's sphere (written by listen(), in the sound section)
  const voiceTex = new THREE.DataTexture(voice.data, VW, VH, THREE.RGBAFormat);
  voiceTex.wrapS = THREE.RepeatWrapping;
  voiceTex.magFilter = voiceTex.minFilter = THREE.LinearFilter;
  voiceTex.needsUpdate = true;

  const uniforms = {
    uTime: { value: 0 }, uMorph: { value: 0 }, uTremble: { value: 0 }, uReveal: { value: 0 }, uFade: { value: 0 },
    uB: { value: bandVals }, uLevel: { value: 0 }, uMix: { value: 0 }, uStrings: { value: STRINGS },
    uStrN: { value: normal }, uP: { value: plucks },
    uField: { value: null }, uRipple: { value: new THREE.Vector3(9, 9, 99) },
    uAspect: { value: 1 }, uTanHalf: { value: Math.tan(THREE.MathUtils.degToRad(17.5)) },
    uPathA: { value: pathA }, uPathB: { value: pathB }, uTerrA: { value: terrA }, uTerrB: { value: terrB },
    uOrb: { value: orb }, uOrbR: { value: orbR }, uPeaks: { value: 0 }, uMic: { value: 0 }, uMicB: { value: new THREE.Vector4() },
    uFig: { value: new THREE.Vector3(0, -99, 0) }, uFigA: { value: 0 },
    uSurge: { value: 0 }, uDoor: { value: 0 }, uStep: { value: new THREE.Vector4(0, -99, 0, 99) },
    uVoice: { value: voiceTex }, uSpin: { value: 0 }, uPlay: { value: -1 },
    uSize: { value: 0.013 }, uPixel: { value: 1 }, uSpan: { value: SPAN },
    uColA: { value: new THREE.Color('#5d7cff') }, uColB: { value: new THREE.Color('#e8b74a') },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 aP2; attribute float aRand; attribute float aStr; attribute float aU;
      attribute vec4 aP3; attribute float aG; attribute float aQ;
      uniform float uTime, uMorph, uTremble, uReveal, uFade, uLevel, uMix, uStrings, uSize, uPixel, uSpan;
      uniform float uB[16], uP[16];
      uniform vec3 uStrN, uRipple, uPathA, uPathB, uTerrA, uTerrB, uOrb, uFig;
      uniform sampler2D uField, uVoice;
      uniform float uAspect, uTanHalf, uOrbR, uPeaks, uMic, uFigA, uSurge, uDoor, uSpin, uPlay;
      uniform vec4 uMicB, uStep;
      varying float vAlpha; varying float vGold; varying float vSoft;

      float hsh(float n) { return fract(sin(n) * 43758.5453123); }

      // 2 · one path: the strings close into a single stream of light that runs into the distance
      float gA = 0.0;
      vec3 pathPos() {
        float a = fract(hsh(aRand * 311.7) + uTime * 0.03);
        float w = mix(0.22, 0.015, pow(a, 0.6)) * (hsh(aRand * 7.3) < 0.3 ? 6.0 : 1.0);
        gA = a;
        return mix(uPathA, uPathB, pow(a, 0.75)) + vec3((hsh(aRand * 97.1) - 0.5) * 2.0, (hsh(aRand * 53.3) - 0.5) * 0.7, hsh(aRand * 29.7) - 0.5) * w;
      }

      // 3 · the gate: arch, frame and ornament in fine lines of light, the windcatchers faint behind. The traces carry
      // pulses of data toward the doorway, and the inscription reads itself slowly. The glow beyond the curtain spills
      // down the steps (brighter as the traveller nears, uDoor), and the traveller standing in it casts a shadow toward
      // us; each footstep leaves a ring of light on its step (uStep: where, and how long ago). When the traveller
      // enters, light climbs both sides of the arch to the chip at the crown, then runs out through every trace, star
      // and letter (uSurge). The stonework barely gives under the hand; light and dust drift freely.
      float gLook = 0.0, gSize = 1.0, gSoft = 0.0, gGold = 0.0, gGive = 1.0;
      vec3 gatePos() {
        vec3 p = aP3.xyz;
        float role = aP3.w;
        float s1 = clamp(uSurge * 2.0, 0.0, 1.0), s2 = clamp(uSurge * 2.0 - 1.0, 0.0, 1.0), bloom = sin(3.14159 * s2);
        gLook = 0.75 * aG; gSize = 0.85; gSoft = 0.0; gGold = 0.0; gGive = 0.3;
        if (role < 0.5) {
          float f = exp(-pow((abs(aQ - 0.5) * 2.0 - (1.0 - s1)) / 0.07, 2.0)) * step(0.001, s1) * (1.0 - s2);
          gLook += f * 1.8; gGold = f;
        } else if (role < 1.5) {
          gLook = 0.55 * aG * (1.0 + bloom * 0.9); gGold = bloom * 0.6;
        } else if (role < 2.5) {
          float pulse = pow(max(0.0, sin(aQ * 5.0 + uTime * 1.4 + aG * 2.3)), 40.0);
          float f = exp(-pow((aQ - s2 * 1.6) / 0.09, 2.0)) * step(0.001, s2);
          gLook = 0.5 + pulse * 1.4 + f * 2.0; gGold = max(pulse * 0.9, f);
        } else if (role < 3.5) {
          float gold = step(5.0, aG);
          gLook = 0.6 * (aG - gold * 10.0) * (1.0 + bloom); gSize = 0.95; gGold = max(gold, bloom * 0.7);
        } else if (role < 4.5) {
          gLook = 0.6 * aG * (1.0 + uDoor * 0.6);
        } else if (role < 5.5) {
          gLook = 0.13 * aG * (1.0 + uDoor * 1.4); gSize = 3.6; gSoft = 1.0; gGive = 1.0;
          p.y += sin(uTime * 0.3 + aRand * 20.0) * 0.03;
        } else if (role < 6.5) {
          gLook = 0.42 * aG * (1.0 + uDoor); gSize = 0.9; gGive = 0.6;
        } else if (role < 7.5) {
          float life = fract(uTime * (0.02 + fract(aRand * 9.1) * 0.03) + aRand * 5.0);
          p.y += life * 0.9;
          p.x += sin(uTime * 0.4 + aRand * 30.0) * 0.06;
          gLook = 0.22 * aG * sin(3.14159 * life) * (1.0 + uDoor); gGive = 1.0;
        } else if (role < 8.5) {
          gLook = 0.06 * aG; gSize = 0.7; gGive = 1.0;
        } else if (role < 9.5) {
          float hit = exp(-pow((uSurge - 0.5) / 0.07, 2.0));
          gLook = 0.7 * aG * (1.0 + hit * 3.0 + bloom); gGold = 1.0; gSize = 0.95 + hit * 0.5;
        } else if (role < 10.5) {
          float read = exp(-pow((fract(aQ - uTime * 0.03) - 0.5) / 0.05, 2.0));
          float f = exp(-pow((abs(aQ - 0.5) * 2.0 - s2) / 0.08, 2.0)) * step(0.001, s2);
          gLook = 0.42 * aG * (0.8 + read * 1.2) + f * 1.6; gGold = f + read * 0.25; gSize = 0.8;
        } else if (role < 11.5) {
          gLook = 0.8 * aG * (0.85 + 0.15 * sin(uTime * 0.8 + aQ * 6.28)) * (1.0 + bloom * 1.5); gGold = 0.2 + bloom * 0.8;
        } else {
          gLook = 0.62 * aG; gSize = 0.85; gGive = 0.5;
        }
        if (role > 3.5 && role < 6.5) {
          float dz = p.z - uFig.z, wS = 0.09 + dz * 0.2;
          float sh = step(0.0, dz) * (1.0 - smoothstep(wS * 0.5, wS, abs(p.x - uFig.x))) * (1.0 - smoothstep(0.3, 1.2, dz));
          gLook *= 1.0 - 0.8 * sh * uFigA;
          float ringS = exp(-pow((length(p.xz - uStep.xz) - 0.04 - uStep.w * 0.45) / 0.05, 2.0)) * exp(-uStep.w * 1.6) * step(abs(p.y - uStep.y), 0.06);
          gLook += ringS * 1.5; gGold += ringS;
        }
        return p;
      }

      // 4 · a spectrogram landscape: rows are moments rolling toward the viewer, across is pitch, height is energy.
      // The sound is voice-like: a gliding fundamental, its harmonics, and formants that move like vowels.
      float gH = 0.0, gD = 0.0, gPeak = 0.0;
      float spec(float f, float tau) {
        float f0 = 0.055 + 0.015 * sin(tau * 0.7) + 0.008 * sin(tau * 2.3);
        float F1 = 0.13 + 0.05 * sin(tau * 1.3), F2 = 0.36 + 0.12 * sin(tau * 0.9 + 1.0), F3 = 0.62 + 0.05 * sin(tau * 0.6 + 2.0);
        float env = exp(-pow((f - F1) / 0.06, 2.0)) + 0.75 * exp(-pow((f - F2) / 0.08, 2.0)) + 0.35 * exp(-pow((f - F3) / 0.07, 2.0));
        float harm = 0.0;
        for (int k = 1; k <= 14; k++) harm += exp(-pow((f - float(k) * f0) / 0.007, 2.0));
        float voiced = smoothstep(0.3, 0.65, 0.5 + 0.5 * sin(tau * 1.6) * cos(tau * 0.37));
        float hiss = (1.0 - voiced) * smoothstep(0.55, 0.9, f) * 0.25 * (0.5 + 0.5 * sin(tau * 5.0 + f * 40.0));
        return voiced * env * min(harm, 1.0) * (1.0 - 0.5 * f) + hiss;
      }
      vec3 terrPos() {
        float row = floor(hsh(aRand * 173.3) * 48.0), x = hsh(aRand * 71.9), d = row / 47.0;
        float h = spec(x, row * 0.16 - uTime * 0.55) * 0.9 * (1.0 - 0.45 * uPeaks);
        // chapter 5: a peak rises out of the sound for each project
        float pk = 0.0;
        for (int k = 0; k < 4; k++) {
          float fk = float(k);
          vec2 c = vec2(0.18 + 0.22 * fk, k == 0 ? 0.28 : k == 1 ? 0.52 : k == 2 ? 0.34 : 0.62);
          float grow = smoothstep(0.12 + 0.18 * fk, 0.32 + 0.18 * fk, uPeaks);
          pk += grow * exp(-pow((x - c.x) / 0.06, 2.0) - pow((d - c.y) / 0.1, 2.0));
        }
        h += pk * 1.3;
        gH = h; gD = d; gPeak = pk;
        return vec3(mix(uTerrA.x, uTerrB.x, x), uTerrA.y + h, mix(uTerrA.z, uTerrB.z, d));
      }

      // 5 · a sphere that listens, like a phonograph's cylinder. While the visitor speaks it turns, and each moment of
      // their voice is engraved round it as a ring of ridges: its spectrum, low pitches low on the sphere, high ones
      // high. A phrase becomes a shape that fades slowly. When they pause, the sphere turns back over the phrase and
      // sings its melody; where the playing passes (uPlay) the engraving glows. It breathes on its own, and trembles
      // with the voice and the song.
      float gBump = 0.0, gVoice = 0.0;
      vec3 orbPos() {
        float tb = hsh(aRand * 13.1), ph = acos(2.0 * hsh(aRand * 41.7) - 1.0), th = 6.2831853 * tb + uSpin;
        vec3 dir = vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));
        float n = sin(dir.x * 4.0 + uTime * 1.7) * sin(dir.y * 5.0 - uTime * 1.3) * sin(dir.z * 3.0 + uTime * 1.1);
        float fine = sin(dir.x * 13.0 - uTime * 4.0) * sin(dir.y * 11.0 + uTime * 3.0);
        float lat = 1.0 - ph / 3.14159;
        float cut = smoothstep(0.1, 0.2, lat) * (1.0 - smoothstep(0.82, 0.92, lat));
        float v = texture2D(uVoice, vec2(tb, clamp((lat - 0.16) / 0.7, 0.0, 1.0))).r * cut;
        float play = step(0.0, uPlay) * exp(-pow((fract(tb - uPlay + 0.5) - 0.5) / 0.02, 2.0));
        gVoice = v * (1.0 + play * 2.5) + play * cut * 0.15;
        float bump = 0.025 * sin(uTime * 1.1 + dir.y * 2.0) + uMic * 0.06 * n + uMicB.w * 0.04 * fine + v * (0.46 + play * 0.14);
        gBump = abs(bump);
        return uOrb + dir * uOrbR * (1.0 + uMic * 0.05 + bump);
      }

      // the shapes in story order: line, strings, path, gate, landscape, sphere, and the line again
      vec3 shape(int i) {
        if (i == 1) return aP2;
        if (i == 2) return pathPos();
        if (i == 3) return gatePos();
        if (i == 4) return terrPos();
        if (i == 5) return orbPos();
        return position;
      }

      // The journey between two shapes: each point leaves at its own moment, is thrown outward and swings
      // round in an arc before it settles, so a change of chapter reads as one sweeping gesture
      vec3 travel(vec3 a, vec3 b, float t) {
        float h1 = fract(aRand * 7.31), h2 = fract(aRand * 3.17 + 0.37);
        float tt = smoothstep(0.0, 1.0, clamp((t - h1 * 0.35) / 0.65, 0.0, 1.0));
        float k = sin(3.14159 * tt);
        vec3 p = mix(a, b, tt);
        vec3 dir = normalize(vec3(sin(aRand * 113.0), cos(aRand * 71.0) * 0.6, sin(aRand * 37.0 + 1.3)) + vec3(1e-4));
        p += dir * k * (0.35 + h2 * 0.9);
        vec3 c = (a + b) * 0.5;
        float ang = k * (h2 - 0.5) * 1.8, cs = cos(ang), sn = sin(ang);
        vec2 d = p.xz - c.xz;
        p.xz = c.xz + vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y);
        return p;
      }

      // in silence a slow wave passes across the strings, like a hand brushing them
      float idleWave(float s) { return pow(0.5 + 0.5 * sin(uTime * 0.6 - s * 0.7), 6.0) * 0.3 * (1.0 - uMix); }

      void main() {
        float m = uMorph;
        int seg = int(min(floor(m), 5.0));
        vec3 p = travel(shape(seg), shape(seg + 1), m - float(seg));
        float onLine = max(1.0 - clamp(m, 0.0, 1.0), clamp(m - 5.0, 0.0, 1.0));
        float onStrings = max(0.0, 1.0 - abs(m - 1.0));
        float onPath = max(0.0, 1.0 - abs(m - 2.0));
        float onGate = max(0.0, 1.0 - abs(m - 3.0));
        float onTerr = max(0.0, 1.0 - abs(m - 4.0));
        float onOrb = max(0.0, 1.0 - abs(m - 5.0));
        float transit = sin(3.14159 * fract(m)); // 0 when a shape is complete, 1 halfway between two
        float give = mix(1.0, gGive, onGate);
        float held = 1.0 - onGate; // the gate stands still under the hand; only its curtain answers

        // the line trembles before it ever makes a sound
        float env = exp(-p.x * p.x * 0.05);
        p.y += uTremble * onLine * env * (sin(p.x * 2.1 + uTime * 1.9 + aRand * 0.6) * 0.2 + sin(p.x * 6.3 - uTime * 3.1) * 0.07 + (aRand - 0.5) * 0.05);

        float glow = 0.0, look = 1.0, size = 1.0, soft = 0.0;
        bool mote = aStr < 0.0 && aStr > -50.0;
        if (aStr >= 0.0) {
          // standing waves: each string rings with its own band of the music, and glows where it moves most
          int si = int(aStr + 0.5);
          float e = max(max(uB[si], uP[si]), idleWave(aStr));
          float mode = 1.0 + floor(aStr * 3.0 / uStrings);
          float shp = sin(3.14159 * aU * mode);
          float wave = shp * (sin(uTime * (6.5 + aStr * 1.3)) + 0.25 * sin(uTime * 2.6 - aU * 14.0 + aStr));
          p += uStrN * onStrings * (0.002 + e * 0.07) * wave;
          glow = e * onStrings * (0.35 + 0.65 * abs(shp));
          look = 0.7;
          // one point in seven is a wide, faint halo, so each string reads as a thread of light
          if (fract(aRand * 7.0) > 0.86) { size = 3.4; look = 0.07 * (1.0 + glow * 3.0); soft = 1.0; }
        } else if (mote) {
          // a mote of light leaves its string and floats up, visible only while that string sounds
          float s = -aStr - 1.0;
          int si = int(s + 0.5);
          float e = max(max(uB[si], uP[si] * 0.8), idleWave(s) * 0.5);
          float life = fract(uTime * (0.035 + fract(aRand * 13.7) * 0.05) + aRand * 9.1);
          float h = fract(aRand * 5.3);
          p.y += onStrings * life * (0.6 + h * 1.4);
          p.x += onStrings * sin(uTime * 0.7 + aRand * 30.0) * 0.1 * life;
          p.z += onStrings * cos(uTime * 0.5 + aRand * 20.0) * 0.1 * life;
          look = sin(3.14159 * life) * (0.02 + e * 0.75) * step(0.45, h);
          size = 0.75;
          glow = e * onStrings;
        } else {
          look = 0.1; // distant dust
          size = 0.7;
        }

        // slow drift so nothing is ever perfectly still
        p += vec3(sin(uTime * 0.4 + aRand * 40.0), cos(uTime * 0.33 + aRand * 31.0), sin(uTime * 0.27 + aRand * 17.0)) * 0.012 * (0.3 + min(m, 2.0)) * give;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);

        // the visitor's hand: each point is carried by the soft field under its place on screen (pushed by the
        // cursor and by click ripples, settling back slowly); the last click also leaves a slow ring of light
        float energy = 0.0, ring = 0.0;
        vec4 c0 = projectionMatrix * mv;
        if (c0.w > 0.0) {
          vec2 ndc = c0.xy / c0.w;
          vec4 fld = texture2D(uField, clamp(ndc * 0.5 + 0.5, 0.0, 1.0));
          energy = fld.b * held;
          mv.xy += (fld.rg * 255.0 - 128.0) / 127.0 * 0.15 * (-mv.z) * uTanHalf * held;
          vec2 rp = (ndc - uRipple.xy) * vec2(uAspect, 1.0);
          ring = exp(-pow((length(rp) - (0.08 + uRipple.z * 0.5)) * 9.0, 2.0)) * (1.0 - smoothstep(0.3, 3.0, uRipple.z)) * held;
        }
        gl_Position = projectionMatrix * mv;

        // how large and bright each shape's points are
        float other = clamp(1.0 - onStrings - onPath - onGate - onTerr - onOrb, 0.0, 1.0);
        float lookP = smoothstep(0.0, 0.06, gA) * (1.0 - smoothstep(0.8, 1.0, gA)) * (hsh(aRand * 7.3) < 0.3 ? 0.07 : 0.22);
        float lookT = (0.2 + gH * 0.9) * (1.0 - 0.5 * gD);
        float lookO = 0.24 + gBump * 1.6 + gVoice * 2.2;
        float bright = other + onStrings * look + onPath * lookP + onGate * gLook + onTerr * lookT + onOrb * lookO;
        float sz = other + onStrings * size * 0.8 + onPath * 0.8 + onGate * gSize + onTerr * 0.85 + onOrb * 0.9;
        gl_PointSize = uSize * (0.55 + aRand * 0.9) * (1.0 + uLevel * 0.2 + glow * 0.15 + transit * 0.25) * sz * uPixel / -mv.z;

        // the opening line draws outward from the centre
        float reach = uReveal * uSpan * 1.55;
        float drawn = mix(1.0, 1.0 - smoothstep(reach - 0.25, reach + 0.25, abs(position.x)), onLine);
        vAlpha = (0.35 + aRand * 0.55) * uFade * drawn * (1.0 + glow * 0.6) * bright * (1.0 + transit * 0.35) * (1.0 + energy * 1.3 + ring * 1.2);
        vGold = step(0.972, aRand) + glow * 0.55 + (mote ? onStrings * 0.6 : 0.0) + energy * 0.45 + ring * 0.45 + onGate * gGold + onTerr * gPeak * 0.9 + onOrb * (uMic * 0.3 + gVoice * 1.8);
        vSoft = max(soft * onStrings, gSoft * onGate);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColA, uColB;
      varying float vAlpha; varying float vGold; varying float vSoft;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = 1.0 - smoothstep(0.0, 0.5, d);
        a = mix(a, a * a * a, vSoft); // halos fall off gently
        gl_FragColor = vec4(mix(uColA, uColB, clamp(vGold, 0.0, 1.0)), a * vAlpha);
      }
    `,
  });

  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  scene.add(points);

  // Sparks: a click releases a small ring of light that slowly opens, drifts up and fades
  const SPARKS = 960, PER = 96;
  const sPos = new Float32Array(SPARKS * 3), sVel = new Float32Array(SPARKS * 3);
  const sBirth = new Float32Array(SPARKS).fill(-100), sRnd = Float32Array.from({ length: SPARKS }, Math.random);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute('aVel', new THREE.BufferAttribute(sVel, 3));
  sGeo.setAttribute('aBirth', new THREE.BufferAttribute(sBirth, 1));
  sGeo.setAttribute('aRand', new THREE.BufferAttribute(sRnd, 1));
  const sparks = new THREE.Points(sGeo, new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uSize: uniforms.uSize, uPixel: uniforms.uPixel, uColA: uniforms.uColA, uColB: uniforms.uColB },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 aVel; attribute float aBirth; attribute float aRand;
      uniform float uTime, uSize, uPixel;
      varying float vA; varying float vG;
      void main() {
        float age = max(0.0, uTime - aBirth), k = clamp(age / (2.6 + aRand * 1.2), 0.0, 1.0);
        vec3 p = position + aVel * (1.0 - exp(-age * 1.3)) / 1.3 + vec3(0.0, 0.05, 0.0) * age * age;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (0.9 + aRand) * 1.6 * (1.0 - k * 0.4) * uPixel / -mv.z;
        vA = (1.0 - k) * (1.0 - k) * smoothstep(0.0, 0.18, age) * 0.85;
        vG = step(0.55, aRand);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColA, uColB;
      varying float vA; varying float vG;
      void main() {
        float a = 1.0 - smoothstep(0.0, 0.5, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(mix(uColA, uColB, vG), a * vA);
      }
    `,
  }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sNext = 0;
  const ray = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  function burst(x, y) {
    ray.set(x, y, 0.5).unproject(camera).sub(camera.position).normalize();
    const o = camera.position.clone().addScaledVector(ray, -camera.position.z / ray.z); // where the ray meets z = 0
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    for (let k = 0; k < PER; k++) {
      const i = sNext;
      sNext = (sNext + 1) % SPARKS;
      const onRing = k < PER * 0.7, ang = (k / PER) * Math.PI * 2 + Math.random() * 0.1;
      const speed = onRing ? 0.5 + Math.random() * 0.12 : 0.08 + Math.random() * 0.25;
      const d = onRing ? right.clone().multiplyScalar(Math.cos(ang)).addScaledVector(up, Math.sin(ang)) : new THREE.Vector3(gauss(), gauss(), gauss()).normalize();
      sPos.set([o.x, o.y, o.z], i * 3);
      sVel.set([d.x * speed, d.y * speed, d.z * speed], i * 3);
      sBirth[i] = uniforms.uTime.value;
    }
    ['position', 'aVel', 'aBirth'].forEach((n) => { sGeo.attributes[n].needsUpdate = true; });
  }

  // The strings can be strummed: moving across one (or clicking on it) sets it ringing (silently: Lost is playing)
  const strEnds = Array.from({ length: STRINGS }, (_, k) => {
    const f = k / (STRINGS - 1);
    return [new THREE.Vector3(...lerp3(near0, near1, f)), new THREE.Vector3(...lerp3(far0, far1, f))];
  });
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), lastPluck = new Float32Array(STRINGS);
  const onStringsNow = () => Math.max(0, 1 - Math.abs(state.morph - 1));
  function pluck(k) {
    const now = performance.now();
    if (now - lastPluck[k] < 90) return;
    lastPluck[k] = now;
    plucks[k] = Math.min(1.3, plucks[k] + 1);
  }
  function crosses(a, b, c, d) {
    const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
    if (Math.abs(den) < 1e-9) return false;
    const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
    const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }
  function strum(from, to) {
    strEnds.forEach(([n, f], k) => {
      if (crosses(from, to, pa.copy(n).project(camera), pb.copy(f).project(camera))) pluck(k);
    });
  }
  function stringAt(pt) {
    let best = -1, bestD = 0.035;
    strEnds.forEach(([n, f], k) => {
      pa.copy(n).project(camera);
      pb.copy(f).project(camera);
      const ax = (pb.x - pa.x) * camera.aspect, ay = pb.y - pa.y, px = (pt.x - pa.x) * camera.aspect, py = pt.y - pa.y;
      const t = Math.max(0, Math.min(1, (px * ax + py * ay) / (ax * ax + ay * ay)));
      const dd = Math.hypot(px - ax * t, py - ay * t);
      if (dd < bestD) { bestD = dd; best = k; }
    });
    return best;
  }

  // The visitor's hand moves the particles through a soft, springy field: a coarse grid over the screen whose cells
  // are pushed by the (gently smoothed) cursor and by click ripples, then drift back with a little give. Points
  // read the grid at their place on screen, so they part, trail and settle slowly instead of snapping.
  const ptr = { x: 9, y: 9, seen: false };
  const hand = { x: 9, y: 9, vx: 0, vy: 0, on: false }, handPrev = { x: 9, y: 9 };
  const ease = (dt, seconds) => 1 - Math.exp(-dt / seconds);
  const field = { w: 0, h: 0, d: null, v: null, tex: null, ripples: [], idle: false };
  function makeField() {
    const h = mobile ? 40 : 32, w = Math.max(8, Math.round(h * camera.aspect));
    const data = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) data.set([128, 128, 0, 255], i * 4);
    if (field.tex) field.tex.dispose();
    Object.assign(field, { w, h, d: new Float32Array(w * h * 2), v: new Float32Array(w * h * 2), idle: false });
    field.tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    field.tex.magFilter = field.tex.minFilter = THREE.LinearFilter;
    field.tex.needsUpdate = true;
    uniforms.uField.value = field.tex;
  }
  // Each cell is a soft damped spring (k = 4, c = 3): a quick pass of the cursor moves points about 30 px and
  // they settle back over roughly two seconds, with a slight give
  function stepField(dt) {
    field.ripples = field.ripples.filter((r) => (r.age += dt) < 3);
    if (field.idle && !hand.on && !field.ripples.length) return;
    const { w, h, d, v } = field, asp = camera.aspect, data = field.tex.image.data;
    const speed = Math.hypot(hand.vx, hand.vy), push = 0.2 + 0.9 * Math.min(1, speed / 1.2), R2 = 0.16 * 0.16;
    let busy = false;
    for (let j = 0; j < h; j++) {
      const y = ((j + 0.5) / h) * 2 - 1;
      for (let i = 0; i < w; i++) {
        const x = (((i + 0.5) / w) * 2 - 1) * asp, n = (j * w + i) * 2;
        let fx = 0, fy = 0;
        if (hand.on) {
          const dx = x - hand.x * asp, dy = y - hand.y, r2 = dx * dx + dy * dy;
          if (r2 < R2 * 9) {
            const f = Math.exp((-r2 / R2) * 2), r = Math.sqrt(r2) + 1e-4;
            fx += f * ((dx / r) * push + hand.vx * 1.6);
            fy += f * ((dy / r) * push + hand.vy * 1.6);
          }
        }
        for (const rp of field.ripples) {
          const dx = x - rp.x * asp, dy = y - rp.y, r = Math.sqrt(dx * dx + dy * dy) + 1e-4;
          const ring = Math.exp(-(((r - (0.08 + rp.age * 0.5)) / 0.07) ** 2)) * 1.6 * Math.exp(-rp.age);
          fx += (dx / r) * ring;
          fy += (dy / r) * ring;
        }
        v[n] += (fx - 4 * d[n] - 3 * v[n]) * dt;
        v[n + 1] += (fy - 4 * d[n + 1] - 3 * v[n + 1]) * dt;
        d[n] = Math.max(-0.14, Math.min(0.14, d[n] + v[n] * dt));
        d[n + 1] = Math.max(-0.14, Math.min(0.14, d[n + 1] + v[n + 1] * dt));
        const e = Math.min(1, Math.hypot(d[n], d[n + 1]) / 0.08), o = (j * w + i) * 4;
        data[o] = 128 + Math.round((d[n] / 0.15) * 127);
        data[o + 1] = 128 + Math.round((d[n + 1] / 0.15) * 127);
        data[o + 2] = Math.round(e * 255);
        if (e > 0.004 || Math.abs(v[n]) + Math.abs(v[n + 1]) > 1e-3) busy = true;
      }
    }
    field.idle = !busy;
    field.tex.needsUpdate = true;
  }

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    ptr.x = (e.clientX / innerWidth) * 2 - 1;
    ptr.y = 1 - (e.clientY / innerHeight) * 2;
    ptr.seen = true;
  });
  root.addEventListener('mouseleave', () => { ptr.seen = false; });
  // A click or tap (not on a link or button) sends a slow ripple through the field, a ring of light and a note;
  // while the gate stands, only its curtain answers
  addEventListener('click', (e) => {
    if (reduce || e.target.closest('a, button')) return;
    const at = { x: (e.clientX / innerWidth) * 2 - 1, y: 1 - (e.clientY / innerHeight) * 2 };
    if (1 - Math.abs(state.morph - 3) > 0.5) {
      gate.click(at);
      return;
    }
    uniforms.uRipple.value.set(at.x, at.y, 0);
    field.ripples.push({ x: at.x, y: at.y, age: 0 });
    if (field.ripples.length > 4) field.ripples.shift();
    field.idle = false;
    burst(at.x, at.y);
    const k = onStringsNow() > 0.6 ? stringAt(at) : -1;
    if (k >= 0) pluck(k);
    else clickNote(e.clientX / innerWidth);
  });
  // a finger drawn sideways across the curtain (chapter 4) brushes it like the hand; a finger that scrolls the page
  // passes by without a sound, and elsewhere touch only scrolls
  const touch = { x: 0, y: 0, on: false, x0: 0, y0: 0, scroll: false };
  const onTouch = (e) => {
    const t = e.touches[0];
    if (!t) return;
    if (e.type === 'touchstart') Object.assign(touch, { x0: t.clientX, y0: t.clientY, on: false, scroll: false });
    // once it has moved a little, a finger is a scroll (mostly up or down) or a stroke (mostly sideways)
    const dx = t.clientX - touch.x0, dy = t.clientY - touch.y0;
    if (!touch.on && !touch.scroll && dx * dx + dy * dy > 100) {
      if (Math.abs(dy) > Math.abs(dx)) touch.scroll = true;
      else touch.on = true;
    }
    touch.x = (t.clientX / innerWidth) * 2 - 1;
    touch.y = 1 - (t.clientY / innerHeight) * 2;
  };
  addEventListener('touchstart', onTouch, { passive: true });
  addEventListener('touchmove', onTouch, { passive: true });
  ['touchend', 'touchcancel'].forEach((n) => addEventListener(n, () => { touch.on = false; }, { passive: true }));

  // The curtain and the traveller (chapter 4). The curtain is strands of bits hanging from the arch: each strand is a
  // chain of points under gravity (Verlet integration, links of fixed length, pinned at the top), drawn as glyphs
  // that turn with it. Read down a strand, the bits spell "hello, world" in ASCII, the first program most people
  // write. The hand brushes the strands and each one rings like a glass chime, in key (low on the left). The traveller
  // climbs the steps with the scroll and walks into the curtain, coming apart into gold that runs up the strands to
  // the crown; at the end of the chapter the curtain parts for the viewer.
  const gate = createGate();
  function createGate() {
    const S = mobile ? 0.13 : 0.1; // from one bit to the next
    const zc = G0[2];
    // the traveller's way: the court, five steps and the threshold (depth, height in the gate's units)
    const STAIR = [[1.12, -0.54], [0.885, -0.45], [0.715, -0.36], [0.545, -0.27], [0.375, -0.18], [0.205, -0.09], [0.03, 0]];
    const sstep = (a, b, x) => {
      const t = clamp((x - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    };
    const strands = [];
    let NN = 0, NG = 0;
    for (let i = 0; i < NS; i++) {
      const u = strandU(i), ay = G0[1] + anchorV(u) * GS, n = Math.floor((anchorV(u) - 0.06) * GS / S);
      strands.push({ o: NN, n, ax: G0[0] + u * GS, ay, hit: -9, pan: (u / AR.a) * 0.7 });
      NN += n + 1;
      NG += n;
    }
    const px = new Float32Array(NN), py = new Float32Array(NN), pz = new Float32Array(NN);
    const ox = new Float32Array(NN), oy = new Float32Array(NN), oz = new Float32Array(NN), hot = new Float32Array(NN);
    const gPos = new Float32Array(NG * 3), gHot = new Float32Array(NG), gAng = new Float32Array(NG);
    const gBit = new Float32Array(NG), gK = new Float32Array(NG), gS = new Float32Array(NG), gRnd = new Float32Array(NG);
    const bits = [...'hello, world '].flatMap((c) => [...c.charCodeAt(0).toString(2).padStart(8, '0')].map(Number));
    let q = 0;
    strands.forEach((st, i) => {
      for (let j = 0; j <= st.n; j++) {
        const n = st.o + j;
        px[n] = ox[n] = st.ax;
        py[n] = oy[n] = st.ay - j * S;
        pz[n] = oz[n] = zc;
        if (!j) continue;
        gBit[q] = bits[(i * 40 + j - 1) % bits.length]; // each strand starts on a letter
        gK[q] = j / st.n;
        gS[q] = i / (NS - 1);
        gRnd[q++] = Math.random();
      }
    });

    // the two glyphs, drawn once into a small texture (again when the mono font has loaded)
    const atlas = document.createElement('canvas');
    atlas.width = 256;
    atlas.height = 128;
    const tex = new THREE.CanvasTexture(atlas);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    const drawAtlas = () => {
      const c = atlas.getContext('2d');
      c.clearRect(0, 0, 256, 128);
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '500 84px "JetBrains Mono", ui-monospace, Consolas, monospace';
      ['0', '1'].forEach((g, k) => {
        c.shadowColor = 'rgba(255, 255, 255, 0.85)';
        c.shadowBlur = 10;
        c.fillText(g, 64 + k * 128, 68);
        c.shadowBlur = 0;
        c.fillText(g, 64 + k * 128, 68);
      });
      tex.needsUpdate = true;
    };
    drawAtlas();
    if (document.fonts) document.fonts.load('500 84px "JetBrains Mono"').then(drawAtlas, () => {});

    const geo = new THREE.BufferGeometry();
    const dyn = (arr, size) => new THREE.BufferAttribute(arr, size).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', dyn(gPos, 3));
    geo.setAttribute('aHot', dyn(gHot, 1));
    geo.setAttribute('aAng', dyn(gAng, 1));
    geo.setAttribute('aBit', new THREE.BufferAttribute(gBit, 1));
    geo.setAttribute('aK', new THREE.BufferAttribute(gK, 1));
    geo.setAttribute('aS', new THREE.BufferAttribute(gS, 1));
    geo.setAttribute('aRand', new THREE.BufferAttribute(gRnd, 1));
    const gu = {
      uTime: uniforms.uTime, uPixel: uniforms.uPixel, uAtlas: { value: tex }, uGlyph: { value: mobile ? 0.2 : 0.16 },
      uShow: { value: 0 }, uReveal: { value: 0 }, uPass: { value: 0 }, uMid: { value: G0[0] },
      uUp: { value: 0 }, uUpX: { value: G0[0] }, uUpY: { value: new THREE.Vector2() },
      uCool: { value: new THREE.Color('#bcd2ff') }, uGold: uniforms.uColB,
    };
    const glyphs = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: gu,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aHot, aAng, aBit, aK, aS, aRand;
        uniform float uTime, uPixel, uGlyph, uShow, uReveal, uPass, uMid, uUp, uUpX;
        uniform vec2 uUpY;
        varying float vA, vHot, vBit, vAng;
        float hsh(float n) { return fract(sin(n) * 43758.5453123); }
        void main() {
          vec3 p = position;
          // passing through: the parted strands drift past the viewer
          p.z += uPass * uPass * (2.0 + aRand * 2.5);
          p.x += (p.x - uMid) * uPass * 0.15;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uGlyph * uPixel / -mv.z;
          // the traveller's gold runs up the curtain from where they entered: a bright front rising toward the arch,
          // spreading sideways as it goes, and leaving the bits it passed warm for a while
          float spread = abs(position.x - uUpX) / (0.15 + uUp * 0.9);
          float front = mix(uUpY.x, uUpY.y, clamp(uUp * 1.3 - spread * 0.3, 0.0, 1.0));
          float live = smoothstep(0.0, 0.08, uUp) * (1.0 - smoothstep(0.88, 1.0, uUp)) * (1.0 - smoothstep(0.7, 1.0, spread));
          float up = live * (exp(-pow((position.y - front) / 0.1, 2.0)) + 0.35 * step(position.y, front) * step(uUpY.x - 0.4, position.y));
          float hot = max(aHot, up);
          // the bits print in from the top, strand by strand, flickering before they settle; touched bits scramble
          float at = aK * 0.7 + hsh(aS * 17.0 + 1.0) * 0.3, r = uReveal * 1.04;
          float shown = smoothstep(at - 0.02, at + 0.02, r);
          float scramble = max(hot, shown * (1.0 - smoothstep(0.0, 0.1, r - at)));
          vBit = abs(aBit - step(0.55, hsh(floor(uTime * 14.0) + aRand * 91.0)) * step(0.2, scramble));
          // a slow pulse of data runs down each strand
          float run = pow(0.5 + 0.5 * sin(aK * 13.0 - uTime * 1.2 + aS * 29.0), 8.0);
          vA = uShow * shown * (0.3 + aRand * 0.18 + run * 0.35 + hot * 0.8);
          vHot = hot;
          vAng = aAng;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uAtlas;
        uniform vec3 uCool, uGold;
        varying float vA, vHot, vBit, vAng;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float cs = cos(vAng), sn = sin(vAng);
          c = vec2(cs * c.x + sn * c.y, -sn * c.x + cs * c.y) + 0.5;
          if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0) discard;
          float t = texture2D(uAtlas, vec2((c.x + vBit) * 0.5, 1.0 - c.y)).a;
          gl_FragColor = vec4(mix(uCool, uGold, clamp(vHot * 1.2, 0.0, 1.0)), t * vA);
        }
      `,
    }));
    glyphs.frustumCulled = false;
    glyphs.renderOrder = 2;
    glyphs.visible = false;
    scene.add(glyphs);

    // The traveller: a figure in a hooded robe of gold, seen from behind, drawn as points on the side of the robe that
    // faces us. They are listed far to near, so with ordinary blending the nearer paint over the farther and the robe
    // reads as cloth, not a glow. Folds run down it; embroidery edges the hem and the yoke and runs down the hood, and a
    // panel of termeh-like lattice (the woven silk Yazd is known for) runs down the back. Dust that settles on the
    // steps behind them, and a few motes that rise off the robe, belong to it too.
    const FH = 0.74 * GS;
    // human proportions: shoulders at about 0.8 of the height and a quarter of it wide, the robe hanging from them and
    // flaring a little to the hem, a slim neck, and a hood that comes to a soft point
    const PROF = [ // height, half-width, half-depth, how far the cross-section sits back (in heights)
      [0, 0.19, 0.14, 0], [0.1, 0.175, 0.125, 0], [0.3, 0.155, 0.105, 0], [0.5, 0.145, 0.095, 0], [0.62, 0.15, 0.09, 0],
      [0.72, 0.152, 0.088, 0], [0.79, 0.15, 0.085, 0.003], [0.82, 0.115, 0.08, 0.006], [0.845, 0.07, 0.07, 0.01],
      [0.88, 0.078, 0.078, 0.016], [0.93, 0.072, 0.074, 0.024], [0.97, 0.048, 0.055, 0.035], [0.99, 0.02, 0.03, 0.045],
      [1, 0.003, 0.01, 0.05],
    ];
    // the profile, smoothed (Catmull-Rom through the points) and tabulated by height
    const prof = (() => {
      const tab = [];
      for (let k = 0; k < PROF.length - 1; k++) {
        const p0 = PROF[Math.max(0, k - 1)], p1 = PROF[k], p2 = PROF[k + 1], p3 = PROF[Math.min(PROF.length - 1, k + 2)];
        for (let s = 0; s < 0.999; s += 0.1) {
          const s2 = s * s, s3 = s2 * s;
          tab.push(p1.map((_, c) => 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * s + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * s2 + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * s3)));
        }
      }
      tab.push(PROF[PROF.length - 1]);
      return (t) => {
        let k = 0;
        while (k < tab.length - 2 && tab[k + 1][0] < t) k++;
        const a = tab[k], b = tab[k + 1], f = clamp((t - a[0]) / (b[0] - a[0] || 1), 0, 1);
        return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
      };
    })();
    // folds down the robe, and a deeper crease each side where the arms hang inside it
    const crease = (th) => Math.exp(-(((th - 0.32) / 0.07) ** 2)) + Math.exp(-(((th - Math.PI + 0.32) / 0.07) ** 2));
    const fold = (th, t) => 0.55 * Math.sin(7 * th + 2.1 * t + 1.3) + 0.3 * Math.sin(13 * th - 1.7 * t + 0.4) + 0.15 * Math.sin(3 * th + 0.8) -
      0.9 * crease(th) * sstep(0.3, 0.42, t) * (1 - sstep(0.66, 0.72, t));
    // a point on the robe (th runs round it, pi/2 at the middle of the back; t up it), with its fold value
    const surf = (th, t) => {
      const [rx, rz, back] = prof(t), f = fold(th, t);
      const k = 1 + (0.07 * (1 - sstep(0.2, 0.72, t)) + 0.016) * (t > 0.82 ? 0.4 : 1) * f;
      return [rx * k * Math.cos(th) * FH, t * FH, (back + rz * k * Math.sin(th)) * FH, f];
    };
    const normal = (th, t) => {
      const a = surf(th - 0.02, t), b = surf(th + 0.02, t), c = surf(th, t - 0.01), d = surf(th, t + 0.01);
      const tu = [b[0] - a[0], 0, b[2] - a[2]], tv = [d[0] - c[0], d[1] - c[1], d[2] - c[2]];
      const n = [tv[1] * tu[2] - tv[2] * tu[1], tv[2] * tu[0] - tv[0] * tu[2], tv[0] * tu[1] - tv[1] * tu[0]];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      return [n[0] / l, n[1] / l, n[2] / l];
    };
    const tri = (x) => Math.abs((((x % 2) + 2) % 2) - 1);
    const hemT = (th) => 0.012 * (1 + Math.sin(5 * th + 1));
    const pts = []; // x, y, z, normal, height, crest, kind (0 robe, 1 embroidery, 2 dust, 3 mote), random, extra
    const add = (th, t, kind) => {
      const [x, y, z, f] = surf(th, t);
      pts.push([x, y, z, ...normal(th, t), t, 0.5 + 0.5 * f, kind, Math.random(), Math.random()]);
    };
    const visible = () => -0.35 + Math.random() * (Math.PI + 0.7);
    const M = (n) => Math.round(n * (mobile ? 0.34 : 1));
    for (let k = 0, n = M(7800); k < n;) {
      const t = Math.random(), th = visible(), [rx, rz] = prof(t);
      if (Math.random() > (rx + rz) / 0.33 || t < hemT(th)) continue;
      add(th, t, 0);
      k++;
    }
    // the hem: two lines with a zigzag between them
    for (let k = 0; k < M(800); k++) {
      const th = visible(), b = hemT(th) + 0.012, r = Math.random();
      add(th, r < 0.3 ? b : r < 0.6 ? b + 0.04 : b + 0.04 * tri(th * 9), 1);
    }
    // the yoke across the shoulders, dipping a little at the middle of the back, and the seam down the hood
    for (let k = 0; k < M(320); k++) {
      const th = visible();
      add(th, 0.775 - 0.02 * Math.sin(th) - (k % 2) * 0.012, 1);
    }
    for (let k = 0; k < M(130); k++) add(Math.PI / 2 + (Math.random() - 0.5) * 0.04, 0.85 + Math.random() * 0.14, 1);
    // the termeh panel down the back: a border each side, a lattice of diamonds two across, a dot in each diamond
    for (let k = 0, n = M(1100); k < n;) {
      const a = Math.random() * 2 - 1, b = Math.random(), th = Math.PI / 2 + a * 0.26, t = 0.1 + b * 0.62;
      const d1 = tri(2 * a + 12 * b), d2 = tri(2 * a - 12 * b);
      if (Math.abs(a) > 0.94 || d1 < 0.08 || d2 < 0.08 || (d1 > 0.86 && d2 > 0.86)) {
        add(th, t, 1);
        k++;
      }
    }
    // dust left on the steps: each grain falls at a moment of the climb, on the step the traveller stood on then
    for (let k = 0; k < M(700); k++) {
      const w = 0.03 + Math.random() * 0.95, s = STAIR[Math.min(6, Math.round(w * 6))];
      const p = toWorld((Math.random() - 0.5) * 0.4, s[1] + 0.004, s[0] + (Math.random() - 0.5) * 0.12);
      pts.push([p[0], p[1], p[2], 0, 1, 0, 0, 0, 2, Math.random(), w]);
    }
    // motes rising off the robe
    for (let k = 0; k < M(240); k++) {
      const th = Math.random() * Math.PI * 2, r = (0.14 + Math.random() * 0.18) * FH;
      pts.push([Math.cos(th) * r, Math.random() * 0.7 * FH, Math.sin(th) * r * 0.6, 0, 1, 0, 0, 0, 3, Math.random(), 0]);
    }
    pts.sort((p, q) => (p[8] >= 2) - (q[8] >= 2) ? (p[8] >= 2 ? -1 : 1) : p[2] - q[2]);
    const fGeo = new THREE.BufferGeometry();
    const col = (k, size) => new THREE.BufferAttribute(Float32Array.from(pts.flatMap((p) => p.slice(k, k + size))), size);
    fGeo.setAttribute('position', col(0, 3));
    fGeo.setAttribute('aNor', col(3, 3));
    fGeo.setAttribute('aInfo', col(6, 4));
    fGeo.setAttribute('aDrop', col(10, 1));
    const chipW = new THREE.Vector3(...toWorld(...CHIP));
    const fu = {
      uTime: uniforms.uTime, uPixel: uniforms.uPixel, uFS: { value: mobile ? 0.028 : 0.02 }, uFH: { value: FH },
      uShow: { value: 0 }, uSway: { value: 0 }, uLean: { value: 0 }, uWalk: { value: 0 }, uWalkV: { value: 0 },
      uEnter: { value: 0 }, uExit: { value: 0 }, uCurtZ: { value: zc }, uPos: { value: new THREE.Vector3() }, uChip: { value: chipW },
      uGoldA: { value: new THREE.Color('#47300f') }, uGoldB: { value: new THREE.Color('#e2aa40') }, uGoldC: { value: new THREE.Color('#fff1c8') },
    };
    const traveller = new THREE.Points(fGeo, new THREE.ShaderMaterial({
      uniforms: fu,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      vertexShader: /* glsl */ `
        attribute vec3 aNor; attribute vec4 aInfo; attribute float aDrop;
        uniform float uTime, uPixel, uFS, uFH, uShow, uSway, uLean, uWalk, uWalkV, uEnter, uExit, uCurtZ;
        uniform vec3 uPos, uChip, uGoldA, uGoldB, uGoldC;
        varying vec3 vCol; varying float vA;
        float hsh(float n) { return fract(sin(n) * 43758.5453123); }
        void main() {
          float t = aInfo.x, crest = aInfo.y, kind = aInfo.z, rnd = aInfo.w;
          vec3 p, col = uGoldC;
          float a = 1.0, size = 1.0;
          if (kind < 1.5) {
            // the robe: the hem swings with each step and the body leans into the climb
            vec3 l = position;
            float low = 1.0 - t;
            l.x += uSway * low * low * low * 0.06 * uFH;
            l.z -= uLean * t * t * 0.07 * uFH;
            p = uPos + l;
            // a soft light from our side and above; the doorway's light catches the edges; folds catch the light
            vec3 n = normalize(aNor);
            float diff = max(0.0, dot(n, normalize(vec3(-0.4, 0.55, 0.75))));
            float rim = pow(1.0 - abs(n.z), 2.0);
            float shade = (0.22 + 0.62 * diff + 0.45 * rim) * (0.7 + 0.5 * crest) * (0.78 + 0.22 * t);
            col = mix(uGoldA, uGoldB, clamp(shade, 0.0, 1.0)) + uGoldC * (rim * 0.3 + (kind > 0.5 ? 0.32 : 0.0) * shade);
            // now and then a thread glints
            col += uGoldC * pow(max(0.0, sin(uTime * (0.6 + rnd * 0.8) + rnd * 40.0)), 80.0) * 0.9;
            // it gathers out of light as the gate forms, the hem first
            float g = clamp(uShow * 1.7 - t * 0.35 - rnd * 0.35, 0.0, 1.0);
            g = g * g * (3.0 - 2.0 * g);
            vec3 from = uPos + vec3((hsh(rnd * 7.1) - 0.5) * 1.6, hsh(rnd * 3.3) * 0.9 + t * 0.5, hsh(rnd * 5.7) - 0.5) * uFH;
            p = mix(from, p, g);
            a = g;
            // entering: from the hem up, the robe comes apart into gold that rises into the curtain, then to the crown
            float lp = clamp((uEnter - (0.04 + 0.42 * t + 0.18 * aDrop)) / 0.3, 0.0, 1.0);
            if (lp > 0.0) {
              float s = lp * lp * (3.0 - 2.0 * lp);
              vec3 mid = vec3(mix(p.x, uChip.x, 0.2) + (hsh(rnd * 11.0) - 0.5) * 0.6 * uFH, p.y + (0.5 + hsh(rnd * 13.0) * 1.2) * uFH, uCurtZ);
              p = mix(mix(p, mid, s), mix(mid, uChip, s), s);
              float sw = sin(lp * 3.14159) * 0.07 * uFH;
              p += vec3(cos(lp * 9.0 + rnd * 6.28), 0.0, sin(lp * 9.0 + rnd * 6.28)) * sw;
              col = mix(col, uGoldC, s);
              a *= 1.0 - smoothstep(0.7, 1.0, lp);
              size *= 1.0 - 0.4 * s;
            }
          } else if (kind < 2.5) {
            // dust settling on the steps behind the traveller, glinting
            float since = uWalk - aDrop, fall = clamp(since / 0.04, 0.0, 1.0);
            p = position + vec3(0.0, (1.0 - fall * fall) * 0.3 * uFH, 0.0);
            a = step(0.0, since) * (0.3 + 0.7 * pow(max(0.0, sin(uTime * (0.5 + rnd) + rnd * 30.0)), 6.0)) * 0.75 * (1.0 - uExit);
            size = 0.55;
          } else {
            // motes rising off the robe, more while the traveller walks
            float life = fract(uTime * (0.05 + rnd * 0.06) + rnd * 7.0);
            p = uPos + position + vec3(sin(uTime * 0.7 + rnd * 20.0) * 0.05, life * 0.6, 0.0) * uFH;
            a = sin(3.14159 * life) * (0.25 + min(uWalkV, 1.0) * 0.75) * uShow * (1.0 - smoothstep(0.0, 0.3, uEnter));
            size = 0.55;
          }
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uFS * size * (0.85 + rnd * 0.5) * uPixel / -mv.z;
          vCol = col;
          vA = a;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vCol; varying float vA;
        void main() {
          float a = (1.0 - smoothstep(0.3, 0.5, length(gl_PointCoord - 0.5))) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vCol, a);
        }
      `,
    }));
    traveller.frustumCulled = false;
    traveller.visible = false;
    scene.add(traveller);

    const P = new THREE.Vector3(), dirG = new THREE.Vector3();
    const onPlane = (nx, ny) => {
      dirG.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
      return P.copy(camera.position).addScaledVector(dirG, (zc - camera.position.z) / dirG.z);
    };
    const hp = { x: 0, y: 0, lx: 0, ly: 0, vx: 0, vy: 0, on: false }; // the hand where it meets the curtain
    const fig = { x: 0, y: 0, z: 0, touch: 0, near: 0, step: 0, lastW: 0, v: 0, sound: 0 };
    const H = 1 / 120;
    let acc = 0;

    // the chimes fade with the curtain: full while it stands, gone once it is out of sight
    let bellLevel = -1;
    function fadeBells(g) {
      if (!audio.bellFade) return;
      const v = Math.round(sstep(0, 0.6, g) * 50) / 50;
      if (v === bellLevel) return;
      bellLevel = v;
      audio.bellFade.gain.setTargetAtTime(v, audio.ctx.currentTime, 0.12);
    }

    // a strand rings (unless it just did, the curtain has faded or the page is leaping past); a hard knock sometimes
    // sets a neighbour going, as wind chimes do
    function ring(i, v, cool) {
      const st = strands[i], t = uniforms.uTime.value;
      if (t - st.hit < cool || bellLevel === 0 || state.leap) return;
      st.hit = t;
      chime(i / (NS - 1), v, st.pan);
      if (v > 0.45 && Math.random() < 0.6) {
        const k = i + (Math.random() < 0.5 ? -1 : 1);
        if (k >= 0 && k < NS) setTimeout(() => ring(k, v * 0.35, 0.12), 50 + Math.random() * 90);
      }
    }

    function step(h, exit) {
      const damp = Math.exp(-h * 1.1), gy = -9 * h * h, R2 = 0.04, spd = Math.hypot(hp.vx, hp.vy);
      for (let i = 0; i < NS; i++) {
        const st = strands[i];
        let moved = 0;
        for (let j = 1; j <= st.n; j++) {
          const n = st.o + j;
          const vx = (px[n] - ox[n]) * damp, vy = (py[n] - oy[n]) * damp, vz = (pz[n] - oz[n]) * damp;
          ox[n] = px[n];
          oy[n] = py[n];
          oz[n] = pz[n];
          px[n] += vx;
          py[n] += vy + gy;
          pz[n] += vz;
          // the hand carries the bits it passes through along with it, and gently parts them where it rests
          if (hp.on) {
            const dx = px[n] - hp.x, dy = py[n] - hp.y, r2 = dx * dx + dy * dy;
            if (r2 < R2 * 4) {
              const f = Math.exp((-r2 / R2) * 2), r = Math.sqrt(r2) + 1e-4;
              px[n] += (hp.vx * h - vx) * f * 0.14 + (dx / r) * f * 0.3 * h;
              py[n] += (hp.vy * h - vy) * f * 0.1;
              pz[n] -= spd * f * 0.015 * h;
              if (spd > 0.3) hot[n] = Math.max(hot[n], f);
            }
          }
          // as the traveller nears, the strands in front lean toward them and warm a little
          if (fig.near > 0) {
            const dx = px[n] - fig.x, yr = (py[n] - fig.y) / FH;
            if (Math.abs(dx) < 0.3 * FH && yr > -0.1 && yr < 1.2) {
              const f = fig.near * (1 - Math.abs(dx) / (0.3 * FH));
              pz[n] += 0.0012 * f;
              hot[n] = Math.max(hot[n], 0.25 * f);
            }
          }
          // the traveller's body pushes the strands aside as it passes into them
          if (fig.touch > 0) {
            const yr = (py[n] - fig.y) / FH, dx = px[n] - fig.x;
            const half = FH * (yr < 0.8 ? 0.21 - 0.06 * yr : 0.16 - 0.6 * (yr - 0.8));
            if (yr > -0.05 && yr < 1 && Math.abs(dx) < half) {
              const push = (fig.x + (dx < 0 ? -half : half) - px[n]) * 0.2 * fig.touch;
              px[n] += push;
              pz[n] -= 0.003 * fig.touch;
              hot[n] = Math.max(hot[n], 0.8 * fig.touch);
              moved = Math.max(moved, Math.abs(push));
            }
          }
          // and at the end the curtain parts down the middle
          if (exit > 0) {
            const W = Math.min(1, exit * 1.6) * AR.a * GS * 0.95, dx = px[n] - G0[0];
            if (Math.abs(dx) < W) px[n] += (G0[0] + (dx < 0 ? -W : W) - px[n]) * 0.035;
          }
        }
        if (moved > 0.004) ring(i, 0.25, 0.6);
        // as the parting reaches a strand it rings once; held aside (the middle ones strain against their pins, so
        // the parting keeps pushing them) it stays quiet, until the curtain has closed back past it
        const reach = Math.min(1, exit * 1.6) * AR.a * GS * 0.95, off = Math.abs(st.ax - G0[0]);
        if (exit < 0.01 || reach < off - 0.02) st.parted = false;
        else if (!st.parted && reach > off) {
          st.parted = true;
          ring(i, 0.25, 0.6);
        }
      }
      // links keep their length: a few passes from the top down (the top point is pinned)
      for (let it = 0; it < 3; it++) {
        for (let i = 0; i < NS; i++) {
          const { o, n: cnt } = strands[i];
          for (let j = 1; j <= cnt; j++) {
            const a = o + j - 1, b = o + j;
            const dx = px[b] - px[a], dy = py[b] - py[a], dz = pz[b] - pz[a];
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-9, k = (d - S) / d;
            const ka = j === 1 ? 0 : k * 0.5, kb = j === 1 ? k : k * 0.5;
            px[a] += dx * ka;
            py[a] += dy * ka;
            pz[a] += dz * ka;
            px[b] -= dx * kb;
            py[b] -= dy * kb;
            pz[b] -= dz * kb;
          }
        }
      }
    }

    // a strand rings when the hand sweeps across it, louder the faster the hand
    function brush() {
      const spd = Math.hypot(hp.vx, hp.vy);
      if (spd < 0.25) return;
      strands.forEach((st, i) => {
        if (hp.y > st.ay + 0.05 || hp.y < st.ay - st.n * S - 0.05) return;
        const j = clamp(Math.round((st.ay - hp.y) / S), 1, st.n), sx = px[st.o + j];
        if ((hp.lx - sx) * (hp.x - sx) >= 0) return;
        ring(i, Math.min(1, 0.15 + spd / 8), 0.12);
        for (let k = Math.max(1, j - 2); k <= Math.min(st.n, j + 2); k++) hot[st.o + k] = 1;
      });
    }

    // up the steps with a little lift and bob in each
    function climb(w) {
      const c = clamp(w, 0, 1) * 6, k = Math.min(5, Math.floor(c)), f = c - k;
      const [d0, v0] = STAIR[k], [d1, v1] = STAIR[k + 1];
      return { v: v0 + (v1 - v0) * sstep(0.1, 0.6, f), d: d0 + (d1 - d0) * sstep(0, 1, f), bob: Math.sin(Math.PI * f) * 0.012, sway: Math.sin(Math.PI * 2 * f), lean: Math.sin(Math.PI * f) };
    }

    function update(dt) {
      const m = state.morph, g = Math.max(0, 1 - Math.abs(m - 3)), exit = clamp(m - 3, 0, 1);
      fadeBells(g);
      if (g <= 0.002) {
        // out of sight: the curtain hangs still again for next time
        if (glyphs.visible) strands.forEach((st) => {
          for (let j = 0; j <= st.n; j++) {
            const n = st.o + j;
            px[n] = ox[n] = st.ax;
            py[n] = oy[n] = st.ay - j * S;
            pz[n] = oz[n] = zc;
            hot[n] = 0;
          }
        });
        glyphs.visible = traveller.visible = hp.on = false;
        uniforms.uFigA.value = uniforms.uSurge.value = uniforms.uDoor.value = 0;
        return;
      }
      glyphs.visible = true;

      // where the hand, or a finger, meets the curtain
      const src = hand.on ? hand : touch.on ? touch : null;
      if (src && g > 0.6) {
        onPlane(src.x, src.y);
        if (!hp.on) Object.assign(hp, { x: P.x, y: P.y, vx: 0, vy: 0 });
        const k = ease(dt, 0.06), st = Math.max(dt, 1e-3);
        hp.vx += ((P.x - hp.x) / st - hp.vx) * k;
        hp.vy += ((P.y - hp.y) / st - hp.vy) * k;
        Object.assign(hp, { lx: hp.x, ly: hp.y, x: P.x, y: P.y, on: true });
      } else hp.on = false;

      // the traveller, placed by the scroll: up the steps, then (entering) on into the curtain
      const w = state.walk, e = state.enter, c = climb(w), into = sstep(0, 0.32, e);
      Object.assign(fig, { x: G0[0], y: G0[1] + (c.v + c.bob * (1 - into)) * GS, z: G0[2] + (c.d - 0.25 * into) * GS });
      fig.v += (Math.abs(w - fig.lastW) / Math.max(dt, 1e-3) * 6 - fig.v) * ease(dt, 0.25);
      fig.lastW = w;
      const show = sstep(0.55, 1, g) * (1 - sstep(0.1, 0.4, exit));
      fig.near = sstep(0.8, 1, w) * (1 - sstep(0.15, 0.35, e));
      fig.touch = show > 0.05 && e < 0.5 ? 1 - sstep(0.03 * GS, 0.2 * GS, Math.abs(fig.z - zc)) : 0;
      traveller.visible = show > 0.002;
      traveller.renderOrder = fig.z > zc ? 3 : 1; // in front of the curtain, then within it
      fu.uPos.value.set(fig.x, fig.y, fig.z);
      fu.uShow.value = show * (1 - state.dim);
      fu.uSway.value = c.sway * Math.min(1, w * 20) * (1 - into);
      fu.uLean.value = c.lean * (1 - into);
      fu.uWalk.value = w;
      fu.uWalkV.value = fig.v;
      fu.uEnter.value = e;
      fu.uExit.value = exit;
      uniforms.uFig.value.set(fig.x, fig.y, fig.z);
      uniforms.uFigA.value = show * (1 - into);

      // each step lands with a ring of light on the step and a soft note, rising as they climb
      const landed = Math.min(6, Math.floor(w * 6 + 0.45));
      if (landed > fig.step && landed >= 1 && g > 0.9 && !state.leap) {
        const s = STAIR[landed], p = toWorld(landed % 2 ? 0.07 : -0.07, s[1], s[0]);
        uniforms.uStep.value.set(p[0], p[1], p[2], 0);
        stepNote(landed);
      }
      fig.step = landed;
      uniforms.uStep.value.w += dt;

      // entering: the gold climbs the curtain, light runs up the arch to the chip and out through the whole gate,
      // and the doorway brightens as they come near and go in
      gu.uUp.value = clamp((e - 0.18) / 0.42, 0, 1);
      gu.uUpX.value = fig.x;
      gu.uUpY.value.set(G0[1] + 0.35 * FH, G0[1] + archV(0) * GS);
      uniforms.uSurge.value = clamp((e - 0.48) / 0.52, 0, 1);
      uniforms.uDoor.value = sstep(0.55, 1, w) * 0.7 + Math.sin(Math.PI * clamp(e / 0.7, 0, 1)) * 0.6;
      const stage = e > 0.72 ? 2 : e > 0.22 ? 1 : 0;
      if (stage > fig.sound && !state.leap) enterSound(stage); // (a leap past the gate passes in silence)
      fig.sound = e < 0.15 ? 0 : Math.max(fig.sound, stage);

      acc = Math.min(acc + dt, H * 4);
      for (; acc >= H; acc -= H) step(H, exit);
      if (hp.on) brush();

      const decay = Math.exp(-dt / 0.8);
      let q = 0;
      strands.forEach((st) => {
        for (let j = 1; j <= st.n; j++, q++) {
          const n = st.o + j;
          hot[n] *= decay;
          gPos[q * 3] = px[n];
          gPos[q * 3 + 1] = py[n];
          gPos[q * 3 + 2] = pz[n];
          gHot[q] = hot[n];
          gAng[q] = Math.atan2(px[n - 1] - px[n], py[n - 1] - py[n]);
        }
      });
      ['position', 'aHot', 'aAng'].forEach((a) => { geo.attributes[a].needsUpdate = true; });
      gu.uReveal.value = m < 4 ? sstep(0.3, 1, g) : 1;
      gu.uShow.value = (m < 4 ? sstep(0.2, 0.7, g) : 1) * (1 - sstep(0.1, 0.65, exit)) * (1 - state.dim);
      gu.uPass.value = exit;
    }

    // a click in the doorway: the bits nearby are thrown outward and scramble, and the nearest strands ring in turn
    function click(at) {
      if (1 - Math.abs(state.morph - 3) < 0.6) return false;
      onPlane(at.x, at.y);
      const u = (P.x - G0[0]) / GS, v = (P.y - G0[1]) / GS;
      if (Math.abs(u) > AR.a + 0.05 || v < -0.05 || v > archV(Math.min(Math.abs(u), AR.a)) + 0.05) return false;
      for (let n = 0; n < NN; n++) {
        const dx = px[n] - P.x, dy = py[n] - P.y, r2 = dx * dx + dy * dy;
        if (r2 > 0.16) continue;
        const f = Math.exp(-r2 / 0.03), r = Math.sqrt(r2) + 1e-4;
        ox[n] -= (dx / r) * f * 0.006;
        oz[n] += f * 0.004;
        hot[n] = Math.max(hot[n], f);
      }
      strands.map((st, i) => [Math.abs(st.ax - P.x), i]).sort((a, b) => a[0] - b[0]).slice(0, 3)
        .forEach(([, i], k) => setTimeout(() => ring(i, 0.75 - k * 0.2, 0.05), k * 70));
      return true;
    }

    return { update, click };
  }

  let focusD = 7;
  function resize() {
    const w = innerWidth, h = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    uniforms.uAspect.value = camera.aspect;
    camZ = w < h ? 12 : 9;
    camera.position.z = camZ;
    // chapter 4's close view: the portal and its steps fill the height (on phones, the frame fills the width)
    const tanH = uniforms.uTanHalf.value;
    focusD = Math.max((3.78 * GS * 1.24) / 2 / tanH, ((mobile ? 2.9 : 5) * GS * 1.08) / 2 / (tanH * camera.aspect));
    camera.updateProjectionMatrix();
    uniforms.uPixel.value = (h * dpr / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    makeField();
    dirty = true;
  }
  resize();
  addEventListener('resize', resize);

  const pointer = { x: 0, y: 0 };
  addEventListener('pointermove', (e) => {
    pointer.x = e.clientX / innerWidth - 0.5;
    pointer.y = e.clientY / innerHeight - 0.5;
  });

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    tick(now);
  }
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    readAudio(dt);
    listen(dt);
    if (reduce && !dirty && level < 0.001) return; // nothing changed: skip the draw
    dirty = false;
    if (!reduce) uniforms.uTime.value += dt;
    uniforms.uMorph.value = state.morph;
    uniforms.uTremble.value = state.tremble + state.pulse;
    uniforms.uReveal.value = state.reveal;
    uniforms.uFade.value = state.fade * (1 - state.dim);
    uniforms.uLevel.value = level;
    uniforms.uMix.value = lost.mix;
    uniforms.uPeaks.value = state.peaks;
    uniforms.uMic.value = Math.max(mic.level, voice.sing);
    uniforms.uSpin.value = voice.spin;
    uniforms.uPlay.value = voice.play;
    if (voice.dirty) {
      voiceTex.needsUpdate = true;
      voice.dirty = false;
    }
    uniforms.uMicB.value.set(...mic.bands);
    // chapter 4: while the traveller climbs, the camera comes in close on the gate; as the curtain parts it follows
    // into the doorway, then (focus back to 0) returns to its place over the landscape
    const F = state.focus, dive = F * clamp(state.morph - 3, 0, 1), gy = G0[1] + 1.35 * GS;
    if (!reduce) {
      // between chapters the camera swoops in with the particles; while "Lost" plays it leans in a little
      const t = uniforms.uTime.value, transit = Math.sin(Math.PI * (state.morph % 1));
      const sway = state.leap ? 1 : ease(dt, 0.9), swoop = state.leap ? 1 : ease(dt, 0.35), loose = (1 - F * 0.6) * Math.min(1, Math.abs(state.morph - 3));
      camera.position.x += ((pointer.x * 0.5 + Math.sin(t * 0.11) * 0.1 * lost.mix) * loose + G0[0] * F - camera.position.x) * sway;
      camera.position.y += ((-pointer.y * 0.3 + transit * 0.25) * loose + (gy - dive * 0.5 * GS) * F - camera.position.y) * sway;
      camera.position.z += (camZ * (1 - F) + (G0[2] + focusD - dive * (focusD - 1.6)) * F - lost.mix * 0.2 - transit * 1.1 * (1 - F * 0.5) - camera.position.z) * swoop;
    }
    camera.lookAt((mobile ? 0 : state.look) * (1 - F) + G0[0] * F, (gy - dive * 0.6 * GS) * F, (G0[2] - dive * 3) * F);
    camera.updateMatrixWorld();

    // hand and strings
    for (let k = 0; k < STRINGS; k++) plucks[k] *= Math.exp(-dt * 1.2);
    if (!reduce) {
      uniforms.uRipple.value.z += dt;
      handPrev.x = hand.x;
      handPrev.y = hand.y;
      const wasOn = hand.on;
      if (ptr.seen) {
        if (!hand.on) Object.assign(hand, { x: ptr.x, y: ptr.y, vx: 0, vy: 0, on: true });
        const nx = hand.x + (ptr.x - hand.x) * ease(dt, 0.09), ny = hand.y + (ptr.y - hand.y) * ease(dt, 0.09);
        const k = ease(dt, 0.08), step = Math.max(dt, 1e-3);
        hand.vx += (((nx - hand.x) * camera.aspect) / step - hand.vx) * k;
        hand.vy += ((ny - hand.y) / step - hand.vy) * k;
        hand.x = nx;
        hand.y = ny;
        if (wasOn && onStringsNow() > 0.6) strum(handPrev, hand);
      } else hand.on = false;
      stepField(dt);
      gate.update(dt);
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

/* ---------------------------------------------------------------- sound */

// Everything is in B major, the key of "Lost", so the score and the song can hand over to each other.
// The file runs from the first chord of Lost's peak section (2:27) to 4:31, where it fades out; then it
// starts again from that chord. The full track is on Spotify.
const LOST_URL = 'media/lost.mp3';
const DRONE = [0.06, 0.14, 0.11, 0.12, 0.13, 0.12, 0.07, 0.1];

// The score: four chords in B major, one every 16 slow beats (about 14 s), voiced so that each voice moves
// by a step or two: Bmaj9 – G♯m9 – Emaj9 – F♯9sus4, and home again. The piano plays short phrases inside
// each chord. Pitches are MIDI note numbers; pitch classes run C = 0 to B = 11.
const BEAT = 60 / 66;
const CHORD_BEATS = 16;
const PROG = [
  { pad: [47, 54, 58, 61, 63], root: 47, tones: [11, 3, 6, 10, 1], avoid: [4] }, // Bmaj9: B D♯ F♯ A♯ C♯
  { pad: [44, 51, 58, 59, 63], root: 44, tones: [8, 11, 3, 6, 10], avoid: [4] }, // G♯m9: G♯ B D♯ F♯ A♯
  { pad: [40, 47, 56, 63, 66], root: 40, tones: [4, 8, 11, 3, 6], avoid: [] }, // Emaj9: E G♯ B D♯ F♯
  { pad: [42, 49, 56, 59, 64], root: 42, tones: [6, 11, 1, 4, 8], avoid: [10] }, // F♯9sus4: F♯ B C♯ E G♯
];
const SCALE_PC = [11, 1, 3, 4, 6, 8, 10]; // B major
const RHYTHMS = [[0, 1, 2], [0, 1.5, 2, 3], [0, 0.5, 1.5, 3], [0, 2, 3], [0, 1, 1.5, 2.5], [0, 1.5, 3, 4.5]];
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const score = { timer: 0, keys: null, at: 0, chord: 0, bank: 0, last: 66, motif: null, marks: [] };

const soundBtn = document.getElementById('sound');
const hearBtn = document.getElementById('hear');
const nowTxt = document.getElementById('nowtxt');
const noteSec = document.querySelector('.ch-note');
const audio = { ctx: null, on: false, padTarget: 0.06 };
let inNote = false;

function ensureAudio() {
  if (audio.ctx) return;
  if (navigator.audioSession) navigator.audioSession.type = 'playback'; // iOS: play even with the silent switch on
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain();
  master.gain.value = 0;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 4;
  limiter.ratio.value = 10;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter).connect(ctx.destination);

  // A shared room: a soft, darkening reverb tail
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, 3.4);
  const verbOut = ctx.createGain();
  verbOut.gain.value = 0.55;
  verb.connect(verbOut).connect(master);
  const send = (node, amount) => {
    const g = ctx.createGain();
    g.gain.value = amount;
    node.connect(g).connect(verb);
    return g;
  };

  // The score's pad, under a slowly moving low-pass filter, with a high-pass that can thin it out when Lost arrives
  const padTone = ctx.createBiquadFilter();
  padTone.type = 'lowpass';
  padTone.frequency.value = 900;
  padTone.Q.value = 0.4;
  const padHP = ctx.createBiquadFilter();
  padHP.type = 'highpass';
  padHP.frequency.value = 30;
  const pad = ctx.createGain();
  pad.gain.value = 0;
  padTone.connect(padHP).connect(pad).connect(master);
  send(pad, 0.3);
  const sweep = ctx.createOscillator(), sweepDepth = ctx.createGain();
  sweep.frequency.value = 0.05;
  sweepDepth.gain.value = 300;
  sweep.connect(sweepDepth).connect(padTone.frequency);
  sweep.start();
  // Two banks of five voices (each a slightly detuned pair); when the chord changes, the idle bank takes the
  // new voicing and the two cross over
  const banks = [0, 1].map((b) => {
    const gain = ctx.createGain();
    gain.gain.value = b ? 0 : 1;
    gain.connect(padTone);
    const voices = [[0.16, 'sine'], [0.2, 'triangle'], [0.14, 'triangle'], [0.1, 'triangle'], [0.06, 'sine']].map(([g, type], i) => [-4, 4].map((cents) => {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = type;
      o.frequency.value = hz(PROG[0].pad[i]);
      o.detune.value = cents;
      og.gain.value = g / 2;
      o.connect(og).connect(gain);
      o.start();
      return o;
    }));
    return { gain, voices };
  });

  // Piano notes over the pad
  const chimeBus = ctx.createBiquadFilter();
  chimeBus.type = 'lowpass';
  chimeBus.frequency.value = 2400;
  chimeBus.connect(master);
  send(chimeBus, 0.6);

  // The curtain's glass chimes (chapter 4), on their own brighter bus, with a short burst of noise for each touch.
  // The bus fades with the curtain, so once the viewer has passed through, nothing of it rings on.
  const bellBus = ctx.createBiquadFilter();
  bellBus.type = 'lowpass';
  bellBus.frequency.value = 7000;
  const bellFade = ctx.createGain();
  bellBus.connect(bellFade).connect(master);
  send(bellFade, 0.5);
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.04), ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);

  // Lost: element → round gain → (analyser) → low-pass → bus → master, with its own reverb send for the dissolve
  const el = new Audio(LOST_URL);
  el.preload = 'none';
  const round = ctx.createGain(); // fades the song back in when it starts again from 2:27
  const voices = ctx.createGain();
  ctx.createMediaElementSource(el).connect(round).connect(voices);
  el.addEventListener('ended', againLost);
  el.addEventListener('playing', () => { nowTxt.textContent = 'Now playing · Lost'; });
  el.addEventListener('waiting', () => { nowTxt.textContent = 'Tuning in'; });
  lost.el = el;
  const lostTone = ctx.createBiquadFilter();
  lostTone.type = 'lowpass';
  lostTone.frequency.value = 300;
  lostTone.Q.value = 0.9;
  const lostBus = ctx.createGain();
  lostBus.gain.value = 0;
  voices.connect(lostTone).connect(lostBus).connect(master);
  const lostVerb = send(lostTone, 0.6);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.72;
  const mute = ctx.createGain();
  mute.gain.value = 0;
  voices.connect(analyser).connect(mute).connect(ctx.destination); // keeps the analyser running everywhere

  Object.assign(audio, { ctx, master, pad, padTone, padHP, banks, chimeBus, bellBus, bellFade, noise, round, lostTone, lostBus, lostVerb, analyser, data: new Uint8Array(analyser.frequencyBinCount) });
}

function impulse(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  const attack = ctx.sampleRate * 0.012;
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      lp += (Math.random() * 2 - 1 - lp) * (0.92 - 0.85 * t); // brighter at first, darker as it fades
      d[i] = lp * Math.pow(1 - t, 3.2) * Math.min(1, i / attack);
    }
  }
  return ir;
}

// Holds a parameter where it is right now, so a new move starts from there (mid-fade included)
function hold(param, t) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
  else {
    const v = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(v, t);
  }
}

// A soft two-note bell and a ripple on the line, so turning sound on is heard and seen at once
function firstSound() {
  const t = audio.ctx.currentTime;
  [[246.94, 0.06], [369.99, 0.03]].forEach(([f, g]) => {
    const o = audio.ctx.createOscillator(), e = audio.ctx.createGain();
    o.frequency.value = f;
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(g, t + 0.02);
    e.gain.setTargetAtTime(0, t + 0.05, 0.9);
    o.connect(e).connect(audio.master);
    o.start(t);
    o.stop(t + 5);
  });
  gsap.fromTo(state, { pulse: 0.5 }, { pulse: 0, duration: 2.6, ease: 'power2.out', onUpdate: () => { dirty = true; } });
}

// A soft, felt-piano-like note: slightly stretched overtones that fade sooner than the fundamental,
// low notes ringing longer; a longer attack strikes it more softly
function piano(m, vel, at, dest = score.keys, attack = 0.006) {
  if (!dest) return;
  const ctx = audio.ctx, f = hz(m), out = ctx.createGain(), long = m < 56 ? 1.6 : 1;
  out.gain.value = vel;
  out.connect(dest);
  [[1, 1, 2.6], [2.003, 0.3, 1.3], [3.008, 0.1, 0.8], [4.016, 0.04, 0.5], [5.03, 0.015, 0.35]].forEach(([h, a, tau]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = f * h;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(a, at + attack);
    g.gain.setTargetAtTime(0, at + attack * 2, tau * long);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + tau * long * 5);
  });
  setTimeout(() => out.disconnect(), (at - ctx.currentTime + 15) * 1000);
}

// The notes a phrase may use over a chord: the scale, minus the chord's avoid notes, within a range
function notesFor(ch, lo = 59, hi = 78) {
  const out = [];
  for (let m = lo; m <= hi; m++) if (SCALE_PC.includes(m % 12) && !ch.avoid.includes(m % 12)) out.push(m);
  return out;
}
const isTone = (ch, m) => ch.tones.includes(m % 12);
const closest = (list, m) => list.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a));

// A few notes moving by step through the chord's scale: it starts on a chord tone near where the last phrase
// ended, stays in a comfortable register and lands on a chord tone. Half the time it reuses the last phrase's
// rhythm and shape on the new chord, so the music develops an idea instead of wandering. An answer mirrors it.
function phrase(ch, answer = false) {
  const notes = notesFor(ch), tones = notes.filter((m) => isTone(ch, m));
  const reuse = score.motif && Math.random() < 0.5;
  const rhythm = reuse ? score.motif.rhythm : RHYTHMS[(Math.random() * RHYTHMS.length) | 0];
  let steps = reuse ? score.motif.steps : rhythm.slice(1).map(() => [-1, -1, 1, 1, -2, 2, 1, -1, 3][(Math.random() * 9) | 0]);
  if (answer) steps = steps.map((d) => -d);
  let i = notes.indexOf(closest(tones, score.last));
  const out = [[rhythm[0], notes[i]]];
  steps.forEach((d, k) => {
    if ((notes[i] > 73 && d > 0) || (notes[i] < 63 && d < 0)) d = -d;
    i = Math.max(0, Math.min(notes.length - 1, i + d));
    out.push([rhythm[k + 1], notes[i]]);
  });
  const end = out[out.length - 1];
  end[1] = closest(tones, end[1]);
  if (!answer) score.motif = { rhythm, steps };
  score.last = end[1];
  return out;
}

function playChord(ch, at) {
  score.marks.push({ at, ch });
  if (score.marks.length > 3) score.marks.shift();

  // pad: the idle bank takes the new voicing, then the banks cross over (about five seconds)
  const next = audio.banks[(score.bank ^= 1)], prev = audio.banks[score.bank ^ 1];
  next.voices.forEach((pair, i) => pair.forEach((o) => o.frequency.setValueAtTime(hz(ch.pad[i]), at)));
  next.gain.gain.setTargetAtTime(1, at, 1.6);
  prev.gain.gain.setTargetAtTime(0, at, 1.6);

  // piano: loudness follows the chapter; a little human looseness in the timing
  const v = audio.padTarget * 0.3;
  const beat = (b) => at + b * BEAT + (Math.random() - 0.5) * 0.03;
  const r = ch.root < 45 ? ch.root + 12 : ch.root;
  if (Math.random() < 0.7) {
    // the chord's root in the left hand, sometimes with its fifth
    piano(r, v * 0.8, beat(0));
    if (Math.random() < 0.45) piano(r + 7, v * 0.5, beat(0.5));
  } else if (Math.random() < 0.5) {
    // or a slow rolled chord
    notesFor(ch, 54, 68).filter((m) => isTone(ch, m)).slice(0, 4).forEach((m, i) => piano(m, v * (0.55 - i * 0.06), beat(0) + i * 0.12));
  }
  if (Math.random() < 0.85) {
    // a short phrase, and often an answer
    const start = 2 + ((Math.random() * 3) | 0);
    phrase(ch).forEach(([b, m], i) => piano(m, v * (i ? 0.75 + Math.random() * 0.15 : 0.95), beat(start + b)));
    if (Math.random() < 0.5) phrase(ch, true).forEach(([b, m], i) => piano(m, v * (i ? 0.65 + Math.random() * 0.15 : 0.8), beat(start + 6 + b)));
  }
}

// Chords are scheduled a moment before they begin, so the timer can be late without the music stumbling
function scoreTick() {
  while (score.at < audio.ctx.currentTime + 1.5) {
    playChord(PROG[score.chord % PROG.length], score.at);
    score.chord++;
    score.at += CHORD_BEATS * BEAT;
  }
}

function startScore() {
  if (score.timer) return;
  score.keys = audio.ctx.createGain();
  score.keys.gain.value = lost.active ? 0 : 1;
  score.keys.connect(audio.chimeBus);
  score.at = audio.ctx.currentTime + 0.5;
  scoreTick();
  score.timer = setInterval(scoreTick, 500);
}

// Notes already scheduled are cut off with their bus once the sound has faded
function stopScore() {
  clearInterval(score.timer);
  score.timer = 0;
  const keys = score.keys;
  score.keys = null;
  if (keys) setTimeout(() => keys.disconnect(), 1500);
}

function keysTo(level, t, tc) {
  if (!score.keys) return;
  hold(score.keys.gain, t);
  score.keys.gain.setTargetAtTime(level, t, tc);
}

// The chord the score plays at time t (on the audio clock), the one already due included
function chordAt(t) {
  if (score.timer && t >= score.at) return PROG[score.chord % PROG.length];
  return score.marks.reduce((c, k) => (k.at <= t ? k.ch : c), PROG[0]);
}

// A click plays the chord of the moment across the screen: low notes on the left, high on the right
function clickNote(x) {
  if (!audio.on || lost.active) return;
  const now = audio.ctx.currentTime;
  const ch = chordAt(now);
  const tones = notesFor(ch, 59, 79).filter((m) => isTone(ch, m));
  piano(tones[Math.round(Math.min(1, Math.max(0, x)) * (tones.length - 1))], 0.04, now + 0.02, audio.chimeBus);
}

// The curtain in chapter 4 rings like glass chimes, tuned to the pentatonic notes of B major so it always sits
// inside the score: low strands on the left, high on the right. A strike is a few inharmonic partials of a struck
// rod (with a slow beat between two of them), a breath of filtered noise for the touch, panned to where it hangs.
const BELLS = [75, 78, 80, 83, 85, 87, 90, 92, 95]; // D♯5 to B6
const bells = { last: 0, voices: 0 };
function chime(x, v, pan) {
  if (!audio.on || !audio.ctx || lost.active) return;
  const ctx = audio.ctx, t = ctx.currentTime;
  if (t - bells.last < 0.035 || bells.voices >= 24) return;
  bells.last = t;
  bells.voices++;
  const deg = Math.max(0, Math.min(BELLS.length - 1, Math.round(x * (BELLS.length - 1) + (Math.random() - 0.5) * 0.9)));
  const f = hz(BELLS[deg]) * (1 + (Math.random() - 0.5) * 0.003), dur = 1.2 + v * 1.2;
  const out = ctx.createGain();
  out.gain.value = 0.03 + v * 0.05;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    out.connect(p).connect(audio.bellBus);
  } else out.connect(audio.bellBus);
  [[1, 1, 1], [1.0035, 0.35, 0.9], [2, 0.08, 0.55], [2.756, 0.32, 0.42], [5.404, 0.12, 0.2]].forEach(([r, a, k]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f * r, t);
    o.frequency.exponentialRampToValueAtTime(f * r * 0.997, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a, t + 0.003);
    g.gain.setTargetAtTime(0, t + 0.004, dur * k * 0.3);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur * k * 1.6 + 0.1);
  });
  const nz = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
  nz.buffer = audio.noise;
  bp.type = 'bandpass';
  bp.frequency.value = f * 2.4;
  bp.Q.value = 6;
  ng.gain.setValueAtTime(0.25 * v, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  nz.connect(bp).connect(ng).connect(out);
  nz.start(t);
  setTimeout(() => { bells.voices--; }, 900); // past its bright start, a voice no longer counts against the limit
  setTimeout(() => out.disconnect(), (dur * 1.6 + 0.3) * 1000);
}

// Chapter 4's traveller: each step up to the gate sounds one soft note, rising through the pentatonic scale. Entering,
// the gold climbing the curtain sounds as a run of chimes; when it reaches the crown, the gate answers with a low
// note and a chord.
const STEP_NOTES = [59, 61, 63, 66, 68, 71];
function stepNote(k) {
  if (!audio.on || !audio.ctx || lost.active) return;
  piano(STEP_NOTES[Math.max(0, Math.min(5, k - 1))], 0.032, audio.ctx.currentTime + 0.01, audio.chimeBus);
}
function enterSound(stage) {
  if (!audio.on || !audio.ctx || lost.active) return;
  if (stage === 1) {
    [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1].forEach((x, i) => setTimeout(() => chime(x, 0.3 + i * 0.04, 0), i * 120));
    return;
  }
  piano(47, 0.05, audio.ctx.currentTime + 0.02, audio.chimeBus);
  [0.35, 0.6, 0.9].forEach((x, i) => setTimeout(() => chime(x, 0.5, (i - 1) * 0.5), i * 60));
}

// Sound is on unless the visitor turned it off before (remembered in this browser). Browsers let a page make sound
// only after the visitor's first click, tap or key, so until then it waits: the opening offers "Begin with sound" (or
// to read quietly), and otherwise the first interaction anywhere starts it.
let soundPref = true;
try { soundPref = localStorage.getItem('story-sound') !== 'off'; } catch (e) { /* no storage: keep the default */ }
const beginRow = document.querySelector('.begin');
function showSound() {
  soundBtn.setAttribute('aria-pressed', String(soundPref));
  soundBtn.querySelector('.lbl').textContent = soundPref ? 'Sound on' : 'Sound off';
  soundBtn.classList.toggle('pending', soundPref && !audio.on);
}
showSound();

function setSound(on) {
  soundPref = on;
  try { localStorage.setItem('story-sound', on ? 'on' : 'off'); } catch (e) { /* not remembered */ }
  // the opening's question is answered
  if (beginRow && !beginRow.dataset.done) {
    beginRow.dataset.done = '1';
    gsap.to(beginRow, { autoAlpha: 0, duration: 0.6, overwrite: true });
  }
  if (on === audio.on) return showSound();
  ensureAudio();
  audio.ctx.resume();
  audio.on = on;
  root.classList.toggle('sound-on', on);
  const t = audio.ctx.currentTime;
  hold(audio.master.gain, t);
  audio.master.gain.setTargetAtTime(on ? 1 : 0, t, 0.35);
  showSound();
  if (on) {
    // iOS lets a page start media only from a tap, so the song is unlocked (silently) here, at the tap
    if (!lost.active && lost.el.paused) lost.el.play().then(() => { if (!lost.active) lost.el.pause(); }).catch(() => {});
    setDrone(audio.padTarget);
    firstSound();
    startScore();
    if (inNote) enterNote();
  } else {
    stopScore();
    if (lost.active) silenceLost();
  }
}

function setDrone(target) {
  audio.padTarget = target;
  if (!audio.ctx || lost.active) return;
  hold(audio.pad.gain, audio.ctx.currentTime);
  audio.pad.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.8);
}

function enterNote() {
  lostIn();
}

// When the song ends, it starts again from the peak section after a breath, fading in
function againLost() {
  if (!lost.active) return;
  const t = audio.ctx.currentTime;
  hold(audio.round.gain, t);
  audio.round.gain.setValueAtTime(0, t);
  setTimeout(() => {
    if (!lost.active) return;
    lost.el.currentTime = 0;
    lost.el.play().catch(() => {});
    const n = audio.ctx.currentTime;
    audio.round.gain.setTargetAtTime(1, n, 0.8);
  }, 1200);
}

function stopLost() {
  lost.el.pause();
  lost.fresh = true; // next time, start from 2:27 again
}

// The handover in: Lost rises from under the pad, muffled and far away, then opens up and comes close,
// while the pad thins from the bottom and steps aside
function lostIn() {
  if (!audio.on || !inNote || lost.active) return;
  clearTimeout(lost.stopTimer);
  const t = audio.ctx.currentTime;
  if (lost.el.paused) {
    if (lost.fresh) lost.el.currentTime = 0;
    lost.fresh = false;
    hold(audio.round.gain, t);
    audio.round.gain.setValueAtTime(1, t);
    nowTxt.textContent = 'Tuning in';
    lost.el.play().catch(() => {});
  }
  lost.active = true;
  hold(audio.lostBus.gain, t);
  audio.lostBus.gain.setTargetAtTime(0.9, t, 1.2);
  hold(audio.lostTone.frequency, t);
  audio.lostTone.frequency.exponentialRampToValueAtTime(18000, t + 6.5);
  hold(audio.lostVerb.gain, t);
  audio.lostVerb.gain.setTargetAtTime(0.1, t + 1.5, 2);
  hold(audio.padHP.frequency, t);
  audio.padHP.frequency.exponentialRampToValueAtTime(600, t + 5);
  hold(audio.pad.gain, t);
  audio.pad.gain.setTargetAtTime(0, t + 1, 1.5);
  keysTo(0, t, 0.8);
  noteSec.classList.add('is-playing');
}

// The handover out: Lost closes down and dissolves into the room while the pad returns underneath
function lostOut() {
  if (!lost.active) return;
  lost.active = false;
  noteSec.classList.remove('is-playing');
  const t = audio.ctx.currentTime;
  hold(audio.lostTone.frequency, t);
  audio.lostTone.frequency.exponentialRampToValueAtTime(300, t + 5);
  hold(audio.lostVerb.gain, t);
  audio.lostVerb.gain.setTargetAtTime(0.8, t, 0.8);
  hold(audio.lostBus.gain, t);
  audio.lostBus.gain.setTargetAtTime(0, t + 1, 1.4);
  hold(audio.padHP.frequency, t);
  audio.padHP.frequency.exponentialRampToValueAtTime(30, t + 5);
  hold(audio.pad.gain, t);
  audio.pad.gain.setTargetAtTime(audio.padTarget, t + 1.8, 1.8);
  keysTo(1, t + 2, 1.5);
  lost.stopTimer = setTimeout(stopLost, 9000);
}

// Sound switched off mid-song: fade quickly, then reset for next time
function silenceLost() {
  lost.active = false;
  noteSec.classList.remove('is-playing');
  const t = audio.ctx.currentTime;
  hold(audio.lostBus.gain, t);
  audio.lostBus.gain.setTargetAtTime(0, t, 0.3);
  clearTimeout(lost.stopTimer);
  lost.stopTimer = setTimeout(() => {
    stopLost();
    const n = audio.ctx.currentTime;
    [[audio.lostTone.frequency, 300], [audio.lostVerb.gain, 0.6], [audio.padHP.frequency, 30], [audio.pad.gain, audio.padTarget]].forEach(([p, val]) => {
      hold(p, n);
      p.setValueAtTime(val, n);
    });
  }, 1600);
}

soundBtn.addEventListener('click', () => setSound(!soundPref));
document.getElementById('begin').addEventListener('click', () => setSound(true));
document.getElementById('quiet').addEventListener('click', () => setSound(false));
// the first click, tap or key anywhere starts the sound, if it is on (the sound button and the opening's choices
// handle themselves)
const firstTouch = (e) => {
  ['pointerdown', 'keydown', 'touchend'].forEach((n) => removeEventListener(n, firstTouch, true));
  if (soundPref && !audio.on && !(e.target.closest && e.target.closest('#sound, #begin, #quiet'))) setSound(true);
};
['pointerdown', 'keydown', 'touchend'].forEach((n) => addEventListener(n, firstTouch, true));
hearBtn.addEventListener('click', () => setSound(true));
document.querySelectorAll('[data-sound-on]').forEach((b) => b.addEventListener('click', () => setSound(true)));
document.addEventListener('visibilitychange', () => {
  if (!audio.ctx || !audio.on) return;
  if (document.hidden) audio.ctx.suspend();
  else audio.ctx.resume();
});

// Chapter 6: "Say hello". The voice is analysed in the browser and shapes the sphere; nothing is recorded.
const micBtn = document.getElementById('mic');
const micNote = document.getElementById('micnote');
// The microphone, as forgiving as browsers allow. On iPhones the page's audio session is set to playback (so sound
// plays with the silent switch on), which keeps the microphone shut, so it switches to play-and-record while
// listening. If the browser refuses the voice-processing settings, plain audio is asked for instead; and where a
// browser can't feed a microphone into audio of another sample rate (Firefox), it is analysed in a context of its own.
async function micStart() {
  ensureAudio();
  audio.ctx.resume();
  try {
    if (!window.isSecureContext) throw Object.assign(new Error('insecure'), { name: 'Insecure' });
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('unsupported'), { name: 'Unsupported' });
    if (navigator.audioSession) navigator.audioSession.type = 'play-and-record';
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      if (e.name !== 'OverconstrainedError' && e.name !== 'TypeError') throw e;
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    let ctx = audio.ctx, src;
    try {
      src = ctx.createMediaStreamSource(stream);
    } catch (e) {
      const rate = stream.getAudioTracks()[0] && stream.getAudioTracks()[0].getSettings().sampleRate;
      ctx = new (window.AudioContext || window.webkitAudioContext)(rate ? { sampleRate: rate } : undefined);
      ctx.resume();
      src = ctx.createMediaStreamSource(stream);
    }
    const analyser = ctx.createAnalyser(), mute = ctx.createGain();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.6;
    mute.gain.value = 0;
    src.connect(analyser).connect(mute).connect(ctx.destination); // analysed, never played back
    Object.assign(mic, { stream, src, analyser, own: ctx === audio.ctx ? null : ctx, data: new Uint8Array(analyser.frequencyBinCount), wave: new Float32Array(analyser.fftSize) });
    micBtn.setAttribute('aria-pressed', 'true');
    micBtn.querySelector('.lbl').textContent = 'Stop listening';
    micNote.textContent = 'Speak, then pause: the sphere keeps the shape of your voice and sings its melody back. Nothing is recorded or sent.';
    setDrone(0.03); // the score steps back so the room is quiet
  } catch (e) {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
    // (the sphere only hears a microphone, so say plainly why it can't, and what would let it)
    const why = {
      Insecure: 'The microphone needs the secure (https) address of this page.',
      Unsupported: 'This browser doesn\'t lend pages its microphone. Open the site in Chrome or Safari.',
      NotAllowedError: 'Microphone access is off. Allow it for this site and try again.',
      NotFoundError: 'No microphone found. The sphere will wait.',
      NotReadableError: 'The microphone is busy in another app. Close it and try again.',
    };
    micNote.textContent = why[e && e.name] || `The microphone isn't available here (${(e && e.name) || 'unknown'}).`;
  }
}
function micStop() {
  if (!mic.stream) return;
  mic.stream.getTracks().forEach((t) => t.stop());
  mic.src.disconnect();
  if (mic.own) mic.own.close();
  if (navigator.audioSession) navigator.audioSession.type = 'playback';
  Object.assign(mic, { stream: null, src: null, analyser: null, own: null, data: null, wave: null, raw: 0 });
  voice.phrase = null;
  micBtn.setAttribute('aria-pressed', 'false');
  micBtn.querySelector('.lbl').textContent = 'Say hello';
  micNote.textContent = 'Your voice stays in your browser. Nothing is recorded or sent.';
  setDrone(DRONE[6]);
}
micBtn.addEventListener('click', () => (mic.stream ? micStop() : micStart()));

document.getElementById('copy').addEventListener('click', async (e) => {
  const b = e.currentTarget, text = document.getElementById('mailtext').textContent;
  try { await navigator.clipboard.writeText(text); b.textContent = 'Copied'; } catch (err) {
    const r = document.createRange();
    r.selectNodeContents(document.getElementById('mailtext'));
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    b.textContent = 'Selected, press Ctrl+C';
  }
  setTimeout(() => { b.textContent = 'Copy email'; }, 2200);
});

function readMic(dt) {
  // quick to rise, slow to settle, so what the voice does stays in view for a moment
  const up = 1 - Math.exp(-dt / 0.08), down = 1 - Math.exp(-dt / 1.4);
  if (!mic.analyser) {
    mic.level -= mic.level * down;
    mic.bands = mic.bands.map((x) => x - x * down);
    mic.raw = 0;
    return;
  }
  mic.analyser.getByteFrequencyData(mic.data);
  const hz = mic.analyser.context.sampleRate / mic.analyser.fftSize, data = mic.data;
  const avg = (lo, hi) => {
    let t = 0, n = 0;
    for (let i = Math.max(1, Math.floor(lo / hz)); i <= Math.min(data.length - 1, Math.ceil(hi / hz)); i++) { t += data[i]; n++; }
    return n ? t / n : 0;
  };
  const lv = Math.pow(Math.max(0, Math.min(1, (avg(100, 4000) - 50) / 90)), 1.1);
  mic.raw = lv;
  mic.level += (lv - mic.level) * (lv > mic.level ? up : down);
  mic.bands = [[80, 300], [300, 1000], [1000, 3000], [3000, 8000]].map(([lo, hi], k) => {
    const v = Math.max(0, Math.min(1, (avg(lo, hi) - 45) / 90));
    return mic.bands[k] + (v - mic.bands[k]) * (v > mic.bands[k] ? up : down);
  });
  dirty = true;
}

// Chapter 6's sphere, as a phonograph. While the visitor speaks it turns, and each moment of their voice is engraved
// at the point facing us: its spectrum in 32 bands from 90 Hz to 7 kHz. The pitch is followed as they speak. When they
// pause after a phrase, the sphere turns back to where the phrase began and plays it as it was engraved, a little slower
// than it was spoken, and sings a reply: the phrase's rhythm and the shape of its melody, set in the chords the score is
// playing. The engraving fades over ten seconds or so.
const VOICE_RATE = 25; // columns engraved per second of speech: once round the sphere in about 5 s
const PHRASE = 5; // so a phrase is at most this long (a sung line fits)
const turnRate = (VOICE_RATE / VW) * Math.PI * 2;
const frontColumn = (spin) => ((((Math.PI / 2 - spin) / (Math.PI * 2)) % 1) + 1) % 1 * VW; // the column facing us
const acf = new Float32Array(1200);

// the voice's pitch: the first strong repeat in the waveform between 75 and 420 Hz (normalised autocorrelation)
function pitchOf(buf, sr) {
  let e = 0;
  for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i];
  if (e / buf.length < 1e-5) return 0;
  const lo = Math.floor(sr / 420), hi = Math.min(Math.ceil(sr / 75), buf.length >> 1, acf.length - 2), n = buf.length - hi;
  let best = 0;
  for (let L = lo; L <= hi; L++) {
    let s = 0, a2 = 0, b2 = 0;
    for (let i = 0; i < n; i += 2) {
      const a = buf[i], b = buf[i + L];
      s += a * b;
      a2 += a * a;
      b2 += b * b;
    }
    acf[L] = s / Math.sqrt(a2 * b2 + 1e-12);
    best = Math.max(best, acf[L]);
  }
  if (best < 0.8) return 0;
  // the shortest lag that repeats nearly as well as the best (so the pitch is not read an octave low)
  for (let L = lo + 1; L < hi; L++) if (acf[L] > best * 0.92 && acf[L] >= acf[L - 1] && acf[L] >= acf[L + 1]) return sr / L;
  return 0;
}

const median = (xs) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];

// The melody of a phrase, one note per syllable, as it is heard. Syllables are told apart by the dips in loudness
// between them (or a break in the voice). Inside a syllable the pitch makes another note only where it settles on
// another level for a while, so a slide stays one note instead of a quick run. The pitches stay as heard; songOf makes
// music of them. Each reading is [time, pitch (0: unvoiced), loudness].
function melodyOf(phrase) {
  const fr = phrase.pts.filter((q) => q[0] < PHRASE);
  const db = fr.map((q, i) => {
    const w = fr.slice(Math.max(0, i - 1), i + 2);
    return w.reduce((a, x) => a + x[2], 0) / w.length;
  });
  // where one syllable gives way to the next: the loudness dips by 3 dB and rises again, or the voice breaks off
  const cuts = [];
  let hi = -Infinity, lo = Infinity, loT = 0;
  fr.forEach(([t], i) => {
    if (i && t - fr[i - 1][0] > 0.05) {
      cuts.push(t - 0.001);
      hi = db[i];
      lo = Infinity;
    } else if (hi - lo >= 3 && db[i] - lo >= 3) {
      cuts.push(loT);
      hi = db[i];
      lo = Infinity;
    } else if (db[i] >= hi) {
      hi = db[i];
      lo = Infinity;
    } else if (db[i] < lo) {
      lo = db[i];
      loT = t;
    }
  });
  // the voiced readings of each syllable (a stretch without pitch, such as an s or a t, also ends one)
  const syllables = [];
  let n = -1, lastCut = 0, lastT = -1;
  fr.forEach((q) => {
    if (!q[1]) return;
    const c = cuts.filter((x) => x < q[0]).length;
    if (n < 0 || c !== lastCut || q[0] - lastT > 0.05) syllables[++n] = [];
    syllables[n].push(q);
    lastCut = c;
    lastT = q[0];
  });
  const notes = [];
  syllables.forEach((pts) => {
    if (pts[pts.length - 1][0] - pts[0][0] < 0.05) return;
    // the pitch, smoothed, cut wherever it moves by more than a semitone
    const segs = [];
    let cur = null;
    pts.forEach((q, i) => {
      const m = median(pts.slice(Math.max(0, i - 2), i + 3).map((x) => x[1]));
      if (cur && Math.abs(m - cur.m) < 1.2) {
        cur.end = q[0];
        cur.ms.push(m);
        cur.m = median(cur.ms);
      } else segs.push((cur = { start: q[0], end: q[0], ms: [m], m }));
    });
    // and any part shorter than 0.12 s is a glide, not a note: the shortest joins its neighbour nearer in pitch
    while (segs.length > 1) {
      let k = 0;
      segs.forEach((sg, i) => { if (sg.end - sg.start < segs[k].end - segs[k].start) k = i; });
      const sg = segs[k], a = segs[k - 1], b = segs[k + 1];
      if (sg.end - sg.start >= 0.12) break;
      const into = !b || (a && Math.abs(a.m - sg.m) <= Math.abs(b.m - sg.m)) ? a : b;
      into.start = Math.min(into.start, sg.start);
      into.end = Math.max(into.end, sg.end);
      into.ms = into === a ? a.ms.concat(sg.ms) : sg.ms.concat(b.ms);
      into.m = median(into.ms);
      segs.splice(k, 1);
    }
    segs.forEach((sg, i) => notes.push({ at: sg.start, end: sg.end, m: sg.m, tied: i > 0 }));
  });
  // a note an octave away from its neighbours is a slip of the pitch tracker (or a squeak): brought back beside them
  notes.forEach((nt, i) => {
    const near = median(notes.slice(Math.max(0, i - 2), i + 3).map((x) => x.m));
    while (nt.m - near > 7) nt.m -= 12;
    while (near - nt.m > 7) nt.m += 12;
  });
  return notes.slice(0, 20);
}

// What the sphere sings is a reply, not a copy: the phrase's rhythm and the shape of its melody, made into music. The
// melody is set in the piano's warm middle (around G4) and kept within about an octave, so nothing shrill jumps out,
// and a flat sentence is given a little more movement. Each note then lands in the chord the score is playing at that
// moment: a chord tone where it is held (and to begin; the last on the chord's root, third or fifth), a note of the
// scale where it passes. What is kept exactly is the direction of each step, which is what makes a melody
// recognisable: where the voice went up the song goes up, where it went down the song goes down, where it stayed it
// stays.
function songOf(notes, chordOf) {
  const mid = median(notes.map((nt) => nt.m));
  const reach = Math.max(1, ...notes.map((nt) => Math.abs(nt.m - mid)));
  const k = Math.min(1.5, 6 / reach);
  const out = [];
  notes.forEach((nt, i) => {
    const ch = chordOf(nt.at), last = i === notes.length - 1, held = nt.end - nt.at >= 0.25 || !i || last;
    const pool = notesFor(ch, 60, 76).filter((x) => (last ? ch.tones.slice(0, 3) : held ? ch.tones : SCALE_PC).includes(x % 12));
    let m = closest(pool, 67 + (nt.m - mid) * k);
    const prev = out[out.length - 1];
    if (prev) {
      const d = nt.m - notes[i - 1].m;
      if (d > 0.75 && m <= prev.m) m = pool.find((x) => x > prev.m) ?? m;
      else if (d < -0.75 && m >= prev.m) m = pool.filter((x) => x < prev.m).pop() ?? m;
      else if (Math.abs(d) <= 0.75 && pool.includes(prev.m)) m = prev.m;
    }
    if (prev && nt.tied && prev.m === m) prev.end = nt.end; // the same note again inside a syllable: held
    else out.push({ at: nt.at, end: nt.end, m, ch, held });
  });
  return out;
}

// Turn back to the phrase's start, then play it a little slower than it was spoken, so quick syllables become a
// melody: the quicker the speech, the more (from 1.25 to 1.5 times), easing off over the last part as a sung phrase
// does. The sphere turns at the playing's pace, so each note sounds as its moment of the engraving passes the front.
// The piano sings the reply softly over a swell of the score's pad, each chord's root low as the song enters it and a
// harmony beneath the held notes.
function singBack(phrase) {
  const notes = melodyOf(phrase);
  if (!notes.length) return;
  const now = performance.now() / 1000, L = Math.min(PHRASE, phrase.end - phrase.t0);
  const gaps = notes.slice(1).map((nt, i) => nt.at - notes[i].at);
  const S = gaps.length ? Math.max(1.25, Math.min(1.5, 0.36 / median(gaps))) : 1.25;
  // the phrase's moment t is played warp(t) seconds in; from 60% of the way it slows, to 1.3 times slower at the end
  const a = 0.6 * L, c = 0.3 / (2 * Math.max(0.05, L - a));
  const warp = (t) => S * (t + (t > a ? c * (t - a) * (t - a) : 0));
  const unwarp = (p) => (p / S <= a ? p / S : a + (Math.sqrt(1 + 4 * c * (p / S - a)) - 1) / (2 * c));
  const len = warp(L) + 0.25;
  // (back to where the phrase began, or the same place a turn later: whichever is nearer behind)
  const start = voice.spin - ((((voice.spin - phrase.spin0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
  voice.rewind = { from: voice.spin, to: start, t0: now, dur: 0.8 };
  voice.playing = { spin0: start, t0: now + 0.8, t1: now + 0.8 + len, unwarp };
  voice.playUntil = now + 0.8 + len + 1.8; // and stop listening meanwhile, so it does not hear its own song
  notes.forEach((nt) => setTimeout(() => { voice.sing = Math.max(voice.sing, 0.5); }, (0.8 + warp(nt.at)) * 1000));
  if (!audio.on || !audio.ctx) return;
  // on the audio clock, so the rhythm stays even however busy the page is
  const ctx = audio.ctx, t0 = ctx.currentTime + 0.8, when = (t) => t0 + warp(t);
  const song = songOf(notes, (t) => chordAt(when(t)));
  if (!lost.active) {
    hold(audio.pad.gain, ctx.currentTime);
    audio.pad.gain.setTargetAtTime(Math.max(audio.padTarget, 0.085), ctx.currentTime + 0.3, 0.5);
    audio.pad.gain.setTargetAtTime(audio.padTarget, when(L) + 1.2, 1.4);
  }
  song.forEach((nt, i) => {
    const at = when(nt.at);
    if (!i || nt.ch !== song[i - 1].ch) piano(nt.ch.root < 45 ? nt.ch.root + 12 : nt.ch.root, 0.032, at, audio.chimeBus, 0.02);
    piano(nt.m, 0.05, at, audio.chimeBus, 0.02);
    if (!nt.held) return;
    const below = notesFor(nt.ch, 52, nt.m - 3).filter((x) => isTone(nt.ch, x) && nt.m - x <= 9);
    if (below.length) piano(below[below.length - 1], 0.025, at + 0.012, audio.chimeBus, 0.02);
  });
}

function listen(dt) {
  const v = voice, now = performance.now() / 1000;
  const hearing = !!mic.analyser && now > v.playUntil;
  const speaking = hearing && mic.raw > 0.1;
  v.sing *= Math.exp(-dt / 0.6);

  // the sphere's turn: slow at rest, at the engraving's pace through a phrase (its short pauses too, so the engraving
  // keeps time), and at the playing's while it plays one back
  if (v.rewind) {
    const k = Math.min(1, (now - v.rewind.t0) / v.rewind.dur);
    v.spin = v.rewind.from + (v.rewind.to - v.rewind.from) * k * k * (3 - 2 * k);
    if (k >= 1) v.rewind = null;
  } else if (v.playing) {
    v.spin = v.playing.spin0 + v.playing.unwarp(Math.max(0, now - v.playing.t0)) * turnRate;
    v.play = frontColumn(v.spin) / VW;
    if (now > v.playing.t1) {
      v.playing = null;
      v.play = -1;
    }
  } else v.spin += dt * (speaking || v.phrase ? turnRate : 0.12);

  // engrave this moment's spectrum at the column facing us (and any column the turn skipped since the last)
  if (speaking) {
    const sr = mic.analyser.context.sampleRate, bin = sr / mic.analyser.fftSize, d = mic.data, bands = new Float32Array(VH);
    for (let k = 0; k < VH; k++) {
      const f0 = 90 * Math.pow(7000 / 90, k / VH), f1 = 90 * Math.pow(7000 / 90, (k + 1) / VH);
      let sum = 0, n = 0;
      for (let i = Math.floor(f0 / bin); i <= Math.ceil(f1 / bin); i++) {
        sum += d[i];
        n++;
      }
      bands[k] = Math.max(0, Math.min(1, (sum / n - 95) / 110));
    }
    const c = Math.round(frontColumn(v.spin)) % VW;
    const steps = v.col < 0 ? 0 : Math.min(6, (v.col - c + VW) % VW);
    for (let s = 0; s <= steps; s++) {
      const col = (c + s) % VW;
      for (let k = 0; k < VH; k++) v.level[k * VW + col] = Math.max(v.level[k * VW + col], bands[k]);
    }
    v.col = c;
    v.any = true;
    // and follow the pitch and the loudness, for the melody and its syllables. The loudness is the quietest of the last
    // four blocks of 512 samples (about 10 ms each), so the short gap between two syllables is caught however few
    // frames the screen draws.
    const w = mic.wave;
    mic.analyser.getFloatTimeDomainData(w);
    const f = pitchOf(w, sr);
    let quiet = Infinity;
    for (let b = 0; b + 512 <= w.length; b += 512) {
      let e = 0;
      for (let i = b; i < b + 512; i++) e += w[i] * w[i];
      quiet = Math.min(quiet, e / 512);
    }
    if (!v.phrase) v.phrase = { t0: now, spin0: v.spin, pts: [], end: now };
    v.phrase.pts.push([now - v.phrase.t0, f ? 69 + 12 * Math.log2(f / 440) : 0, 10 * Math.log10(quiet + 1e-10)]);
    v.phrase.end = now;
    v.quiet = 0;
  } else {
    v.col = -1;
    // a pause after a phrase: sing it back
    if (v.phrase && (v.quiet += dt) > 0.7) {
      const p = v.phrase;
      v.phrase = null;
      if (p.pts.filter((q) => q[1]).length >= 6) singBack(p);
    }
  }

  // everything fades slowly, and hardly at all while it is being played
  if (v.any) {
    const k = Math.exp(-dt / (v.rewind || v.playing ? 24 : 7));
    let peak = 0;
    for (let i = 0; i < VW * VH; i++) {
      const x = (v.level[i] *= k);
      v.data[i * 4] = x * 255;
      peak = Math.max(peak, x);
    }
    v.any = peak > 0.004;
    v.dirty = true;
  }
}

// Each band is rescaled to its own recent range and curved, so quiet and loud passages look different
const bandLo = new Float32Array(16).fill(1), bandHi = new Float32Array(16);
function shapeBand(k, v) {
  bandLo[k] = Math.min(bandLo[k] + 4e-4, v);
  bandHi[k] = Math.max(bandHi[k] - 4e-4, v);
  return Math.pow(Math.max(0, (v - bandLo[k]) / Math.max(0.06, bandHi[k] - bandLo[k])), 1.6);
}

function readAudio(dt) {
  readMic(dt);
  lost.mix += ((lost.active ? 1 : 0) - lost.mix) * 0.025;
  if (!audio.analyser || lost.el.paused) {
    for (let k = 0; k < 16; k++) bandVals[k] *= 0.9;
    level *= 0.9;
    return;
  }
  audio.analyser.getByteFrequencyData(audio.data);
  const hz = audio.ctx.sampleRate / audio.analyser.fftSize, data = audio.data;
  const avg = (lo, hi) => {
    let s = 0, n = 0;
    for (let i = Math.max(1, Math.floor(lo / hz)); i <= Math.min(data.length - 1, Math.ceil(hi / hz)); i++) { s += data[i]; n++; }
    return n ? s / n / 255 : 0;
  };
  // one band per string, log-spaced from 45 Hz to 9 kHz; quick to strike, slow to ring out
  let peak = 0;
  for (let k = 0; k < STRINGS; k++) {
    const val = shapeBand(k, avg(45 * Math.pow(200, k / STRINGS), 45 * Math.pow(200, (k + 1) / STRINGS))) * lost.mix;
    bandVals[k] += (val - bandVals[k]) * (val > bandVals[k] ? 0.6 : 0.12);
    peak = Math.max(peak, bandVals[k]);
  }
  level = peak * 0.5;
  dirty = true;
}

/* ---------------------------------------------------------------- scroll story */

// Chapters overlap by one viewport in motion mode, so exactly one chapter is "current" at a time
const where = document.getElementById('where');
function enterChapter(i) {
  const sec = sections[i], n = sec.dataset.ch;
  where.textContent = n ? `${n.padStart(2, '0')} · ${sec.dataset.name}` : sec.dataset.name;
  setDrone(DRONE[i] ?? 0.09);
}
sections.forEach((sec, i) => {
  ScrollTrigger.create({
    trigger: sec, start: motion ? 'top top' : 'top 55%', end: motion ? 'bottom bottom' : 'bottom 55%',
    onToggle: (self) => { if (self.isActive) enterChapter(i); },
  });
});
// A leap skips the chapters on its way and may land where none reports in (the very end, say), so once it lands,
// the chapter is the one the page has reached
function settleChapter() {
  let i = 0;
  sections.forEach((sec, k) => { if (sec.getBoundingClientRect().top <= 1) i = k; });
  enterChapter(i);
}

// Chapter 2 is where Lost lives: it plays for as long as the visitor stays, and hands back when they move on
ScrollTrigger.create({
  trigger: noteSec, start: motion ? 'top top' : 'top 55%', end: motion ? 'bottom bottom' : 'bottom 45%',
  onToggle: (self) => {
    inNote = self.isActive;
    if (!audio.on) return;
    // it begins a moment after the visitor arrives, so a leap only passing through never starts it (if a leap lands
    // here, the leap's end does)
    if (inNote) setTimeout(() => { if (inNote && !state.leap) enterNote(); }, 200);
    else lostOut();
  },
});

ScrollTrigger.create({
  trigger: document.querySelector('.ch-now'), start: motion ? 'top top' : 'top 55%', end: motion ? 'bottom bottom' : 'bottom 45%',
  onToggle: (self) => { if (!self.isActive) micStop(); },
});

// Someone moving through the page with the keyboard can reach every control (see .kbd in the stylesheet)
addEventListener('keydown', (e) => { if (e.key === 'Tab') root.classList.add('kbd'); });
addEventListener('pointerdown', () => root.classList.remove('kbd'));

// "Skip to work" glides to the projects (through the story) instead of jumping
let lenis = null;
document.querySelectorAll('a[href="#work"]').forEach((link) => link.addEventListener('click', (e) => {
  if (!lenis) return;
  e.preventDefault();
  const w = document.getElementById('work');
  lenis.scrollTo(w.offsetTop + (w.offsetHeight - innerHeight) * 0.5, { duration: 2.6 });
}));

if (motion) {
  lenis = new Lenis({ lerp: 0.065, wheelMultiplier: 0.8 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  buildTimelines();
} else {
  root.classList.add('story-ready');
}

function buildTimelines() {
  const blurIn = (px) => (mobile ? {} : { filter: `blur(${px}px)` });
  const blurOut = mobile ? {} : { filter: 'blur(0px)' };

  // Without the field there is no scene at the gate, so chapter 4's empty beat (the walk through it) closes up
  if (root.classList.contains('no-gl')) {
    const listen = document.querySelector('.ch-listen'), scene = listen.querySelector('.beat[aria-hidden="true"]');
    if (scene) scene.dataset.span = '20';
    listen.style.setProperty('--len', '420');
  }

  // On a phone, a chapter whose words would fill the screen turns a page: from the line marked data-phone-turn on,
  // the words become a second beat, with the photo below them
  if (mobile) document.querySelectorAll('[data-phone-turn]').forEach((first) => {
    const text = first.parentElement, stage = text.parentElement;
    const page = document.createElement('div'), words = document.createElement('div');
    page.className = 'beat beat-photo';
    words.className = 'text';
    for (let n = first; n;) {
      const next = n.nextElementSibling;
      words.appendChild(n);
      n = next;
    }
    page.append(words, ...stage.querySelectorAll(':scope > .photo'));
    text.classList.add('beat');
    stage.appendChild(page);
  });

  // Opening: the line draws itself, then the first words arrive
  const intro = sections[0].querySelectorAll('.line');
  gsap.set(intro, { opacity: 0, y: 24, ...blurIn(6) });
  root.classList.add('story-ready');
  gsap.timeline({ delay: 0.3 })
    .to(state, { fade: 1, duration: 1.2, ease: 'power2.out' }, 0)
    .to(state, { reveal: 1, duration: 2.6, ease: 'power3.inOut' }, 0)
    .to(intro, { opacity: 1, y: 0, ...blurOut, duration: 1.2, stagger: 0.25, ease: 'power3.out' }, 1.1);

  // The opening words drift away together (their container moves, so the intro keeps ownership of the lines)
  gsap.to(sections[0].querySelector('.center'), {
    opacity: 0, y: -40, ...blurIn(6), ease: 'none',
    scrollTrigger: { trigger: sections[0], start: 'top top', end: '+=55%', scrub: true },
  });

  // Particle shapes: each handover reports its own progress; the blend is computed every frame.
  // Chapters 2, 3, 6 and 7 each hand over to the next shape. Chapter 4 does it twice: the gate forms as the
  // chapter arrives, and the viewer passes through it before the two roads; in between, the figure climbs the
  // steps and walks through the curtain. Chapter 5 raises peaks in the landscape instead.
  const [, s1, s2, s3, s4, s5, s6, s7] = sections;
  const track = (trigger, start, end) => ScrollTrigger.create({ trigger, start, end });
  const t1 = track(s1, 'top 20%', 'top -60%');
  // each handover is spread over about one screen of scroll, most of it after the new chapter arrives
  const turn = (sec) => track(sec, 'top 35%', 'top -75%');
  const in4 = (from, to) => track(s4, `top ${-from}%`, `top ${-to}%`); // viewport heights into chapter 4
  const turns = [turn(s2), turn(s3), turn(s4), in4(330, 395), turn(s6), turn(s7)];
  // after its words, chapter 4 is a scene: the camera closes in, the traveller climbs and enters, the curtain parts
  // and the camera follows; it pulls back out as the two roads arrive
  const tFocus = in4(125, 185), tWalk = in4(160, 270), tEnter = in4(270, 335), tUnfocus = in4(380, 430);
  const tPeaks = track(s5, 'top 10%', 'bottom 60%');
  const ease = (x) => x * x * (3 - 2 * x);
  // The particles follow the scroll with weight: whatever the wheel does, they glide toward where the story
  // is (time-based, so the feel is the same at any frame rate)
  const glide = (dt, seconds) => 1 - Math.exp(-dt / seconds);
  // A leap (the Home or End key, the scrollbar dragged fast, a find in the page) doesn't replay every scene on the
  // way: while the page leaps, the words and the field dip out and everything follows the scroll at once, the
  // scrubbed words included; then they come back where it landed. Smooth scrolling (the wheel, "Skip to work", a
  // finger) never counts as a leap.
  const trail = []; // where the page has been over the last tenth of a second
  let leapFor = 0, touchedAt = -1e9, lastY = scrollY, lastT = performance.now();
  ['touchstart', 'touchmove', 'touchend'].forEach((n) => addEventListener(n, () => { touchedAt = performance.now(); }, { passive: true }));
  const leapCheck = (dt) => {
    // speed in screens a second, over the last frame and over the last tenth of a second
    const now = performance.now(), screens = (dy, ms) => (ms > 0 ? (Math.abs(dy) / ms) * 1000 / innerHeight : 0);
    const step = screens(scrollY - lastY, now - lastT);
    trail.push([now, scrollY]);
    while (trail.length > 2 && now - trail[0][0] > 120) trail.shift();
    const speed = screens(scrollY - trail[0][1], now - trail[0][0]);
    lastY = scrollY;
    lastT = now;
    // a key or the scrollbar leaps at once, over 25 screens a second; a finger's fling (it runs on for a few seconds,
    // in uneven frames) counts only when it races past 60 over the tenth of a second
    const fast = now - touchedAt < 3000 ? speed > 60 : Math.max(step, speed) > 25;
    leapFor = fast && !(lenis && lenis.isScrolling === 'smooth') ? 0.25 : Math.max(0, leapFor - dt);
    if (state.leap !== leapFor > 0) {
      state.leap = leapFor > 0;
      root.classList.toggle('leap', state.leap);
      if (!state.leap) {
        settleChapter();
        if (inNote && audio.on) enterNote(); // landed in chapter 2: Lost begins now
      }
    }
    if (state.leap) ScrollTrigger.getAll().forEach((t) => { const tw = t.getTween(); if (tw) tw.progress(1); });
    state.dim += ((state.leap ? 1 : 0) - state.dim) * glide(dt, state.leap ? 0.04 : 0.3);
  };
  const follow = (dt) => {
    leapCheck(dt);
    const k = (seconds) => (state.leap ? 1 : glide(dt, seconds));
    const p = turns.map((t) => ease(t.progress)), pEnd = p[5];
    const tremble = ease(t1.progress) * (1 - p[0]);
    const morph = p.reduce((sum, x) => sum + x, 0);
    state.tremble += (tremble - state.tremble) * k(0.35);
    state.morph += (morph - state.morph) * k(0.65);
    state.walk += (tWalk.progress - state.walk) * k(0.65);
    state.enter += (tEnter.progress - state.enter) * k(0.65);
    state.focus += (ease(tFocus.progress) * (1 - ease(tUnfocus.progress)) - state.focus) * k(0.8);
    state.peaks += (ease(tPeaks.progress) * (1 - p[4]) - state.peaks) * k(0.6);
    // centred at the opening and the end; in between, the camera turns left so the shapes clear the text column
    state.look += (-0.5 * ease(t1.progress) * (1 - pEnd) - state.look) * k(0.7);
    root.style.setProperty('--side', ((-state.look / 0.5) * (1 - state.focus)).toFixed(3));
    root.style.setProperty('--focus', state.focus.toFixed(3));
  };
  gsap.ticker.add((time, deltaMs) => follow(Math.min(0.1, deltaMs / 1000)));

  // Chapters: lines reveal one step at a time (data-stagger, in viewport heights of scroll; a chapter number
  // arrives with the line after it). Photos join at the step named by data-line. A chapter may be split into
  // beats that follow one another; the last chapter keeps its content on screen. Panels that hold controls
  // (the two roads, the project cards) are hidden completely when faded, so they never catch a stray click. A
  // drawing (data-draw) draws itself with the scroll as its beat arrives.
  const last = sections[sections.length - 1];
  sections.slice(1).forEach((sec) => {
    const len = parseFloat(sec.style.getPropertyValue('--len')) || 300;
    const u = (vh) => vh / Math.max(60, len - 100);
    const tl = gsap.timeline({ scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom bottom', scrub: 1.2 } });
    const beats = [...sec.querySelectorAll('.beat')];
    const groups = beats.length ? beats : [sec];
    // beats share the chapter by their data-span (1 each unless set)
    const spans = groups.map((g) => parseFloat(g.dataset.span) || 1);
    const room = (1 - u(sec === last ? 6 : 24)) / spans.reduce((a, b) => a + b, 0);
    const alpha = (el) => (el.matches('.roads-scroll, .detail, .card') ? 'autoAlpha' : 'opacity');
    const fade = (els, at) => els.forEach((el) => tl.to(el, { [alpha(el)]: 0, y: el.classList.contains('photo') ? 0 : -40, duration: u(14), ease: 'power1.in' }, at));
    const shownEls = [];

    let start = 0;
    groups.forEach((g, b) => {
      const slot = spans[b] * room;
      const stagger = u(parseFloat(g.dataset.stagger || sec.dataset.stagger) || 6);
      const lines = [...g.querySelectorAll('.line')];
      let step = 0;
      lines.forEach((line) => {
        gsap.set(line, { [alpha(line)]: 0, y: 40, ...blurIn(8) });
        tl.to(line, { [alpha(line)]: 1, y: 0, ...blurOut, duration: u(22), ease: 'power2.out' }, start + u(4) + step * stagger);
        if (!line.classList.contains('num')) step++;
      });

      g.querySelectorAll('[data-draw]').forEach((el) => {
        gsap.set(el, { '--draw': 0 });
        tl.to(el, { '--draw': 1, duration: u(80), ease: 'none' }, start + u(12));
      });

      const photos = [...g.querySelectorAll('.photo')];
      photos.forEach((ph) => {
        const shown = parseFloat(getComputedStyle(ph).opacity) || 0.6;
        const img = ph.querySelector('img');
        const at = start + u(10) + parseFloat((mobile && ph.dataset.linePhone) || ph.dataset.line || 0) * stagger; // (on a phone it may join another page)
        // the photo comes into focus as its corner marks close in
        gsap.set(ph, { opacity: 0, '--lock': 0, ...blurIn(10) });
        gsap.set(img, { scale: 1.08 });
        tl.to(ph, { opacity: shown, '--lock': 1, ...blurOut, duration: u(26), ease: 'power2.out' }, at)
          .to(img, { scale: 1, duration: 1 - at, ease: 'none' }, at);
      });

      if (b < groups.length - 1) fade([...lines, ...photos], start + slot - u(14));
      else shownEls.push(...lines, ...photos);
      start += slot;
    });

    if (sec !== last) fade(shownEls, 1 - u(18));
    tl.set({}, {}, 1);
  });

  addEventListener('load', () => ScrollTrigger.refresh());
}
