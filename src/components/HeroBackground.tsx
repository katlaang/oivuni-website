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

/**
 * Canvas implementation for the website. Brain geometry uses buildBrain()
 * above; its folds and sulci remain the underlying anatomy.
 * All interaction is observed on window because the canvas sits beneath
 * text and must never intercept headline links or call-to-action buttons.
 */
/**
 * Hero visual v2. The brain's dense anatomical particle layers and the
 * multicolor nebula are rendered into offscreen canvases once at startup.
 * Every animation frame composites only two brain frames and one nebula image.
 * This avoids the expensive per-frame rendering that made hover stutter.
 */
function CanvasBrain({ compact, still }: { compact: boolean; still: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !ctx) return;

    const rand = seeded(87);
    const brain = buildBrain(compact ? 10000 : 25000, rand);
    const colors = [
      '76,148,255', '123,218,255', '107,236,227',
      '159,232,166', '255,225,124', '255,170,78',
      '255,104,58', '249,82,151', '212,94,239', '139,98,255',
    ];

    // Fine blue-white and orange hot nodes. Only sampled once, not each frame.
    const hotNodes = brain.filter((p) => p.b > 0.57 && rand() < 0.018).slice(0, compact ? 90 : 230);
    const sparkSprite = (rgb: string) => {
      const c = document.createElement('canvas');
      c.width = c.height = 80;
      const g = c.getContext('2d')!;
      const glow = g.createRadialGradient(40, 40, 0, 40, 40, 39);
      glow.addColorStop(0, 'rgba(255,248,223,1)');
      glow.addColorStop(0.07, 'rgba(' + rgb + ',0.97)');
      glow.addColorStop(0.23, 'rgba(' + rgb + ',0.5)');
      glow.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, 80, 80);
      return c;
    };
    const orangeSpark = sparkSprite('255,129,59');
    const blueSpark = sparkSprite('119,204,255');

    // The grooved strokes stay *inside* the anatomical shape. These are
    // brain gyri and sulci highlights, not decorative orbit lines.
    const grooves = [
      'M56 137 C85 89 126 67 162 58 C186 50 197 48 216 50',
      'M74 168 C105 147 141 135 156 107 C170 88 173 65 171 43',
      'M90 181 C128 170 153 150 166 126 C182 101 208 86 236 76',
      'M142 200 C164 177 190 170 205 147 C226 115 251 106 284 97',
      'M231 39 C247 65 253 87 273 104 C299 126 319 134 344 132',
      'M276 53 C297 78 304 94 320 109 C341 128 352 145 360 166',
      'M271 154 C305 151 326 166 348 188',
      'M128 212 C167 195 197 190 225 183 C247 177 258 167 274 155',
      'M142 226 C175 215 210 225 236 213',
      'M276 219 C301 211 321 220 343 240',
      'M270 238 C297 233 313 250 333 256',
    ];

    const frameW = 960;
    const frameH = 740;
    const frameScale = 304;
    const frameCX = frameW / 2;
    const frameCY = frameH / 2;

    const renderBrain = (yaw: number) => {
      const c = document.createElement('canvas');
      c.width = frameW;
      c.height = frameH;
      const g = c.getContext('2d')!;
      const cyaw = Math.cos(yaw);
      const syaw = Math.sin(yaw);

      // Local aura makes the brain dimensional without washing out the scene.
      const aura = g.createRadialGradient(frameCX, frameCY, frameScale * 0.15, frameCX, frameCY, frameScale * 1.15);
      aura.addColorStop(0, 'rgba(38,84,153,0.13)');
      aura.addColorStop(1, 'rgba(31,82,157,0)');
      g.fillStyle = aura;
      g.fillRect(0, 0, frameW, frameH);

      // Dense blue particle surface, shaded by depth so the lobes retain shape.
      for (const p of brain) {
        const xr = p.x * cyaw - p.z * syaw;
        const zr = p.x * syaw + p.z * cyaw;
        const depth = 0.69 + 0.31 * (1 - (zr + 0.9) / 1.8);
        const x = frameCX + xr * frameScale;
        const y = frameCY + p.y * frameScale;
        const intensity = Math.min(0.99, (0.22 + p.b * 0.8) * depth);
        const radius = p.b > 0.82 ? 1.7 : p.b > 0.57 ? 1.3 : 0.94;
        g.fillStyle = 'rgba(' + p.c + ',' + intensity + ')';
        g.fillRect(x, y, radius, radius);
      }

      // Soft luminous orange grooves follow the actual drawn surface.
      // The clip ensures not a single stroke escapes into the hero.
      g.save();
      g.translate(frameCX, frameCY);
      g.scale(frameScale / 175 * cyaw, frameScale / 175);
      g.translate(-205 + syaw * 3, -160);
      const brainMask = new Path2D(CEREBRUM + ' ' + TEMPORAL + ' ' + CEREBELLUM);
      g.clip(brainMask);
      g.globalCompositeOperation = 'screen';
      for (let i = 0; i < grooves.length; i++) {
        const path = new Path2D(grooves[i]);
        const warm = i % 4 !== 2;
        g.strokeStyle = warm ? 'rgba(255,101,41,0.48)' : 'rgba(119,211,255,0.44)';
        g.lineWidth = 2.5;
        g.shadowColor = warm ? '#FF793A' : '#59C9FF';
        g.shadowBlur = 8;
        g.stroke(path);
        g.shadowBlur = 1;
        g.strokeStyle = warm ? 'rgba(255,188,105,0.78)' : 'rgba(196,239,255,0.81)';
        g.lineWidth = 0.62;
        g.stroke(path);
      }
      g.restore();

      // Actual bright hot spots are attached to points on the rotating surface.
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < hotNodes.length; i++) {
        const p = hotNodes[i];
        const x = frameCX + (p.x * cyaw - p.z * syaw) * frameScale;
        const y = frameCY + p.y * frameScale;
        const isWarm = i % 3 !== 1;
        const r = isWarm ? 12 : 9;
        g.globalAlpha = isWarm ? 0.62 : 0.44;
        g.drawImage(isWarm ? orangeSpark : blueSpark, x - r / 2, y - r / 2, r, r);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      return c;
    };

    // Nine cached angles give perceptible 3D parallax, without projecting
    // 25,000 vertices on every animation frame.
    const angles = Array.from({ length: 9 }, (_, i) => -0.24 + i * 0.06);
    const frames = angles.map(renderBrain);

    // A painterly nebula texture, with distinct blue/cyan clouds and
    // orange, magenta, violet and gold regions, rather than a pale haze.
    const nebula = document.createElement('canvas');
    nebula.width = 1380;
    nebula.height = 1060;
    const ng = nebula.getContext('2d')!;
    const nCX = nebula.width * 0.5, nCY = nebula.height * 0.5, nS = 333;

    const cloudSprite = (rgb: string) => {
      const c = document.createElement('canvas');
      c.width = c.height = 192;
      const g = c.getContext('2d')!;
      const lobe = (x: number, y: number, r: number, a: number) => {
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
        grad.addColorStop(0.25, 'rgba(' + rgb + ',' + (a * 0.72) + ')');
        grad.addColorStop(0.64, 'rgba(' + rgb + ',' + (a * 0.15) + ')');
        grad.addColorStop(1, 'rgba(' + rgb + ',0)');
        g.fillStyle = grad;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      };
      lobe(93, 96, 90, 0.94);
      lobe(59, 108, 48, 0.40);
      lobe(132, 65, 48, 0.39);
      lobe(130, 131, 45, 0.30);
      return c;
    };
    const cloudSprites = colors.map(cloudSprite);

    // Each plume occupies an asymmetric cloud region, like nebula gas.
    // Avoid rings, geometric arcs, external network lines and starbursts.
    const emitters = [
      { x: -0.92, y: -0.25, dx: -0.54, dy: -0.16, color: 0 },
      { x: -0.48, y: -0.91, dx: -0.31, dy: -0.44, color: 1 },
      { x: 0.24, y: -0.95, dx: 0.27, dy: -0.37, color: 8 },
      { x: 0.92, y: -0.78, dx: 0.57, dy: -0.43, color: 6 },
      { x: 1.07, y: 0.08, dx: 0.64, dy: 0.06, color: 5 },
      { x: 0.89, y: 0.55, dx: 0.49, dy: 0.45, color: 9 },
      { x: 0.23, y: 0.98, dx: 0.19, dy: 0.33, color: 1 },
      { x: -0.65, y: 0.75, dx: -0.44, dy: 0.35, color: 6 },
    ];
    ng.globalCompositeOperation = 'screen';
    for (let i = 0; i < (compact ? 185 : 320); i++) {
      const e = emitters[i % emitters.length];
      const spread = 0.22 + Math.pow(rand(), 0.9) * 1.18;
      const x = nCX + (e.x + e.dx * spread + (rand() - 0.5) * 0.52) * nS;
      const y = nCY + (e.y + e.dy * spread + (rand() - 0.5) * 0.51) * nS;
      const radius = (0.22 + rand() * 0.54) * nS;
      ng.globalAlpha = 0.16 + rand() * 0.40;
      const tint = Math.min(colors.length - 1, Math.max(0, e.color + Math.round((rand() - 0.5) * 3)));
      ng.drawImage(cloudSprites[tint], x - radius, y - radius, radius * 2, radius * 2);
    }

    // Long, softly clustered dust clouds add fine structure to the gas.
    ng.globalCompositeOperation = 'lighter';
    for (let i = 0; i < (compact ? 1900 : 4200); i++) {
      const e = emitters[i % emitters.length];
      const d = Math.pow(rand(), 0.7) * 1.5;
      const x = nCX + (e.x + e.dx * d + (rand() - 0.5) * 0.5) * nS;
      const y = nCY + (e.y + e.dy * d + (rand() - 0.5) * 0.46) * nS;
      const alpha = 0.15 + rand() * 0.63;
      const size = 0.55 + rand() * 1.7;
      const color = colors[Math.min(colors.length - 1, Math.max(0, e.color + Math.round((rand() - 0.5) * 2)))];
      ng.fillStyle = 'rgba(' + color + ',' + alpha + ')';
      ng.fillRect(x, y, size, size);
    }
    ng.globalAlpha = 1;
    ng.globalCompositeOperation = 'source-over';

    let width = 0, height = 0, cx = 0, cy = 0, scale = 1;
    let raf = 0, elapsed = 0, last = performance.now();
    let lastPaint = -100, visible = true;
    let hovered = false, hoverMix = 0, hoverAge = 0, tappedUntil = 0;
    const pointer = { x: 0.5, inside: false };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width; height = rect.height;
      if (!width || !height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (compact) {
        cx = width * 0.69; cy = height * 0.56;
        scale = Math.min(width * 0.43, height * 0.35);
      } else {
        cx = width * 0.65; cy = height * 0.52;
        scale = Math.min(width * 0.31, height * 0.48);
      }
    };

    const hit = (x: number, y: number) => {
      const rect = canvas.getBoundingClientRect();
      const dx = (x - rect.left - cx) / Math.max(1, scale * 1.12);
      const dy = (y - rect.top - cy) / Math.max(1, scale * 0.86);
      return dx * dx + dy * dy < 1;
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointer.x = (event.clientX - canvas.getBoundingClientRect().left) / Math.max(1, width);
      const next = hit(event.clientX, event.clientY);
      if (next && !pointer.inside) hoverAge = 0;
      pointer.inside = next;
      hovered = next;
    };
    const onTouch = (event: PointerEvent) => {
      if (event.pointerType === 'touch' && hit(event.clientX, event.clientY)) {
        hoverAge = 0;
        tappedUntil = performance.now() + 5600;
      }
    };
    const onExit = () => {
      hovered = false;
      pointer.inside = false;
    };

    const ease = (v: number) => {
      const t = Math.max(0, Math.min(1, v));
      return t * t * (3 - 2 * t);
    };

    const draw = () => {
      if (!width || !height) return;
      ctx.clearRect(0, 0, width, height);
      const bloom = ease(hoverAge / 2200);
      const intensity = hoverMix * (0.24 + 0.76 * ease(hoverAge / 1300));

      // Nebula stays nearly absent until the pointer reaches the brain.
      // The whole pre-rendered gas field grows organically behind it.
      if (hoverMix > 0.008) {
        const size = scale * (2.1 + bloom * 2.7);
        const aspect = nebula.width / nebula.height;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = Math.min(0.98, intensity);
        ctx.drawImage(nebula, cx - size * aspect / 2, cy - size / 2, size * aspect, size);
        ctx.restore();
      }

      // Blend two pre-rendered angles to make a gentle, dimensional Y turn.
      // This draws two bitmaps instead of reprojecting 25,000 points.
      const yaw = Math.sin(elapsed * Math.PI * 2 / 21000) * 0.24 +
        (pointer.inside ? (pointer.x - 0.5) * 0.016 : 0);
      const index = Math.max(0, Math.min(frames.length - 1.00001, (yaw + 0.24) / 0.06));
      const lo = Math.floor(index), hi = Math.min(frames.length - 1, lo + 1);
      const frac = index - lo;
      const drawWidth = scale * (frameW / frameScale);
      const drawHeight = scale * (frameH / frameScale);
      const dx = cx - drawWidth / 2, dy = cy - drawHeight / 2;
      ctx.globalAlpha = 1 - frac;
      ctx.drawImage(frames[lo], dx, dy, drawWidth, drawHeight);
      if (hi !== lo && frac > 0.01) {
        ctx.globalAlpha = frac;
        ctx.drawImage(frames[hi], dx, dy, drawWidth, drawHeight);
      }
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(now - last, 60));
      last = now;
      if (visible && !document.hidden) {
        elapsed += dt;
        const active = hovered || now < tappedUntil;
        if (active) hoverAge = Math.min(6500, hoverAge + dt);
        else if (hoverMix < 0.005) hoverAge = 0;
        const timeConstant = active ? 580 : 1800;
        hoverMix += ((active ? 1 : 0) - hoverMix) * (1 - Math.exp(-dt / timeConstant));
        if (now - lastPaint >= 32) {
          draw();
          lastPaint = now;
        }
      }
      raf = requestAnimationFrame(loop);
    };

    resize();
    if (still) {
      elapsed = 4200;
      draw();
    } else {
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerdown', onTouch, { passive: true });
      window.addEventListener('blur', onExit);
      raf = requestAnimationFrame(loop);
      draw();
    }

    const ro = new ResizeObserver(() => { resize(); draw(); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      last = performance.now();
    });
    io.observe(canvas);
    const onVisibility = () => { last = performance.now(); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onTouch);
      window.removeEventListener('blur', onExit);
    };
  }, [compact, still]);

  return createElement('canvas', {
    ref,
    'aria-hidden': true,
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      display: 'block',
      pointerEvents: 'none',
    },
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
