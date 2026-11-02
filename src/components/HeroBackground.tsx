import { createElement, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * "Escaping intelligence" hero animation.
 *
 * A dim particle brain slowly turns. Electrons start escaping from it, surge
 * faster and denser, and the brain releases a bright nebula that sweeps across
 * the whole hero. As the nebula clouds thin, the brain reassembles out of the
 * haze, and the cycle starts again (~14 s).
 *
 * The brain is drawn from vector outlines (lobes, cerebellum, brainstem, fissures)
 * and sampled into points along the outline and the meandering gyri.
 *
 * Photosensitivity safeguards (WCAG 2.3.1 / 2.2.2):
 *  - one nebula per ~14 s cycle (limit is 3 flashes per second)
 *  - nebula brightens over ~0.8 s and fades over several seconds; no strobing
 *  - honours prefers-reduced-motion with a still frame
 *  - pauses off-screen and in background tabs
 */

const CALM = 4500;
const SURGE = 3000;
const NEBULA = 6800;
const CYCLE = CALM + SURGE + NEBULA;
const BURST_AT = CALM + SURGE;
const REFORM_START = BURST_AT + 3400; // brain begins to re-emerge from the clouds
const REFORM_END = BURST_AT + 6400;

// Crab-Nebula palette, inner to outer.
const NEB = ['120,210,255', '90,160,255', '80,220,200', '150,225,140', '235,225,140', '255,232,200', '255,150,70', '255,122,69', '235,60,35', '205,50,120'];

type Streak = { x: number; y: number; dx: number; dy: number; v: number; c: string; w: number };
type Mote = { a: number; off: number; size: number; tone: number; seed: number; bright: number };
type Cloud = { a: number; d: number; r: number; tone: number; seed: number };

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// Side-view brain (front to the left), drawn in a 400×300 box.
const CEREBRUM =
  'M78 196 C52 186 38 160 42 132 C44 104 58 82 80 68 C96 50 118 38 142 34 C160 24 186 20 208 24 ' +
  'C230 16 258 18 278 28 C302 30 326 42 342 60 C360 76 372 98 374 122 C380 146 374 170 360 186 ' +
  'C352 198 338 206 322 208 C300 206 280 200 262 196 C246 204 228 210 208 212 C186 220 160 222 138 216 ' +
  'C116 214 96 208 78 196 Z';
const TEMPORAL =
  'M112 206 C138 192 176 184 214 184 C240 184 258 190 266 200 C262 220 246 236 222 242 ' +
  'C196 248 166 244 144 236 C126 230 114 220 112 206 Z';
const CEREBELLUM =
  'M262 204 C282 196 312 196 334 204 C352 212 360 228 354 244 C346 260 324 270 300 268 ' +
  'C278 266 262 256 256 240 C252 226 254 212 262 204 Z';
const STEM = 'M224 236 C236 238 248 240 256 244 C254 262 250 282 246 298 L226 298 C226 280 226 258 224 236 Z';
const SULCI = [
  'M116 212 C146 198 184 190 222 186 C242 182 258 172 272 156', // lateral (Sylvian) fissure
  'M226 24 C216 46 230 66 216 92 C204 114 218 134 204 156 C196 168 194 178 192 186', // central sulcus
];

type BrainPoint = { x: number; y: number; z: number; c: string; b: number; sx: number; sy: number };

/** Gradient noise with a seeded permutation table. */
function makeNoise(rand: () => number) {
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h: number, x: number, y: number) => {
    const a = (h & 7) * (Math.PI / 4);
    return Math.cos(a) * x + Math.sin(a) * y;
  };
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x: number, y: number) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1], ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
    const x1 = grad(aa, xf, yf) + u * (grad(ba, xf - 1, yf) - grad(aa, xf, yf));
    const x2 = grad(ab, xf, yf - 1) + u * (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1));
    return x1 + v * (x2 - x1);
  };
}

/**
 * Build the brain as a shaded surface, then sample points from it:
 * rounded gyri are bright and dense, sulci (grooves) are dark gaps, the
 * fissures separate the lobes, and a soft rim glow defines the silhouette.
 */
