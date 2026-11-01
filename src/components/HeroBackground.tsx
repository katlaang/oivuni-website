import { createElement, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * "Escaping intelligence" hero animation.
 *
 * A dim particle brain slowly turns. Electrons start escaping from it, surge
 * faster and denser, and the brain releases a bright nebula that sweeps across
 * the whole hero. As the nebula clouds thin, the brain reassembles out of the
 * haze, and the cycle starts again (~14 s).
 *
 * The brain is generated procedurally (no image assets).
 *
 * Photosensitivity safeguards (WCAG 2.3.1 / 2.2.2):
 *  - one nebula per ~14 s cycle (limit is 3 flashes per second)
 *  - nebula brightens over ~0.8 s and fades over several seconds; no strobing
 *  - visible pause control; choice remembered per browser
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

type P3 = { x: number; y: number; z: number; c: string; b: number; sx: number; sy: number };
type Streak = { x: number; y: number; dx: number; dy: number; v: number; c: string; w: number };
type Mote = { a: number; off: number; size: number; tone: number; seed: number; bright: number };
type Cloud = { a: number; d: number; r: number; tone: number; seed: number };

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;

/** Point cloud in a side-view brain silhouette (front to the left), with fold texture and depth. */
function buildBrain(count: number, rand: () => number): P3[] {
  const pts: P3[] = [];
  let guard = 0;
  while (pts.length < count && guard++ < count * 40) {
    const x = rand() * 2.1 - 1.05;
    const y = rand() * 1.75 - 0.8;
    const cerebrum = inEllipse(x, y, 0, -0.08, 1, 0.62) && !(x > 0.15 && y > 0.2);
    const temporal = inEllipse(x, y, -0.1, 0.26, 0.56, 0.2);
    const cerebellum = inEllipse(x, y, 0.58, 0.36, 0.34, 0.2);
    const stem = inEllipse(x, y, 0.28, 0.6, 0.1, 0.26);
    if (!(cerebrum || temporal || cerebellum || stem)) continue;

    // Gyri: favour points along wavy fold lines (cerebellum gets finer horizontal folds).
    const fold = cerebellum && !cerebrum
      ? Math.sin(y * 70 + Math.sin(x * 9) * 2)
      : Math.sin(x * 11 + Math.sin(y * 7) * 2.2) * Math.sin(y * 12 + Math.sin(x * 8) * 2);
    if (!stem && Math.abs(fold) > 0.3 && rand() < 0.88) continue;

    // Depth: most points near the surface so the shape reads as solid.
    const half = cerebrum ? 0.72 * Math.sqrt(Math.max(0, 1 - x * x - ((y + 0.08) / 0.62) ** 2)) : stem ? 0.1 : 0.38;
    const z = (rand() < 0.5 ? -1 : 1) * half * (0.7 + 0.3 * rand());

    const r = rand();
    const c = r < 0.06 ? '255,150,90' : r < 0.1 ? '230,120,200' : r < 0.4 ? '150,215,255' : '95,160,255';
    const ang = rand() * Math.PI * 2;
    const sc = 0.4 + rand() * 0.9;
    pts.push({ x, y, z, c, b: 0.35 + rand() * 0.65, sx: Math.cos(ang) * sc, sy: Math.sin(ang) * sc });
  }
  // Outline: a denser rim so the silhouette reads clearly.
  const rim = Math.round(count * 0.18);
  for (let i = 0; i < rim; i++) {
    const t = rand() * Math.PI * 2;
    let x = Math.cos(t), y = -0.08 + Math.sin(t) * 0.62;
    if (x > 0.15 && y > 0.2) { // swap the lower-back arc for the cerebellum's outline
      const u = rand() * Math.PI * 2; x = 0.58 + Math.cos(u) * 0.34; y = 0.36 + Math.sin(u) * 0.2;
      if (y < 0.3) continue;
    }
    const ang = rand() * Math.PI * 2;
    pts.push({ x, y, z: (rand() - 0.5) * 0.25, c: rand() < 0.5 ? '150,215,255' : '95,160,255', b: 0.5 + rand() * 0.5, sx: Math.cos(ang), sy: Math.sin(ang) });
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

const PAUSE_KEY = 'oivuni-hero-paused';
function useUserPaused(): [boolean, (v: boolean) => void] {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    try { if (window.localStorage.getItem(PAUSE_KEY) === '1') setPaused(true); } catch {}
  }, []);
  const set = (v: boolean) => {
    setPaused(v);
    try { window.localStorage.setItem(PAUSE_KEY, v ? '1' : '0'); } catch {}
  };
  return [paused, set];
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
    const brain = buildBrain(compact ? 2800 : 5200, rand);
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
    const bokeh = NEB.map((c, i) => sprite(c, i % 2 === 1));
    const soft = NEB.map((c) => sprite(c, false));

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (compact) { cx = w * 0.5; cy = h * 0.56; S = Math.min(w * 0.46, h * 0.3); }
      else { cx = w * 0.68; cy = h * 0.52; S = Math.min(w * 0.27, h * 0.44); }
      reach = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy)) * 1.05;
    };

    const startNebula = () => {
      motes = [];
      const MC = compact ? 480 : 950;
      for (let i = 0; i < MC; i++) {
        const g = (rand() + rand() + rand() - 1.5) / 1.5;
        const inner = rand() < 0.12;
        const off = inner ? 0.55 + rand() * 0.35 : 1 + g * 0.11;
        const band = Math.max(0, Math.min(1, (off - 0.82) / 0.36)) * 9 + (rand() - 0.5) * 2.2;
        motes.push({ a: rand() * Math.PI * 2, off, size: 3 + Math.pow(rand(), 1.8) * (compact ? 16 : 26), tone: Math.max(0, Math.min(9, Math.round(band))), seed: rand() * 100, bright: 0.55 + rand() * 0.45 });
      }
      clouds = [];
      const CC = compact ? 50 : 90;
      for (let i = 0; i < CC; i++) {
        const d = 0.3 + 0.75 * Math.pow(rand(), 0.8);
        clouds.push({ a: rand() * Math.PI * 2, d, r: (0.1 + rand() * 0.18) * Math.max(w, h), tone: Math.max(0, Math.min(9, Math.round(d * 9 + (rand() - 0.5) * 3))), seed: rand() * 100 });
      }
    };

    const rotation = () => Math.sin(time * 0.00018) * 0.4 + (mouse.on ? (mouse.x - 0.5) * 0.5 : 0);

    // Brain visibility and reassembly through the cycle.
    const brainState = () => {
      if (clock < BURST_AT) return { alpha: 1, gather: 1 };
      if (clock < BURST_AT + 600) return { alpha: 1 - (clock - BURST_AT) / 600, gather: 1 };
      if (clock < REFORM_START) return { alpha: 0, gather: 0 };
      const p = (clock - REFORM_START) / (REFORM_END - REFORM_START);
      return { alpha: smooth(p), gather: ease(p) };
    };

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

      // Brain point cloud — deliberately dim.
      if (ba > 0.01) {
        const th = rotation(), cs = Math.cos(th), sn = Math.sin(th);
        const scatter = (1 - gather) * S * 0.9;
        const dim = (compact ? 0.6 : 0.85) * ba * (1 + surgeP * 0.45);
        for (const p of brain) {
          const xr = p.x * cs - p.z * sn;
          const zr = p.x * sn + p.z * cs;
          const depth = 0.55 + 0.45 * (1 - (zr + 0.8) / 1.6);
          const jitter = surgeP > 0 ? Math.sin(time * 0.02 + p.sx * 50) * surgeP * 1.5 : 0;
          const x = cx + xr * S + p.sx * scatter + jitter;
          const y = cy + p.y * S + p.sy * scatter;
          const twinkle = 0.75 + 0.25 * Math.sin(time * 0.003 + p.sx * 20);
          const a = Math.min(1, p.b * depth * twinkle * dim);
          ctx.fillStyle = `rgba(${p.c},${a})`;
          const sz = p.b > 0.88 ? 2 : 1.3;
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

      // Nebula.
      const t = clock - BURST_AT;
      if (t >= 0 && motes.length) {
        // Core bloom: rises smoothly, then gives way to the expanding wave.
        const core = t < 500 ? smooth(t / 500) : Math.max(0, 1 - (t - 500) / 1600);
        if (core > 0) {
          const R = S * (0.6 + t / 900);
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
          g.addColorStop(0, `rgba(225,240,255,${0.28 * core})`);
          g.addColorStop(0.35, `rgba(120,200,255,${0.18 * core})`);
          g.addColorStop(1, 'rgba(90,160,255,0)');
          ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        }

        // Clouds: billow out across the hero, linger as a haze, then dissolve.
        const cloudEnv = smooth(t / 800) * (t < 3000 ? 1 : Math.pow(Math.max(0, 1 - (t - 3000) / (NEBULA - 3000)), 1.2));
        if (cloudEnv > 0) {
          const spread = ease(t / 2600);
          for (const c of clouds) {
            const d = c.d * reach * 0.85 * spread;
            const x = cx + Math.cos(c.a) * d + Math.sin(time * 0.0004 + c.seed) * 30;
            const y = cy + Math.sin(c.a) * d * 0.8 + Math.cos(time * 0.0003 + c.seed) * 24;
            const r = c.r * (0.4 + 0.6 * spread);
            ctx.globalAlpha = 0.075 * cloudEnv;
            ctx.drawImage(soft[c.tone], x - r, y - r, r * 2, r * 2);
          }
        }

        // Shockwave ring of bokeh — the brightest part, like a cosmic explosion front.
        const p = Math.min(1, t / 3000);
        const R = Math.max(4, reach * (1 - Math.pow(1 - p, 2)));
        const env = smooth(t / 500) * (t < 2400 ? 1 : Math.pow(Math.max(0, 1 - (t - 2400) / 2600), 1.3));
        if (env > 0) {
          ctx.globalAlpha = 1;
          const thick = 0.12 + p * 0.08;
          const haze = ctx.createRadialGradient(cx, cy, R * (1 - thick * 1.6), cx, cy, R * (1 + thick));
          haze.addColorStop(0, 'rgba(90,170,255,0)');
          haze.addColorStop(0.3, `rgba(100,190,255,${0.22 * env})`);
          haze.addColorStop(0.44, `rgba(80,210,190,${0.2 * env})`);
          haze.addColorStop(0.56, `rgba(225,225,150,${0.26 * env})`);
          haze.addColorStop(0.68, `rgba(255,150,80,${0.32 * env})`);
          haze.addColorStop(0.82, `rgba(230,55,40,${0.3 * env})`);
          haze.addColorStop(0.92, `rgba(190,50,120,${0.16 * env})`);
          haze.addColorStop(1, 'rgba(160,40,120,0)');
          ctx.fillStyle = haze; ctx.fillRect(0, 0, w, h);
          const grow = 0.55 + p * 0.9;
          for (const m of motes) {
            const rr = R * (m.off + Math.sin(time * 0.0015 + m.seed) * 0.02);
            const x = cx + Math.cos(m.a) * rr, y = cy + Math.sin(m.a) * rr;
            const sz = m.size * grow;
            if (x < -sz || x > w + sz || y < -sz || y > h + sz) continue;
            ctx.globalAlpha = Math.min(1, 0.85 * env * m.bright);
            ctx.drawImage(bokeh[m.tone], x - sz, y - sz, sz * 2, sz * 2);
          }
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

/** Native: a still of the brain point cloud. */
function StaticBrain({ compact }: { compact: boolean }) {
  const pts = buildBrain(700, seeded(23));
  const cx = compact ? 500 : 680, cy = compact ? 320 : 296, S = compact ? 230 : 250;
  return (
    <Svg width="100%" height="100%" viewBox="0 0 1000 570" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
      <G>{pts.map((p, i) => <Circle key={i} cx={cx + p.x * S} cy={cy + p.y * S} r={1.3} fill={`rgb(${p.c})`} fillOpacity={p.b * 0.55} />)}</G>
    </Svg>
  );
}

function PauseButton({ paused, onPress }: { paused: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={paused ? 'Play background animation' : 'Pause background animation'}
      style={(state) => {
        const st = state as { hovered?: boolean; focused?: boolean };
        return [styles.pause, (st.hovered || st.focused) && styles.pauseActive];
      }}
    >
      <Svg width={12} height={12} viewBox="0 0 12 12">
        {paused ? <Path d="M3 1.5v9l7.5-4.5z" fill="#F4F4F4" /> : <Path d="M3 1.5h2v9H3zM7 1.5h2v9H7z" fill="#F4F4F4" />}
      </Svg>
      <Text style={styles.pauseText}>{paused ? 'Play' : 'Pause'}</Text>
    </Pressable>
  );
}

export function HeroBackground({ compact }: { compact: boolean }) {
  const reduceMotion = usePrefersReducedMotion();
  const [userPaused, setUserPaused] = useUserPaused();
  const web = Platform.OS === 'web';
  return (
    <>
      <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
        {web ? <CanvasBrain compact={compact} still={reduceMotion || userPaused} /> : <StaticBrain compact={compact} />}
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
      {web && !reduceMotion ? <PauseButton paused={userPaused} onPress={() => setUserPaused(!userPaused)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  pause: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(244,244,244,0.25)',
    backgroundColor: 'rgba(17,17,17,0.6)',
  },
  pauseActive: { borderColor: 'rgba(244,244,244,0.7)' },
  pauseText: { color: '#F4F4F4', fontSize: 12, fontFamily: 'Inter_500Medium' },
});
