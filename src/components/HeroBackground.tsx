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
function CanvasBrain({ compact, still }: { compact: boolean; still: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !ctx) return;

    const rand = seeded(27);
    const brain = buildBrain(compact ? 9500 : 23000, rand);

    // Hot nodes follow the rotating brain surface, not the background.
    const hotNodes = brain.filter((p) => p.b > 0.64 && rand() < 0.016).slice(0, compact ? 58 : 155);
    const palette = [
      '84,165,255', '126,218,255', '91,237,227', '117,208,168',
      '238,217,120', '255,173,85', '255,105,62', '245,85,147',
      '216,80,207', '156,95,242', '112,112,247',
    ];

    // Nebula sprites have several offset gas pockets instead of a single
    // radial disc, so the bloom reads as diffuse gas rather than an orbit.
    const makeCloud = (color: string) => {
      const sprite = document.createElement('canvas');
      sprite.width = sprite.height = 180;
      const g = sprite.getContext('2d')!;
      const cloudLobe = (x: number, y: number, r: number, alpha: number) => {
        const gradient = g.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, 'rgba(' + color + ',' + alpha + ')');
        gradient.addColorStop(0.25, 'rgba(' + color + ',' + alpha * 0.76 + ')');
        gradient.addColorStop(0.62, 'rgba(' + color + ',' + alpha * 0.15 + ')');
        gradient.addColorStop(1, 'rgba(' + color + ',0)');
        g.fillStyle = gradient;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      };
      cloudLobe(89, 87, 85, 0.62);
      cloudLobe(55, 111, 46, 0.30);
      cloudLobe(124, 65, 50, 0.24);
      cloudLobe(129, 120, 41, 0.18);
      return sprite;
    };
    const cloudSprites = palette.map(makeCloud);

    const makeSpark = (rgb: string) => {
      const sprite = document.createElement('canvas');
      sprite.width = sprite.height = 64;
      const g = sprite.getContext('2d')!;
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 31);
      grd.addColorStop(0, 'rgba(255,250,234,1)');
      grd.addColorStop(0.12, 'rgba(' + rgb + ',0.94)');
      grd.addColorStop(0.4, 'rgba(' + rgb + ',0.3)');
      grd.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
      return sprite;
    };
    const coolSpark = makeSpark('103,206,255');
    const warmSpark = makeSpark('255,136,69');

    // Emission zones follow actual regions around the silhouette.
    // Different directions and distances avoid a circular shockwave.
    const emitters = [
      { x: -0.89, y: -0.16, dx: -0.98, dy: -0.38 },
      { x: -0.48, y: -0.78, dx: -0.48, dy: -1.00 },
      { x: 0.29, y: -0.83, dx: 0.22, dy: -1.08 },
      { x: 0.86, y: -0.39, dx: 1.07, dy: -0.40 },
      { x: 0.91, y: 0.30, dx: 1.12, dy: 0.54 },
      { x: 0.34, y: 0.72, dx: 0.51, dy: 1.04 },
      { x: -0.53, y: 0.57, dx: -0.62, dy: 0.92 },
    ] as const;

    const clouds = Array.from({ length: compact ? 92 : 166 }, (_, index) => {
      const source = emitters[index % emitters.length];
      return {
        sx: source.x + (rand() - 0.5) * 0.44,
        sy: source.y + (rand() - 0.5) * 0.36,
        dx: source.dx * (0.35 + rand() * 0.86) + (rand() - 0.5) * 0.32,
        dy: source.dy * (0.35 + rand() * 0.86) + (rand() - 0.5) * 0.32,
        radius: 0.22 + rand() * 0.37,
        alpha: 0.11 + rand() * 0.14,
        color: Math.floor(rand() * palette.length),
        phase: rand() * Math.PI * 2,
        speed: 0.000045 + rand() * 0.000105,
      };
    });

    const particles = Array.from({ length: compact ? 600 : 1550 }, (_, index) => {
      const emitter = emitters[index % emitters.length];
      return {
        sx: emitter.x + (rand() - 0.5) * 0.5,
        sy: emitter.y + (rand() - 0.5) * 0.48,
        dx: emitter.dx * (0.35 + rand() * 1.4) + (rand() - 0.5) * 0.6,
        dy: emitter.dy * (0.35 + rand() * 1.4) + (rand() - 0.5) * 0.6,
        color: palette[Math.floor(rand() * palette.length)],
        brightness: 0.24 + rand() * 0.68,
        size: 0.6 + rand() * 1.4,
        phase: rand() * Math.PI * 2,
      };
    });

    let width = 0;
    let height = 0;
    let centerX = 0;
    let centerY = 0;
    let scale = 1;
    let raf = 0;
    let frameTime = performance.now();
    let elapsed = 0;
    let paintedAt = -100;
    let inView = true;
    let hoverTarget = false;
    let hoverStrength = 0;
    let hoverAge = 0;
    let tapUntil = 0;
    const pointer = { x: 0.5, inside: false };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      if (!width || !height) return;
      // Higher DPR helps fine anatomy without using a 4K backing store.
      const pixelRatio = Math.min(window.devicePixelRatio || 1, compact ? 1.5 : 1.75);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      if (compact) {
        centerX = width * 0.69;
        centerY = height * 0.56;
        scale = Math.min(width * 0.43, height * 0.35);
      } else {
        centerX = width * 0.65;
        centerY = height * 0.52;
        scale = Math.min(width * 0.31, height * 0.48);
      }
    };

    // Only the brain is interactive, not the entire hero or its text column.
    const isOverBrain = (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect();
      const dx = (clientX - r.left - centerX) / Math.max(1, scale * 1.04);
      const dy = (clientY - r.top - centerY) / Math.max(1, scale * 0.84);
      return dx * dx + dy * dy < 1;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointer.x = (event.clientX - canvas.getBoundingClientRect().left) / Math.max(1, width);
      const inside = isOverBrain(event.clientX, event.clientY);
      if (inside && !pointer.inside) hoverAge = 0;
      pointer.inside = inside;
      hoverTarget = inside;
    };
    const onPointerDown = (event: PointerEvent) => {
      // Touch users cannot hover. Tapping the brain starts a six-second bloom.
      if (event.pointerType === 'touch' && isOverBrain(event.clientX, event.clientY)) {
        hoverAge = 0;
        tapUntil = performance.now() + 6000;
      }
    };
    const onPointerOut = (event: PointerEvent) => {
      if (!event.relatedTarget) {
        pointer.inside = false;
        hoverTarget = false;
      }
    };

    const smooth = (v: number) => {
      const t = Math.max(0, Math.min(1, v));
      return t * t * (3 - 2 * t);
    };

    const draw = () => {
      if (!width || !height) return;
      ctx.clearRect(0, 0, width, height);

      // Tiny cool aura and orange points are present at idle; large gas
      // plumes stay dark until hovered/tapped.
      const ambient = ctx.createRadialGradient(
        centerX, centerY, scale * 0.08, centerX, centerY, scale * 1.55,
      );
      ambient.addColorStop(0, 'rgba(28,88,177,0.13)');
      ambient.addColorStop(0.5, 'rgba(24,66,146,0.06)');
      ambient.addColorStop(1, 'rgba(7,10,20,0)');
      ctx.fillStyle = ambient;
      ctx.fillRect(centerX - scale * 1.6, centerY - scale * 1.6, scale * 3.2, scale * 3.2);

      const bloom = smooth(hoverAge / 2200);
      const intensity = hoverStrength * (0.28 + 0.72 * smooth(hoverAge / 1150));
      const spread = 0.12 + bloom * 1.18;
      // Cloud layer is BEHIND the brain, preserving the crisp gyri.
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const cloud of clouds) {
        const dx = Math.sin(elapsed * cloud.speed + cloud.phase) * 0.06;
        const dy = Math.cos(elapsed * cloud.speed * 0.75 + cloud.phase) * 0.045;
        const x = centerX + (cloud.sx + cloud.dx * spread + dx) * scale;
        const y = centerY + (cloud.sy + cloud.dy * spread + dy) * scale;
        const radius = scale * cloud.radius * (0.58 + bloom * 1.03);
        // A near-black idle glow avoids the pale wash shown previously.
        ctx.globalAlpha = cloud.alpha * (0.024 + intensity * 1.85);
        ctx.drawImage(cloudSprites[cloud.color], x - radius, y - radius, radius * 2, radius * 2);
      }
      ctx.restore();

      // Scattered multicolor dust diffuses outward with the gas.
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const mote of particles) {
        const x = centerX + (mote.sx + mote.dx * spread) * scale;
        const y = centerY + (mote.sy + mote.dy * spread) * scale;
        if (x < 0 || x > width || y < 0 || y > height) continue;
        const opacity = Math.min(0.8, mote.brightness * (0.07 + intensity * 0.8));
        ctx.fillStyle = 'rgba(' + mote.color + ',' + opacity + ')';
        ctx.fillRect(x, y, mote.size, mote.size);
      }
      ctx.restore();

      // Slow Y-axis rocking with z-parallax, not a flat static silhouette.
      // 0.15 rad is about 8.6 degrees in either direction.
      const yaw = Math.sin(elapsed * (Math.PI * 2 / 19000)) * 0.15 +
        (pointer.inside ? (pointer.x - 0.5) * 0.035 : 0);
      const cos = Math.cos(yaw), sin = Math.sin(yaw);

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (const p of brain) {
        const rotatedX = p.x * cos - p.z * sin;
        const rotatedZ = p.x * sin + p.z * cos;
        const depth = 0.82 + 0.18 * (1 - (rotatedZ + 0.8) / 1.6);
        const alpha = Math.min(0.97, p.b * depth *
          (0.82 + hoverStrength * 0.20) *
          (0.91 + 0.09 * Math.sin(elapsed * 0.0012 + p.sx * 15)));
        const x = centerX + rotatedX * scale;
        const y = centerY + p.y * scale;
        const size = p.b > 0.82 ? 1.85 : p.b > 0.55 ? 1.3 : 1.0;
        ctx.fillStyle = 'rgba(' + p.c + ',' + alpha + ')';
        ctx.fillRect(x, y, size, size);
      }
      ctx.restore();

      // Bright blue/orange energy nodes are attached to the rotating brain.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < hotNodes.length; i++) {
        const p = hotNodes[i];
        const x = centerX + (p.x * cos - p.z * sin) * scale;
        const y = centerY + p.y * scale;
        const isWarm = i % 3 === 0;
        const size = (isWarm ? 13 : 10) * (1 + hoverStrength * 0.34);
        ctx.globalAlpha = (isWarm ? 0.32 : 0.27) +
          hoverStrength * (isWarm ? 0.38 : 0.24);
        ctx.drawImage(
          isWarm ? warmSpark : coolSpark,
          x - size * 0.5, y - size * 0.5, size, size,
        );
      }
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      const dt = Math.min(60, Math.max(0, now - frameTime));
      frameTime = now;
      if (inView && !document.hidden) {
        elapsed += dt;
        const active = hoverTarget || now < tapUntil;
        if (active) {
          hoverAge = Math.min(6800, hoverAge + dt);
        } else if (hoverStrength < 0.018) {
          hoverAge = 0;
        }
        // 0.5 s to charge, 2.2 s to release, with smooth exponential easing.
        const response = active ? 480 : 2200;
        hoverStrength += ((active ? 1 : 0) - hoverStrength) *
          (1 - Math.exp(-dt / response));

        // Draw at up to 30 fps to keep the particle brain manageable.
        if (now - paintedAt >= 32) {
          draw();
          paintedAt = now;
        }
      }
      raf = window.requestAnimationFrame(tick);
    };

    resize();
    draw();
    if (!still) {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerdown', onPointerDown, { passive: true });
      window.addEventListener('pointerout', onPointerOut);
      raf = window.requestAnimationFrame(tick);
    }

    const resizeObserver = new ResizeObserver(() => { resize(); draw(); });
    resizeObserver.observe(canvas);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      frameTime = performance.now();
    });
    visibilityObserver.observe(canvas);
    const tabChanged = () => { frameTime = performance.now(); };
    document.addEventListener('visibilitychange', tabChanged);

    return () => {
      window.cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener('visibilitychange', tabChanged);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerout', onPointerOut);
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