function buildBrain(count: number, rand: () => number): BrainPoint[] {
  const W = 400, H = 300;
  const layer = (draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineJoin = 'round'; g.lineCap = 'round';
    draw(g);
    const d = g.getImageData(0, 0, W, H).data;
    return (x: number, y: number) => d[((y | 0) * W + (x | 0)) * 4 + 3] / 255;
  };
  const cere = layer((g) => { g.fill(new Path2D(CEREBRUM)); g.fill(new Path2D(TEMPORAL)); });
  const cbl = layer((g) => g.fill(new Path2D(CEREBELLUM)));
  const stem = layer((g) => g.fill(new Path2D(STEM)));
  const fiss = layer((g) => {
    g.filter = 'blur(1.5px)';
    g.lineWidth = 6; g.stroke(new Path2D(SULCI[0]));
    g.lineWidth = 3.5; g.stroke(new Path2D(SULCI[1]));
  });
  const gap = layer((g) => { g.filter = 'blur(1.5px)'; g.lineWidth = 4; g.stroke(new Path2D(CEREBELLUM)); });
  const inner = layer((g) => { g.filter = 'blur(5px)'; g.fill(new Path2D(CEREBRUM)); g.fill(new Path2D(TEMPORAL)); g.fill(new Path2D(CEREBELLUM)); });

  const n1 = makeNoise(rand), n2 = makeNoise(rand), n3 = makeNoise(rand);
  // Gyri: ridged, domain-warped noise gives worm-like folds, oriented roughly
  // perpendicular to the crown and along the temporal lobe lower down.
  const gyri = (x: number, y: number) => {
    const wx = n2(x * 0.02, y * 0.02) * 1.6, wy = n3(x * 0.02 + 7, y * 0.02 + 3) * 1.6;
    const ny = (y - 30) / 190;
    const sx = 0.05 * (1.25 - 0.5 * ny), sy = 0.05 * (0.75 + 0.5 * ny);
    const v = Math.abs(n1(x * sx + wx, y * sy + wy));
    return Math.min(1, Math.max(0, (v - 0.03) / 0.2));
  };
  const folia = (x: number, y: number) => {
    const v = Math.abs(Math.sin(y * 0.75 + n1(x * 0.03, y * 0.03) * 2.4 + Math.sin(x * 0.045) * 2.2));
    return Math.min(1, Math.max(0, (v - 0.12) / 0.6));
  };
  const lum = (x: number, y: number) => {
    const inC = cere(x, y) >= 0.5, inB = cbl(x, y) >= 0.5, inS = stem(x, y) >= 0.5;
    if (!inC && !inB && !inS) return 0;
    const edge = 1 - inner(x, y);
    let l = inC ? gyri(x, y) * (1 - fiss(x, y) * 0.95) : inB ? folia(x, y) * 0.9 * (1 - gap(x, y) * 0.95) : 0.5;
    const light = 0.6 + 0.4 * (1 - y / H);
    const rim = Math.min(1, Math.max(0, (edge - 0.12) / 0.38));
    l = l * light * (0.75 + 0.25 * (1 - edge)) + rim * 0.55 * (0.6 + 0.4 * light) * (inC || inB ? 1 : 0.4);
    return Math.min(1, l);
  };

  const pts: BrainPoint[] = [];
  let guard = 0;
  while (pts.length < count && guard++ < count * 80) {
    const x = rand() * W, y = rand() * H;
    const L = lum(x, y);
    if (L <= 0 || rand() > Math.pow(L, 1.3) * 0.95 + 0.01) continue;
    const nx = (x - 205) / 175, ny = (y - 160) / 175;
    const half = 0.6 * Math.sqrt(Math.max(0, 1 - nx * nx - (ny * 1.4) ** 2)) + 0.06;
    const z = (rand() - 0.5) * 2 * half;
    const r = rand();
    const c = r < 0.04 ? '255,150,90' : r < 0.07 ? '230,120,200' : L > 0.7 ? '175,225,255' : r < 0.5 ? '130,200,255' : '90,155,255';
    const ang = rand() * Math.PI * 2, sc = 0.4 + rand() * 0.9;
    pts.push({ x: nx, y: ny, z, c, b: 0.25 + 0.75 * L, sx: Math.cos(ang) * sc, sy: Math.sin(ang) * sc });
  }
  return pts;
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia) {
      const m = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReduce(m.matches);
      const on = (e: MediaQueryListEvent) => setReduce(e.matches);
      m.addEventListener('change', on);
      return () => m.removeEventListener('change', on);
    }
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduce(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { alive = false; sub.remove(); };
  }, []);
  return reduce;
}

