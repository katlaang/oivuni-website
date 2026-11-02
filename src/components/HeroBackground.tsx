import { createElement, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * Hero visual: a richly detailed particle brain wrapped in glowing blue and
 * orange gas. Hovering (or tapping) the brain sets off a multicolour nebula.
 *
 * The brain is a pre-rendered texture (public/brain.webp): shaded, tube-like
 * gyri made of dots, dark sulci with orange veins, ridged cerebellum. It was
 * generated offline from the outlines below so the page does no heavy work.
 *
 * Photosensitivity: nebula brightens and fades over seconds, never strobes;
 * prefers-reduced-motion gets a still frame; pauses off-screen/background.
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

// Glowing spark positions on the texture (fractions of its width/height).
const BRAIN_SPARKS: [number, number][] = [[0.5963, 0.3415], [0.3602, 0.1257], [0.9325, 0.4099], [0.6276, 0.6713], [0.5876, 0.2031], [0.6972, 0.576], [0.1896, 0.4], [0.1633, 0.3981], [0.3101, 0.1297], [0.6644, 0.3164], [0.3277, 0.1401], [0.7764, 0.6435], [0.1666, 0.4553], [0.4381, 0.4787], [0.2216, 0.212], [0.5481, 0.4705], [0.5192, 0.3654], [0.1818, 0.4826], [0.3257, 0.3025], [0.4788, 0.6394], [0.1216, 0.3657], [0.3093, 0.6494], [0.7674, 0.5232], [0.5378, 0.1362], [0.5719, 0.3813], [0.4887, 0.0763], [0.1252, 0.5713], [0.9349, 0.5106], [0.5189, 0.0824], [0.2767, 0.5544]];

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
 * Canvas implementation for the website. The brain is a pre-rendered image and
 * both gas fields are built once into offscreen canvases, so each frame only
 * composites a few bitmaps. Interaction is observed on window because the
 * canvas sits beneath the copy and must never intercept links or buttons.
 */
function CanvasBrain({ compact, still }: { compact: boolean; still: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !ctx) return;

    const rand = seeded(87);
    const colors = [
      '76,148,255', '123,218,255', '107,236,227',
      '159,232,166', '255,225,124', '255,170,78',
      '255,104,58', '249,82,151', '212,94,239', '139,98,255',
    ];

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
    const sparks = BRAIN_SPARKS.map(([u, v], i) => ({ u, v, warm: i % 4 !== 1, phase: rand() * Math.PI * 2, speed: 0.6 + rand() * 0.9 }));

    // Pre-rendered brain texture. Box geometry: 400×300 design units; one
    // "scale" unit is 175 design units; the brain centre sits at (205, 160).
    const brainImg = new Image();
    let brainReady = false;
    brainImg.onload = () => { brainReady = true; draw(); };
    brainImg.src = '/brain.webp';

    // A painterly nebula texture, with distinct blue/cyan clouds and
    // orange, magenta, violet and gold regions, rather than a pale haze.
    const makeGas = (palette: number[], plumes: number, dust: number, jitter = 1) => {
    const nebula = document.createElement('canvas');
    nebula.width = 1380;
    nebula.height = 1060;
    const ng = nebula.getContext('2d')!;
    const nCX = nebula.width * 0.5, nCY = nebula.height * 0.5, nS = 333;
    const pick = (i: number) => palette[Math.max(0, Math.min(palette.length - 1, i))];

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
    if (palette.length === 0) return nebula;

    // Each plume occupies an asymmetric cloud region, like nebula gas.
    // Avoid rings, geometric arcs, external network lines and starbursts.
    const emitters = [
      { x: -0.92, y: -0.25, dx: -0.54, dy: -0.16, color: 0 },
      { x: -0.48, y: -0.91, dx: -0.31, dy: -0.44, color: 1 },
      { x: 0.24, y: -0.95, dx: 0.27, dy: -0.37, color: 2 },
      { x: 0.92, y: -0.78, dx: 0.57, dy: -0.43, color: 3 },
      { x: 1.07, y: 0.08, dx: 0.64, dy: 0.06, color: 4 },
      { x: 0.89, y: 0.55, dx: 0.49, dy: 0.45, color: 5 },
      { x: 0.23, y: 0.98, dx: 0.19, dy: 0.33, color: 6 },
      { x: -0.65, y: 0.75, dx: -0.44, dy: 0.35, color: 7 },
    ];
    ng.globalCompositeOperation = 'screen';
    for (let i = 0; i < plumes; i++) {
      const e = emitters[i % emitters.length];
      const spread = 0.22 + Math.pow(rand(), 0.9) * 1.18;
      const x = nCX + (e.x + e.dx * spread + (rand() - 0.5) * 0.52) * nS;
      const y = nCY + (e.y + e.dy * spread + (rand() - 0.5) * 0.51) * nS;
      const radius = (0.22 + rand() * 0.54) * nS;
      ng.globalAlpha = 0.16 + rand() * 0.40;
      const tint = pick(e.color + Math.round((rand() - 0.5) * 2 * jitter));
      ng.drawImage(cloudSprites[tint], x - radius, y - radius, radius * 2, radius * 2);
    }

    // Long, softly clustered dust clouds add fine structure to the gas.
    ng.globalCompositeOperation = 'lighter';
    for (let i = 0; i < dust; i++) {
      const e = emitters[i % emitters.length];
      const d = Math.pow(rand(), 0.7) * 1.5;
      const x = nCX + (e.x + e.dx * d + (rand() - 0.5) * 0.5) * nS;
      const y = nCY + (e.y + e.dy * d + (rand() - 0.5) * 0.46) * nS;
      const alpha = 0.15 + rand() * 0.63;
      const size = 0.55 + rand() * 1.7;
      const color = colors[pick(e.color + Math.round((rand() - 0.5) * 2 * jitter))];
      ng.fillStyle = 'rgba(' + color + ',' + alpha + ')';
      ng.fillRect(x, y, size, size);
    }
    ng.globalAlpha = 1;
    // Feather the edges so the texture never shows a rectangular boundary.
    ng.globalCompositeOperation = 'destination-in';
    const fadeMask = ng.createRadialGradient(nCX, nCY, nebula.height * 0.2, nCX, nCY, nebula.width * 0.5);
    fadeMask.addColorStop(0, 'rgba(0,0,0,1)');
    fadeMask.addColorStop(0.7, 'rgba(0,0,0,0.85)');
    fadeMask.addColorStop(1, 'rgba(0,0,0,0)');
    ng.fillStyle = fadeMask;
    ng.fillRect(0, 0, nebula.width, nebula.height);
    ng.globalCompositeOperation = 'source-over';
    return nebula;
    };
    // Hover nebula: every colour. Ambient gas: deep blue, cyan and orange only.
    const nebula = makeGas([0, 1, 8, 6, 5, 9, 1, 6], compact ? 185 : 320, compact ? 1900 : 4200);
    // left, top-left, top, top-right, right, bottom-right, bottom, bottom-left
    const ambient = makeGas([0, 1, 6, 6, 5, 0, 1, 0], compact ? 110 : 200, compact ? 1600 : 3600, 0);

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
        cx = width * 0.56; cy = height * 0.6;
        scale = Math.min(width * 0.4, height * 0.3);
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

      const t = elapsed / 1000;
      const aspect = nebula.width / nebula.height;

      // Ambient blue/orange gas, always present, slowly breathing and drifting.
      {
        const size = scale * (2.55 + Math.sin(t * 0.21) * 0.07);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (compact ? 0.3 : 0.42) * (1 - hoverMix * 0.4);
        ctx.translate(cx + Math.sin(t * 0.07) * scale * 0.04, cy + Math.cos(t * 0.05) * scale * 0.03);
        ctx.rotate(Math.sin(t * 0.04) * 0.05);
        ctx.drawImage(ambient, -size * aspect / 2, -size / 2, size * aspect, size);
        ctx.restore();
      }

      // Multicolour nebula blooms out when the pointer reaches the brain.
      if (hoverMix > 0.008) {
        const size = scale * (2.1 + bloom * 2.7);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = Math.min(0.98, intensity);
        ctx.drawImage(nebula, cx - size * aspect / 2, cy - size / 2, size * aspect, size);
        ctx.restore();
      }

      // Brain texture with a gentle breathing float.
      const breathe = 1 + Math.sin(t * 0.9) * 0.006 + hoverMix * 0.015;
      const bw = scale * (400 / 175) * breathe, bh = scale * (300 / 175) * breathe;
      const bx = cx - (205 / 400) * bw + (pointer.inside ? (pointer.x - 0.5) * scale * 0.03 : 0);
      const by = cy - (160 / 300) * bh + Math.sin(t * 0.6) * scale * 0.008;
      if (brainReady) {
        ctx.globalAlpha = compact ? 0.8 : 0.95;
        ctx.drawImage(brainImg, bx, by, bw, bh);
      }

      // Twinkling sparks in the grooves; they flare up with the nebula.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const sp of sparks) {
        const tw = 0.5 + 0.5 * Math.sin(t * sp.speed * 2 + sp.phase);
        const r = (sp.warm ? 14 : 10) * (0.7 + tw * 0.6) * (scale / 300) * (1 + hoverMix * 0.6);
        ctx.globalAlpha = (sp.warm ? 0.75 : 0.55) * (0.35 + 0.65 * tw);
        ctx.drawImage(sp.warm ? orangeSpark : blueSpark, bx + sp.u * bw - r, by + sp.v * bh - r, r * 2, r * 2);
      }
      ctx.restore();
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
