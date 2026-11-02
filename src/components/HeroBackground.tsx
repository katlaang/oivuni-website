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

    // Dense, anatomically shaped particles, independent of the nebula.
    // The brain never disappears during the slow bloom.
    const rand = seeded(23);
    const brain = buildBrain(compact ? 9000 : 21000, rand);

    const PALETTE = [
      '85,153,255', '120,213,255', '92,224,218',
      '123,220,168', '232,220,140', '255,191,107',
      '255,119,62', '241,78,118', '217,84,200',
      '159,103,240', '105,113,250',
    ];

    // Blurred colour clouds are cached, rather than generating gradients every frame.
    // Each is an irregular group of soft lobes, not a circular shockwave.
    const sprites = PALETTE.map((color) => {
      const sprite = document.createElement('canvas');
      sprite.width = sprite.height = 192;
      const sc = sprite.getContext('2d')!;
      const add = (x: number, y: number, radius: number, opacity: number) => {
        const grad = sc.createRadialGradient(x, y, 0, x, y, radius);
        grad.addColorStop(0, 'rgba(' + color + ',' + opacity + ')');
        grad.addColorStop(0.23, 'rgba(' + color + ',' + opacity * 0.70 + ')');
        grad.addColorStop(0.62, 'rgba(' + color + ',' + opacity * 0.19 + ')');
        grad.addColorStop(1, 'rgba(' + color + ',0)');
        sc.fillStyle = grad;
        sc.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      };
      add(92, 91, 85, 0.50);
      add(65, 113, 52, 0.24);
      add(125, 61, 56, 0.22);
      add(129, 121, 50, 0.20);
      return sprite;
    });

    type Cloud = {
      x: number; y: number; radius: number; opacity: number;
      color: number; phase: number; speed: number;
    };
    const clouds: Cloud[] = Array.from({ length: compact ? 95 : 175 }, (_, i) => {
      const angle = rand() * Math.PI * 2;
      const distance = 0.38 + Math.pow(rand(), 0.73) * 1.52;
      return {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance * 0.83,
        radius: 0.24 + rand() * 0.48,
        opacity: 0.09 + rand() * 0.23,
        color: i % PALETTE.length,
        phase: rand() * Math.PI * 2,
        speed: 0.00004 + rand() * 0.0001,
      };
    });

    const dust = Array.from({ length: compact ? 700 : 1800 }, () => {
      const angle = rand() * Math.PI * 2;
      const radius = 0.55 + Math.pow(rand(), 0.75) * 1.86;
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.83,
        size: 0.45 + rand() * 1.3,
        brightness: 0.12 + rand() * 0.56,
        color: PALETTE[Math.floor(rand() * PALETTE.length)],
        phase: rand() * Math.PI * 2,
        speed: 0.00008 + rand() * 0.00015,
      };
    });

    let w = 0, h = 0, cx = 0, cy = 0, scale = 1;
    let time = 0, raf = 0, visible = true;
    let last = performance.now();
    const pointer = { x: 0.5, active: false };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      w = bounds.width;
      h = bounds.height;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (compact) {
        cx = w * 0.69;
        cy = h * 0.54;
        scale = Math.min(w * 0.43, h * 0.34);
      } else {
        cx = w * 0.65;
        cy = h * 0.52;
        scale = Math.min(w * 0.31, h * 0.49);
      }
    };

    const draw = () => {
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);

      // A long, continuously looping expansion. There is no strobe,
      // no ring, no orbit/path lines, and no abrupt reset.
      const breath = 0.5 - 0.5 * Math.cos((time / 26000) * Math.PI * 2);
      const spread = 0.90 + 0.45 * breath;
      const intensity = 0.86 + 0.43 * breath;

      ctx.globalCompositeOperation = 'screen';
      const backlight = ctx.createRadialGradient(cx, cy, scale * 0.08, cx, cy, scale * 1.85);
      backlight.addColorStop(0, 'rgba(36,86,170,0.16)');
      backlight.addColorStop(0.54, 'rgba(48,79,151,0.09)');
      backlight.addColorStop(1, 'rgba(8,12,29,0)');
      ctx.fillStyle = backlight;
      ctx.fillRect(0, 0, w, h);

      // Layer nebula material behind the recognizable brain silhouette.
      ctx.save();
      for (const cloud of clouds) {
        const dx = Math.sin(time * cloud.speed + cloud.phase) * scale * 0.07;
        const dy = Math.cos(time * cloud.speed * 0.7 + cloud.phase) * scale * 0.05;
        const x = cx + cloud.x * scale * spread + dx;
        const y = cy + cloud.y * scale * spread + dy;
        const r = scale * cloud.radius * (1 + breath * 0.38);
        ctx.globalAlpha = cloud.opacity * intensity;
        ctx.drawImage(sprites[cloud.color], x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();

      // Nebulous dust stays separated: sparks, not connected lines.
      for (const star of dust) {
        const x = cx + star.x * scale * spread +
          Math.sin(time * star.speed + star.phase) * scale * 0.034;
        const y = cy + star.y * scale * spread +
          Math.cos(time * star.speed + star.phase) * scale * 0.026;
        if (x < 0 || x > w || y < 0 || y > h) continue;
        const twinkle = 0.78 + 0.22 * Math.sin(time * 0.0011 + star.phase);
        ctx.fillStyle = 'rgba(' + star.color + ',' +
          Math.min(0.9, star.brightness * twinkle * intensity) + ')';
        ctx.fillRect(x, y, star.size, star.size);
      }

      // Dense surface: existing gyri and cerebellum masks are preserved.
      // Motion is a very small, slow turn, not an explosive disintegration.
      const rot = Math.sin(time * 0.00009) * 0.075 +
        (pointer.active ? (pointer.x - 0.5) * 0.035 : 0);
      const cs = Math.cos(rot), sn = Math.sin(rot);
      ctx.globalCompositeOperation = 'lighter';
      for (const point of brain) {
        const xr = point.x * cs - point.z * sn;
        const zr = point.x * sn + point.z * cs;
        const depth = 0.87 + 0.13 * (1 - (zr + 0.8) / 1.6);
        const x = cx + xr * scale;
        const y = cy + point.y * scale;
        const twinkle = 0.89 + 0.11 * Math.sin(time * 0.0016 + point.sx * 22);
        const alpha = Math.min(1, point.b * depth * twinkle * 1.54);
        ctx.fillStyle = 'rgba(' + point.c + ',' + alpha + ')';
        const size = point.b > 0.85 ? 2.05 : 1.52;
        ctx.fillRect(x, y, size, size);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(50, now - last));
      last = now;
      if (visible && !document.hidden) {
        time += dt;
        draw();
      }
      raf = requestAnimationFrame(tick);
    };
    resize();
    // Reduced motion uses a stable, fully drawn nebula and brain.
    if (still) time = 9000;
    draw();
    if (!still) raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => {
      resize();
      draw();
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      last = performance.now();
    });
    io.observe(canvas);
    const onVisibility = () => { last = performance.now(); };
    document.addEventListener('visibilitychange', onVisibility);
    const onMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.x = (event.clientX - bounds.left) / Math.max(1, bounds.width);
      pointer.active = event.pointerType === 'mouse' &&
        event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    };
    if (!still) window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onMove);
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