const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const smooth = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

function CanvasBrain({ compact, still }: { compact: boolean; still: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const rand = seeded(23);
    const brain = buildBrain(compact ? 8500 : 18500, rand);
    let w = 0, h = 0, cx = 0, cy = 0, S = 1;
    let streaks: Streak[] = [];
    let motes: Mote[] = [];
    let clouds: Cloud[] = [];
    let reach = 1;
    let clock = 0; // position in the cycle
    let time = 0;
    let spawnAcc = 0;
    let raf = 0, running = true, visible = true, last = performance.now();
    const mouse = { x: 0.5, on: false };

    const sprite = (rgb: string, rim: boolean) => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      if (rim) {
        grad.addColorStop(0, `rgba(${rgb},0.5)`);
        grad.addColorStop(0.72, `rgba(${rgb},0.8)`);
        grad.addColorStop(0.86, `rgba(${rgb},0.35)`);
      } else {
        grad.addColorStop(0, `rgba(${rgb},1)`);
        grad.addColorStop(0.45, `rgba(${rgb},0.5)`);
      }
      grad.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
      return c;
    };
    const soft = NEB.map((c) => sprite(c, false));
    // Precompute a deterministic cloud of dust points once per mount.
    const dust = Array.from({ length: compact ? 470 : 1000 }, () => {
      const a = rand() * Math.PI * 2;
      const r = 0.88 + Math.pow(rand(), 0.7) * 1.1;
      return {
        x: Math.cos(a) * r,
        y: Math.sin(a) * r * 0.78,
        size: 0.55 + rand() * 1.65,
        alpha: 0.08 + rand() * 0.54,
        color: rand() < 0.24 ? '255,153,83' : rand() < 0.15 ? '225,237,255' : '112,181,255',
        phase: rand() * Math.PI * 2,
        speed: 0.00012 + rand() * 0.00027,
      };
    });

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (compact) { cx = w * 0.5; cy = h * 0.56; S = Math.min(w * 0.46, h * 0.3); }
      else { cx = w * 0.6; cy = h * 0.52; S = Math.min(w * 0.3, h * 0.48); }
      reach = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy)) * 1.05;
    };

    const startNebula = () => {
      motes = [];
      const MC = compact ? 280 : 550;
      for (let i = 0; i < MC; i++) {
        const g = (rand() + rand() + rand() - 1.5) / 1.5;
        const inner = rand() < 0.12;
        const off = inner ? 0.55 + rand() * 0.35 : 1 + g * 0.11;
        const band = Math.max(0, Math.min(1, (off - 0.82) / 0.36)) * 9 + (rand() - 0.5) * 2.2;
        motes.push({ a: rand() * Math.PI * 2, off, size: 3 + Math.pow(rand(), 1.8) * (compact ? 16 : 26), tone: Math.max(0, Math.min(9, Math.round(band))), seed: rand() * 100, bright: 0.55 + rand() * 0.45 });
      }
      clouds = [];
      const CC = compact ? 80 : 135;
      for (let i = 0; i < CC; i++) {
        const d = 0.3 + 0.75 * Math.pow(rand(), 0.8);
        clouds.push({ a: rand() * Math.PI * 2, d, r: (0.1 + rand() * 0.18) * Math.max(w, h), tone: Math.max(0, Math.min(9, Math.round(d * 9 + (rand() - 0.5) * 3))), seed: rand() * 100 });
      }
    };

    const rotation = () => Math.sin(time * 0.00012) * 0.095 + (mouse.on ? (mouse.x - 0.5) * 0.05 : 0);

    // The approved composition retains a fully formed brain throughout the
    // cycle. The surrounding nebula breathes; it never replaces the brain.
    const brainState = () => ({ alpha: 1, gather: 1 });

    const step = (dt: number) => {
      time += dt;
      const prev = clock;
      clock = (clock + dt) % CYCLE;
      if (prev < BURST_AT && clock >= BURST_AT) startNebula();

      // Electrons escaping: a trickle while calm, surging just before the burst.
      let rate = 3; // per second
      if (clock >= CALM && clock < BURST_AT) rate = 3 + 85 * Math.pow((clock - CALM) / SURGE, 2);
      else if (clock >= BURST_AT && clock < BURST_AT + 400) rate = 140;
      else if (clock >= BURST_AT + 400 && clock < REFORM_END) rate = 0;
      if (compact) rate *= 0.55;
      spawnAcc += (rate * dt) / 1000;
      const th = rotation(), cs = Math.cos(th), sn = Math.sin(th);
      while (spawnAcc >= 1) {
        spawnAcc -= 1;
        const p = brain[Math.floor(rand() * brain.length)];
        const px = cx + (p.x * cs - p.z * sn) * S, py = cy + p.y * S;
        let dx = px - cx, dy = py - cy;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        const surge = clock >= CALM && clock < BURST_AT + 400;
        streaks.push({
          x: px, y: py, dx, dy,
          v: surge ? 0.12 + rand() * 0.2 : 0.04 + rand() * 0.06,
          c: rand() < 0.82 ? (rand() < 0.5 ? '110,180,255' : '160,215,255') : '255,140,80',
          w: 0.6 + rand() * 0.9,
        });
      }
      for (const s of streaks) {
        s.v *= Math.pow(1.0022, dt);
        s.x += s.dx * s.v * dt; s.y += s.dy * s.v * dt;
      }
      streaks = streaks.filter((s) => s.x > -200 && s.x < w + 200 && s.y > -200 && s.y < h + 200);
      if (streaks.length > 900) streaks = streaks.slice(-900);
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';

      const surgeP = clock >= CALM && clock < BURST_AT ? (clock - CALM) / SURGE : 0;
      const { alpha: ba, gather } = brainState();

      // Faint aura behind the brain.
      if (ba > 0) {
        const aura = ctx.createRadialGradient(cx, cy, 0, cx, cy, S * 1.5);
        aura.addColorStop(0, `rgba(70,130,255,${(0.07 + surgeP * 0.12) * ba})`);
        aura.addColorStop(1, 'rgba(70,130,255,0)');
        ctx.fillStyle = aura; ctx.fillRect(0, 0, w, h);
      }

      // Dense luminous neural structure with dark sulci for anatomical clarity.
      if (ba > 0.01) {
        const th = rotation(), cs = Math.cos(th), sn = Math.sin(th);
        const scatter = (1 - gather) * S * 0.9;
        const dim = (compact ? 1.18 : 1.48) * ba * (1 + surgeP * 0.12);
        for (const p of brain) {
          const xr = p.x * cs - p.z * sn;
          const zr = p.x * sn + p.z * cs;
          const depth = 0.78 + 0.22 * (1 - (zr + 0.8) / 1.6);
          const jitter = surgeP > 0 ? Math.sin(time * 0.02 + p.sx * 50) * surgeP * 1.5 : 0;
          const x = cx + xr * S + p.sx * scatter + jitter;
          const y = cy + p.y * S + p.sy * scatter;
          const twinkle = 0.85 + 0.15 * Math.sin(time * 0.003 + p.sx * 20);
          const a = Math.min(1, p.b * depth * twinkle * dim);
          ctx.fillStyle = `rgba(${p.c},${a})`;
          const sz = p.b > 0.85 ? 2.1 : 1.45;
          ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
        }
      }

      // Escaping electrons: light streaks that lengthen as they accelerate.
      for (const s of streaks) {
        const len = Math.min(140, s.v * 160);
        const g = ctx.createLinearGradient(s.x - s.dx * len, s.y - s.dy * len, s.x, s.y);
        g.addColorStop(0, `rgba(${s.c},0)`);
        g.addColorStop(1, `rgba(${s.c},0.75)`);
        ctx.strokeStyle = g; ctx.lineWidth = s.w;
        ctx.beginPath(); ctx.moveTo(s.x - s.dx * len, s.y - s.dy * len); ctx.lineTo(s.x, s.y); ctx.stroke();
      }

      // A continuous, slowly breathing nebula. Gas clouds wrap around the brain
      // instead of forming an expanding circular shockwave.
      const t = clock - BURST_AT;
      const burst = t < 0 ? 0 : smooth(t / 1400) *
        (1 - smooth((t - 2900) / (NEBULA - 2900)));
      const breath = 0.88 + 0.12 * Math.sin(time * 0.00032);
      const haze = [
        { x: -1.02, y: 0.62, r: 0.74, c: '35,104,220', a: 0.10 },
        { x: -0.65, y: -0.92, r: 0.82, c: '35,116,235', a: 0.11 },
        { x: 0.12, y: -1.06, r: 0.84, c: '72,149,255', a: 0.13 },
        { x: 0.96, y: -0.94, r: 0.73, c: '243,100,40', a: 0.18 },
        { x: 1.40, y: -0.34, r: 0.76, c: '255,119,45', a: 0.16 },
        { x: 1.27, y: 0.42, r: 0.86, c: '70,130,245', a: 0.13 },
        { x: 0.56, y: 1.02, r: 0.77, c: '242,95,42', a: 0.13 },
        { x: -0.46, y: 0.94, r: 0.87, c: '55,132,240', a: 0.12 },
      ];
      for (const c of haze) {
        const x = cx + c.x * S + Math.sin(time * 0.00012 + c.x * 2) * S * 0.055;
        const y = cy + c.y * S + Math.cos(time * 0.00013 + c.y * 2) * S * 0.043;
        const r = S * c.r * (1 + burst * 0.36);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(' + c.c + ',' + (c.a * (breath + burst * 1.1)) + ')');
        g.addColorStop(0.38, 'rgba(' + c.c + ',' + (c.a * 0.45 * (breath + burst)) + ')');
        g.addColorStop(1, 'rgba(' + c.c + ',0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      }

      // Strands of ionized dust weave around the lobes, echoing the accepted
      // blue-white and orange nebula reference without covering the headline.
      const filaments = [
        { c: '110,199,255', a: 0.48, w: 1.4, p: [-1.36,-0.22,-0.76,-1.46,0.53,-1.28,1.52,-0.62] },
        { c: '255,129,61', a: 0.46, w: 1.65, p: [-1.28,0.62,-0.58,0.96,0.35,1.37,1.80,0.42] },
        { c: '114,189,255', a: 0.42, w: 1.1, p: [-0.82,-1.08,0.09,-1.56,1.05,-1.08,1.73,-0.92] },
        { c: '255,153,83', a: 0.33, w: 1.2, p: [0.12,1.12,0.83,0.85,1.50,0.99,1.81,0.35] },
        { c: '97,165,255', a: 0.38, w: 1.3, p: [-1.53,0.38,-0.83,0.86,0.38,-0.92,1.48,-0.32] },
      ];
      ctx.save();
      for (let i = 0; i < filaments.length; i++) {
        const f = filaments[i];
        const o = Math.sin(time * 0.00023 + i * 2) * S * 0.045;
        ctx.beginPath();
        ctx.moveTo(cx + f.p[0] * S, cy + f.p[1] * S);
        ctx.bezierCurveTo(
          cx + f.p[2] * S + o, cy + f.p[3] * S,
          cx + f.p[4] * S - o, cy + f.p[5] * S,
          cx + f.p[6] * S, cy + f.p[7] * S,
        );
        ctx.strokeStyle = 'rgba(' + f.c + ',' + (f.a * (breath + burst * 0.8)) + ')';
        ctx.lineWidth = f.w;
        ctx.shadowColor = 'rgb(' + f.c + ')';
        ctx.shadowBlur = 10 + burst * 16;
        ctx.stroke();
      }
      ctx.restore();

      // Star-like particles make the cloud read as fine cosmic dust.
      for (const d of dust) {
        const x = cx + d.x * S + Math.sin(time * d.speed + d.phase) * S * 0.04;
        const y = cy + d.y * S + Math.cos(time * d.speed * 0.9 + d.phase) * S * 0.04;
        if (x < 0 || x > w || y < 0 || y > h) continue;
        const bright = d.alpha * (0.75 + 0.25 * Math.sin(time * 0.0015 + d.phase));
        ctx.fillStyle = 'rgba(' + d.color + ',' + (bright * (1 + burst * 0.55)) + ')';
        ctx.fillRect(x, y, d.size, d.size);
      }

      if (t >= 0 && motes.length) {
        const cloudEnv = burst * 0.58;
        const spread = 0.65 + smooth(t / 5000) * 0.55;
        for (const c of clouds) {
          const r = c.r * 0.68;
          const x = cx + Math.cos(c.a) * c.d * S * spread * 1.34;
          const y = cy + Math.sin(c.a) * c.d * S * spread * 0.95;
          ctx.globalAlpha = cloudEnv * 0.32;
          ctx.drawImage(soft[c.tone], x - r, y - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
    };

    const loop = (now: number) => {
      const dt = Math.min(50, now - last); last = now;
      if (running && visible) { step(dt); draw(); }
      raf = requestAnimationFrame(loop);
    };

    resize();
    if (still) {
      // Still frame: the brain with a light spray of escaping electrons.
      clock = CALM + SURGE * 0.35;
      for (let i = 0; i < 90; i++) step(16);
      draw();
    } else raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => { resize(); if (still) draw(); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; last = performance.now(); });
    io.observe(canvas);
    const onVis = () => { running = !document.hidden; last = performance.now(); };
    document.addEventListener('visibilitychange', onVis);
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) / r.width;
      mouse.on = e.pointerType === 'mouse' && e.clientY > r.top && e.clientY < r.bottom;
    };
    if (!still) window.addEventListener('pointermove', onMove, { passive: true });

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
    };
  }, [compact, still]);

  return createElement('canvas', {
    ref,
    'aria-hidden': true,
    style: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none' },
  });
}

