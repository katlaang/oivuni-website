import { createElement, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * Neural-network hero animation.
 *
 * Electrons fire from the input layer (left, "research"), travel through the
 * hidden layers and converge on several output neurons (right, "real-world
 * innovation"). Each output charges independently; when full it releases a
 * nebula shockwave — a ring of soft glowing particles (cream inner edge, orange
 * and red outer shell) that sweeps across the whole hero and dissolves.
 * Bursts are staggered so only one happens at a time.
 *
 * Photosensitivity safeguards (WCAG 2.3.1 / 2.2.2):
 *  - at most one burst every 6 s (limit is 3 flashes per second)
 *  - the shockwave brightens over ~0.6 s and fades over ~3 s; it is a slow,
 *    moving ring with a dark centre — no full-screen flash, no strobing
 *  - visible pause control; choice is remembered per browser
 *  - honours prefers-reduced-motion with a still frame
 *  - pauses off-screen and in background tabs
 */

const ORANGE = '232,80,26';
const HOT = '255,122,69';
const BLUE = '110,180,255'; // electrons and firing neurons
const ICE = '205,232,255';
const STEEL = '214,220,224';
const MIN_BURST_GAP = 6000; // ms between any two bursts
const OUTPUT_COOLDOWN = 1200; // ms an output rests after bursting
const WAVE_EXPAND = 3400; // ms for the shockwave to reach the far corner
const WAVE_LIFE = 5600; // ms until it has fully dissolved

type N = { x: number; y: number; bx: number; by: number; ph: number; layer: number; flash: number };
type Electron = { from: number; to: number; t: number; speed: number };
type Mote = { a: number; off: number; size: number; tone: number; seed: number; bright: number };
type Wave = { x: number; y: number; age: number; reach: number; motes: Mote[] };
type Dust = { x: number; y: number; vx: number; vy: number; a: number };
type Out = { node: number; charge: number; rest: number };

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function layerSizes(compact: boolean) {
  return compact ? [6, 8, 9, 8, 3] : [9, 12, 13, 13, 12, 9, 3];
}

/** Edge-to-edge layout: layers span the full hero height; outputs sit in the middle. */
function buildNetwork(w: number, h: number, compact: boolean, rand: () => number) {
  const sizes = layerSizes(compact);
  const nodes: N[] = [];
  const layers: number[][] = [];
  const x0 = w * 0.012;
  const x1 = w * (compact ? 0.9 : 0.92);
  const last = sizes.length - 1;
  sizes.forEach((count, li) => {
    const ids: number[] = [];
    const x = x0 + ((x1 - x0) * li) / last;
    const span = h * (li === last ? (compact ? 0.6 : 0.62) : 0.97);
    for (let i = 0; i < count; i++) {
      const jitter = li === 0 || li === last ? 0 : (rand() - 0.5) * h * 0.04;
      const y = h / 2 - span / 2 + (span * i) / (count - 1) + jitter;
      const jx = li === 0 || li === last ? 0 : (rand() - 0.5) * w * 0.025;
      ids.push(nodes.length);
      nodes.push({ x: x + jx, y, bx: x + jx, by: y, ph: rand() * Math.PI * 2, layer: li, flash: 0 });
    }
    layers.push(ids);
  });
  return { nodes, layers };
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

function CanvasNetwork({ compact, still }: { compact: boolean; still: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const rand = seeded(11);
    let w = 0, h = 0;
    let nodes: N[] = [];
    let layers: number[][] = [];
    let outs: Out[] = [];
    let electrons: Electron[] = [];
    let waves: Wave[] = [];
    let dust: Dust[] = [];
    let sinceBurst = MIN_BURST_GAP;
    let fireClock = 0;
    let time = 0;
    let raf = 0, running = true, visible = true, last = performance.now();
    const mouse = { x: -9999, y: -9999, on: false };
    const CHARGE_PER_HIT = compact ? 0.16 : 0.11;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ({ nodes, layers } = buildNetwork(w, h, compact, rand));
      outs = layers[layers.length - 1].map((node, i) => ({ node, charge: 0.25 * i, rest: 0 }));
      electrons = []; waves = [];
      const dustCount = Math.round((w * h) / (compact ? 5000 : 6500));
      dust = Array.from({ length: dustCount }, () => ({
        x: rand() * w, y: rand() * h, vx: 0.15 + rand() * 0.35, vy: (rand() - 0.5) * 0.12, a: 0.08 + rand() * 0.22,
      }));
    };

    const outOf = (node: number) => outs.find((o) => o.node === node);

    const emit = (from: number) => {
      const li = nodes[from].layer;
      if (li >= layers.length - 1) return;
      const next = layers[li + 1];
      // Prefer targets close in height so each output gathers its own funnel.
      const sorted = [...next].sort((a, b) => Math.abs(nodes[a].y - nodes[from].y) - Math.abs(nodes[b].y - nodes[from].y));
      const to = sorted[Math.min(sorted.length - 1, Math.floor(Math.pow(rand(), 1.8) * sorted.length))];
      electrons.push({ from, to, t: 0, speed: 0.85 + rand() * 0.6 });
    };

    // Soft bokeh sprites, pre-rendered once per colour.
    const sprite = (rgb: string, rim: boolean) => {
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(48, 48, 0, 48, 48, 48);
      if (rim) {
        grad.addColorStop(0, `rgba(${rgb},0.55)`);
        grad.addColorStop(0.72, `rgba(${rgb},0.75)`);
        grad.addColorStop(0.86, `rgba(${rgb},0.35)`);
      } else {
        grad.addColorStop(0, `rgba(${rgb},1)`);
        grad.addColorStop(0.45, `rgba(${rgb},0.5)`);
      }
      grad.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grad; g.fillRect(0, 0, 96, 96);
      return c;
    };
    // cream (inner edge) → amber → orange → red (outer shell)
    // Full Crab-Nebula palette, inner to outer.
    const tones = [
      sprite('120,210,255', false), sprite('90,160,255', true), // cyan, blue core
      sprite('80,220,200', true), sprite('150,225,140', false), // teal, green
      sprite('235,225,140', true), sprite('255,232,200', false), // gold, cream
      sprite('255,150,70', true), sprite(HOT, false), // amber, orange
      sprite('235,60,35', true), sprite('205,50,120', false), // red, magenta
    ];

    const burst = (o: Out) => {
      const n = nodes[o.node];
      // Reach the farthest corner so the wave sweeps the whole hero.
      const reach = Math.max(Math.hypot(n.x, n.y), Math.hypot(w - n.x, n.y), Math.hypot(n.x, h - n.y), Math.hypot(w - n.x, h - n.y)) * 1.05;
      const MC = compact ? 480 : 950;
      const motes: Mote[] = [];
      for (let i = 0; i < MC; i++) {
        // Gaussian-ish spread around the shell; a few stragglers inside.
        const g = (rand() + rand() + rand() - 1.5) / 1.5;
        const inner = rand() < 0.12;
        const off = inner ? 0.55 + rand() * 0.35 : 1 + g * 0.11;
        // Map distance through the shell onto the palette, with a little mixing.
        const band = Math.max(0, Math.min(1, (off - 0.82) / 0.36)) * 9 + (rand() - 0.5) * 2.2;
        const tone = Math.max(0, Math.min(9, Math.round(band)));
        motes.push({ a: rand() * Math.PI * 2, off, size: 3 + Math.pow(rand(), 1.8) * (compact ? 16 : 26), tone, seed: rand() * 100, bright: 0.5 + rand() * 0.5 });
      }
      waves.push({ x: n.x, y: n.y, age: 0, reach, motes });
      for (const id of layers[layers.length - 2]) nodes[id].flash = Math.max(nodes[id].flash, 0.7);
      o.charge = 0; o.rest = OUTPUT_COOLDOWN + 2000; sinceBurst = 0;
    };

    const step = (dt: number) => {
      time += dt; sinceBurst += dt;

      for (const d of dust) {
        d.x += d.vx * dt * 0.03; d.y += d.vy * dt * 0.03;
        if (d.x > w + 4) { d.x = -4; d.y = rand() * h; }
        if (d.y < -4) d.y = h + 4; else if (d.y > h + 4) d.y = -4;
      }
      for (const n of nodes) {
        n.x = n.bx + Math.sin(time / 2200 + n.ph) * 4;
        n.y = n.by + Math.cos(time / 2700 + n.ph) * 5;
        n.flash = Math.max(0, n.flash - dt / 650);
      }

      fireClock += dt;
      const interval = compact ? 300 : 170;
      while (fireClock > interval) {
        fireClock -= interval;
        const input = layers[0][Math.floor(rand() * layers[0].length)];
        nodes[input].flash = 1;
        emit(input);
      }

      const keep: Electron[] = [];
      const current = electrons;
      electrons = [];
      for (const e of current) {
        const a = nodes[e.from], b = nodes[e.to];
        const len = Math.max(30, Math.hypot(b.x - a.x, b.y - a.y));
        e.t += (dt * 0.15 * e.speed) / len;
        if (e.t < 1) { keep.push(e); continue; }
        nodes[e.to].flash = 1;
        const o = outOf(e.to);
        if (o) { if (o.rest <= 0) o.charge = Math.min(1, o.charge + CHARGE_PER_HIT); }
        else { emit(e.to); if (rand() < 0.06) emit(e.to); }
      }
      electrons = keep.concat(electrons);
      if (electrons.length > 320) electrons = electrons.slice(-320);

      for (const o of outs) o.rest = Math.max(0, o.rest - dt);
      if (sinceBurst >= MIN_BURST_GAP) {
        const ready = outs.filter((o) => o.charge >= 1).sort((a, b) => b.charge - a.charge);
        if (ready.length) burst(ready[0]);
      }

      for (const wv of waves) {
        wv.age += dt;
        // Light up neurons as the wavefront passes over them.
        const R = wv.reach * (1 - Math.pow(1 - Math.min(1, wv.age / WAVE_EXPAND), 2));
        for (const n of nodes) {
          const d = Math.hypot(n.x - wv.x, n.y - wv.y);
          if (Math.abs(d - R) < 14) n.flash = Math.max(n.flash, 0.6);
        }
      }
      waves = waves.filter((wv) => wv.age < WAVE_LIFE);
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Soft glow around each output grows with its charge.
      for (const o of outs) {
        const n = nodes[o.node];
        const gr = Math.max(w, h) * (0.12 + o.charge * 0.14);
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, gr);
        g.addColorStop(0, `rgba(${ORANGE},${0.03 + o.charge * 0.08})`);
        g.addColorStop(1, `rgba(${ORANGE},0)`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }

      for (const d of dust) { ctx.fillStyle = `rgba(${STEEL},${d.a})`; ctx.fillRect(d.x, d.y, 1.2, 1.2); }

      ctx.lineWidth = 1;
      for (let li = 0; li < layers.length - 1; li++) {
        for (const i of layers[li]) for (const j of layers[li + 1]) {
          const a = nodes[i], b = nodes[j];
          let alpha = 0.085;
          if (mouse.on) {
            const md = Math.hypot((a.x + b.x) / 2 - mouse.x, (a.y + b.y) / 2 - mouse.y);
            if (md < 160) alpha += (1 - md / 160) * 0.18;
          }
          const heat = Math.min(a.flash, b.flash);
          ctx.strokeStyle = heat > 0.1 ? `rgba(${BLUE},${alpha + heat * 0.25})` : `rgba(${STEEL},${alpha})`;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }

      for (const e of electrons) {
        const a = nodes[e.from], b = nodes[e.to];
        const x = a.x + (b.x - a.x) * e.t, y = a.y + (b.y - a.y) * e.t;
        const tt = Math.max(0, e.t - 0.18);
        const tx = a.x + (b.x - a.x) * tt, ty = a.y + (b.y - a.y) * tt;
        const tail = ctx.createLinearGradient(tx, ty, x, y);
        tail.addColorStop(0, `rgba(${BLUE},0)`); tail.addColorStop(1, `rgba(${BLUE},0.9)`);
        ctx.strokeStyle = tail; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
        const halo = ctx.createRadialGradient(x, y, 0, x, y, 4.5);
        halo.addColorStop(0, `rgba(${BLUE},0.55)`); halo.addColorStop(1, `rgba(${BLUE},0)`);
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgb(${ICE})`; ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
      }

      for (const n of nodes) {
        const o = outOf(nodes.indexOf(n));
        const c = o ? o.charge : 0;
        const base = o ? 3.5 + c * 3.5 : 1.8;
        if (n.flash > 0.02 || o) {
          const rr = o ? 10 + c * 18 : 3 + n.flash * 8;
          const a = o ? 0.25 + c * 0.45 : 0.5 * n.flash;
          const gl = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, rr);
          const gc = o ? HOT : BLUE;
          gl.addColorStop(0, `rgba(${gc},${a})`); gl.addColorStop(1, `rgba(${gc},0)`);
          ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(n.x, n.y, rr, 0, Math.PI * 2); ctx.fill();
        }
        const lit = n.flash > 0.3 || !!o;
        const lc = o ? HOT : BLUE;
        ctx.strokeStyle = lit ? `rgba(${lc},0.95)` : `rgba(${STEEL},0.45)`;
        ctx.fillStyle = lit ? `rgba(${lc},${o ? 0.6 + c * 0.35 : 0.85})` : '#151515';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(n.x, n.y, base + n.flash * 0.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }

      // Nebula shockwave: haze annulus plus bokeh motes riding the wavefront.
      ctx.globalCompositeOperation = 'lighter';
      for (const wv of waves) {
        const t = wv.age;
        const p = Math.min(1, t / WAVE_EXPAND);
        const R = Math.max(4, wv.reach * (1 - Math.pow(1 - p, 2)));
        const env = Math.min(1, t / 600) * (t < 2400 ? 1 : Math.pow(Math.max(0, 1 - (t - 2400) / (WAVE_LIFE - 2400)), 1.3));
        if (env <= 0) continue;
        const thick = 0.12 + p * 0.08;

        const haze = ctx.createRadialGradient(wv.x, wv.y, R * (1 - thick * 1.6), wv.x, wv.y, R * (1 + thick));
        haze.addColorStop(0, 'rgba(90,170,255,0)');
        haze.addColorStop(0.3, `rgba(100,190,255,${0.18 * env})`);
        haze.addColorStop(0.44, `rgba(80,210,190,${0.16 * env})`);
        haze.addColorStop(0.56, `rgba(220,220,140,${0.2 * env})`);
        haze.addColorStop(0.68, `rgba(255,150,80,${0.28 * env})`);
        haze.addColorStop(0.82, `rgba(230,55,40,${0.28 * env})`);
        haze.addColorStop(0.92, `rgba(190,50,120,${0.14 * env})`);
        haze.addColorStop(1, 'rgba(160,40,120,0)');
        ctx.fillStyle = haze; ctx.fillRect(0, 0, w, h);

        const grow = 0.55 + p * 0.9;
        for (const m of wv.motes) {
          const wob = Math.sin(time * 0.0015 + m.seed) * 0.02;
          const rr = R * (m.off + wob);
          const x = wv.x + Math.cos(m.a) * rr;
          const y = wv.y + Math.sin(m.a) * rr;
          const sz = m.size * grow;
          if (x < -sz || x > w + sz || y < -sz || y > h + sz) continue;
          ctx.globalAlpha = Math.min(1, 0.75 * env * m.bright);
          ctx.drawImage(tones[m.tone], x - sz, y - sz, sz * 2, sz * 2);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    const loop = (now: number) => {
      const dt = Math.min(50, now - last); last = now;
      if (running && visible) { step(dt); draw(); }
      raf = requestAnimationFrame(loop);
    };

    resize();
    if (still) {
      outs.forEach((o, i) => (o.charge = 0.4 + 0.2 * i));
      for (let i = 0; i < 40; i++) emit(Math.floor(rand() * (nodes.length - outs.length)));
      electrons.forEach((e) => (e.t = 0.3 + rand() * 0.6));
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
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
      mouse.on = e.pointerType === 'mouse' && mouse.y > 0 && mouse.y < r.height;
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

function StaticNetwork({ compact }: { compact: boolean }) {
  const { nodes, layers } = buildNetwork(1000, 570, compact, seeded(11));
  const outs = new Set(layers[layers.length - 1]);
  const lines: [N, N][] = [];
  for (let li = 0; li < layers.length - 1; li++)
    for (const i of layers[li]) for (const j of layers[li + 1]) lines.push([nodes[i], nodes[j]]);
  return (
    <Svg width="100%" height="100%" viewBox="0 0 1000 570" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
      <G>{lines.map(([a, b], i) => <Line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={`rgb(${STEEL})`} strokeOpacity={0.1} />)}</G>
      <G>{nodes.map((n, i) => {
        const o = outs.has(i);
        return <Circle key={i} cx={n.x} cy={n.y} r={o ? 7 : 3} fill={o ? `rgb(${HOT})` : '#151515'} stroke={o ? `rgb(${HOT})` : `rgb(${STEEL})`} strokeOpacity={o ? 1 : 0.45} />;
      })}</G>
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
        {web ? <CanvasNetwork compact={compact} still={reduceMotion || userPaused} /> : <StaticNetwork compact={compact} />}
        {/* Light scrim behind the copy column keeps text readable. */}
        <Svg width="100%" height="100%" viewBox="0 0 1000 570" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="textScrim" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#111111" stopOpacity={compact ? '0.55' : '0.45'} />
              <Stop offset={compact ? '85%' : '55%'} stopColor="#111111" stopOpacity={compact ? '0.4' : '0.25'} />
              <Stop offset="100%" stopColor="#111111" stopOpacity="0" />
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