/** Native: the brain outline as a still. */
function StaticBrain({ compact }: { compact: boolean }) {
  return (
    <Svg width="100%" height="100%" viewBox={compact ? '-100 -60 600 420' : '-520 -40 960 440'} preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
      <G fill="none" stroke="rgb(110,170,255)" strokeOpacity={0.45} strokeWidth={1.5}>
        {[CEREBRUM, TEMPORAL, CEREBELLUM, STEM, ...SULCI].map((d, i) => <Path key={i} d={d} />)}
      </G>
    </Svg>
  );
}

export function HeroBackground({ compact }: { compact: boolean }) {
  const reduceMotion = usePrefersReducedMotion();
  const web = Platform.OS === 'web';
  return (
    <>
      <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
        {web ? <CanvasBrain compact={compact} still={reduceMotion} /> : <StaticBrain compact={compact} />}
        {/* Scrim behind the copy column keeps text readable even at the nebula's peak. */}
        <Svg width="100%" height="100%" viewBox="0 0 1000 570" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="textScrim" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#0B0B0D" stopOpacity={compact ? '0.6' : '0.55'} />
              <Stop offset={compact ? '85%' : '50%'} stopColor="#0B0B0D" stopOpacity={compact ? '0.45' : '0.3'} />
              <Stop offset="100%" stopColor="#0B0B0D" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect width="1000" height="570" fill="url(#textScrim)" />
        </Svg>
      </View>
    </>
  );
}
