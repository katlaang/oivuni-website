import { createElement, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * Neural-network hero animation.
 *
 * Electrons fire from the input layer (left, "research"), travel through the
 * hidden layers and converge on a single output node (right, "real-world
 * innovation"). The output charges up, bursts, sends a shockwave back through
 * the network, settles, and the cycle starts again.
 *
 * Web: canvas, paused off-screen and in background tabs.
 * Reduced motion: one still frame. Native: static SVG of the network.
 */

const ORANGE = '232,80,26';
const HOT = '255,122,69';
const STEEL = '214,220,224';

type N = { x: number; y: number; bx: number; by: number; ph: number; layer: number; flash: number };
type Electron = { from: number; to: number; t: number; speed: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number };
type Dust = { x: number; y: number; vx: number; vy: number; a: number };

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function layerSizes(compact: boolean) {
  return compact ? [5, 6, 6, 4, 1] : [7, 9, 10, 9, 6, 3, 1];
}

function buildNetwork(w: number, h: number, compact: boolean, rand: () => number) {
  const sizes = layerSizes(compact);
  const nodes: N[] = [];
  const layers: number[][] = [];
  const x0 = w * (compact ? 0.08 : 0.05);
  const x1 = w * (compact ? 0.86 : 0.86);
  sizes.forEach((count, li) => {
    const ids: number[] = [];
    const x = x0 + ((x1 - x0) * li) / (sizes.length - 1);
    const span = h * (count === 1 ? 0 : Math.min(0.82, 0.18 + count * 0.085));
    for (let i = 0; i < count; i++) {
      const y = h / 2 + (count === 1 ? 0 : -span / 2 + (span * i) / (count - 1)) + (rand() - 0.5) * h * 0.05;
      const jx = li === 0 || li === sizes.length - 1 ? 0 : (rand() - 0.5) * w * 0.03;
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
    let electrons: Electron[] = [];
    let sparks: Spark[] = [];
    let dust: Dust[] = [];
    let rings: { r: number; a: number; speed: number }[] = [];
    let backWave = -1; // x position of the shockwave travelling back through the network
    let charge = 0; // 0..1 at the output node
    let phase: 'firing' | 'cooldown' = 'firing';
    let phaseClock = 0;
    let fireClock = 0;
    let time = 0;
    let raf = 0, running = true, visible = true, last = performance.now();
    const mouse = { x: -9999, y: -9999, on: false };

    const outIdx = () => layers[layers.length - 1][0];
    const CHARGE_PER_HIT = compact ? 0.06 : 0.035;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ({ nodes, layers } = buildNetwork(w, h, compact, rand));
      electrons = []; sparks = []; rings = []; charge = 0; phase = 'firing'; phaseClock = 0; backWave = -1;
      const dustCount = Math.round((w * h) / (compact ? 5000 : 6500));
      dust = Array.from({ length: dustCount }, () => ({
        x: rand() * w, y: rand() * h, vx: 0.15 + rand() * 0.35, vy: (rand() - 0.5) * 0.12, a: 0.08 + rand() * 0.22,
      }));
    };

    const emit = (from: number) => {
      const li = nodes[from].layer;
      if (li >= layers.length - 1) return;
      const next = layers[li + 1];
      // Bias toward targets nearer in height, so the flow funnels to the output.
      const sorted = [...next].sort((a, b) => Math.abs(nodes[a].y - nodes[from].y) - Math.abs(nodes[b].y - nodes[from].y));
      const to = sorted[Math.min(sorted.length - 1, Math.floor(Math.pow(rand(), 1.8) * sorted.length))];
      electrons.push({ from, to, t: 0, speed: 0.85 + rand() * 0.6 });
    };

    const explode = () => {
      const o = nodes[outIdx()];
      const count = compact ? 120 : 220;
      for (let i = 0; i < count; i++) {
        const ang = rand() * Math.PI * 2;
        const sp = 1.5 + Math.pow(rand(), 0.6) * (compact ? 5 : 8);
        const max = 600 + rand() * 1000;
        sparks.push({ x: o.x, y: o.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: max, max, size: 0.8 + rand() * 2 });
      }
      rings.push({ r: 4, a: 1, speed: 0.7 }, { r: 2, a: 0.7, speed: 0.4 }, { r: 1, a: 0.45, speed: 0.22 });
      backWave = o.x;
      electrons = [];
      charge = 0;
      phase = 'cooldown';
      phaseClock = 0;
    };

    const step = (dt: number) => {
      time += dt;

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

      phaseClock += dt;
      if (phase === 'firing') {
        fireClock += dt;
        // Fire faster as the output fills up — the network "builds momentum".
        const interval = (compact ? 150 : 85) * (1 - charge * 0.5);
        while (fireClock > interval) {
          fireClock -= interval;
          const input = layers[0][Math.floor(rand() * layers[0].length)];
          nodes[input].flash = 1;
          emit(input);
        }
      } else if (phaseClock > 1400 && sparks.length < 20) {
        phase = 'firing'; phaseClock = 0; fireClock = 0;
      }

      const keep: Electron[] = [];
      const current = electrons;
      electrons = []; // emit() pushes newly spawned electrons here
      for (const e of current) {
        const a = nodes[e.from], b = nodes[e.to];
        const len = Math.max(30, Math.hypot(b.x - a.x, b.y - a.y));
        e.t += (dt * 0.32 * e.speed) / len;
        if (e.t < 1) { keep.push(e); continue; }
        nodes[e.to].flash = 1;
        if (e.to === outIdx()) {
          charge = Math.min(1, charge + CHARGE_PER_HIT);
          if (charge >= 1 && phase === 'firing') { explode(); return; }
        } else {
          emit(e.to);
          if (rand() < 0.12) emit(e.to); // occasional branching
        }
      }
      electrons = keep.concat(electrons);
      if (electrons.length > 220) electrons = electrons.slice(-220);

      for (const s of sparks) {
        s.x += s.vx * dt * 0.06; s.y += s.vy * dt * 0.06;
        s.vx *= 0.985; s.vy *= 0.985; s.vy += 0.0025 * dt * 0.06;
        s.life -= dt;
      }
      sparks = sparks.filter((s) => s.life > 0);
      for (const r of rings) { r.r += r.speed * dt; r.a -= dt / 1500; }
      rings = rings.filter((r) => r.a > 0);

      if (backWave >= 0) {
        backWave -= dt * 0.9;
        for (const n of nodes) if (Math.abs(n.x - backWave) < 18) n.flash = Math.max(n.flash, 0.8);
        if (backWave < -20) backWave = -1;
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const o = nodes[outIdx()];

      // Glow around the output node grows with charge.
      const glowR = Math.max(w, h) * (0.25 + charge * 0.25);
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, glowR);
      g.addColorStop(0, `rgba(${ORANGE},${0.1 + charge * 0.22})`);
      g.addColorStop(1, `rgba(${ORANGE},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

      for (const d of dust) {
        ctx.fillStyle = `rgba(${STEEL},${d.a})`;
        ctx.fillRect(d.x, d.y, 1.2, 1.2);
      }

      // Synapses between consecutive layers.
      ctx.lineWidth = 1;
      for (let li = 0; li < layers.length - 1; li++) {
        for (const i of layers[li]) for (const j of layers[li + 1]) {
          const a = nodes[i], b = nodes[j];
          let alpha = 0.1;
          if (mouse.on) {
            const md = Math.hypot((a.x + b.x) / 2 - mouse.x, (a.y + b.y) / 2 - mouse.y);
            if (md < 160) alpha += (1 - md / 160) * 0.18;
          }
          const heat = Math.min(a.flash, b.flash);
          ctx.strokeStyle = heat > 0.1 ? `rgba(${HOT},${alpha + heat * 0.3})` : `rgba(${STEEL},${alpha})`;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }

      // Electrons with comet tails.
      for (const e of electrons) {
        const a = nodes[e.from], b = nodes[e.to];
        const x = a.x + (b.x - a.x) * e.t, y = a.y + (b.y - a.y) * e.t;
        const tt = Math.max(0, e.t - 0.28);
        const tx = a.x + (b.x - a.x) * tt, ty = a.y + (b.y - a.y) * tt;
        const tail = ctx.createLinearGradient(tx, ty, x, y);
        tail.addColorStop(0, `rgba(${HOT},0)`);
        tail.addColorStop(1, `rgba(${HOT},0.95)`);
        ctx.strokeStyle = tail; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
        const halo = ctx.createRadialGradient(x, y, 0, x, y, 9);
        halo.addColorStop(0, `rgba(${HOT},0.6)`); halo.addColorStop(1, `rgba(${ORANGE},0)`);
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFE1D3'; ctx.beginPath(); ctx.arc(x, y, 1.7, 0, Math.PI * 2); ctx.fill();
      }

      // Neurons.
      for (const n of nodes) {
        const isOut = n === o;
        const base = isOut ? 5 + charge * 7 : 2.6;
        if (n.flash > 0.02 || isOut) {
          const rr = isOut ? 18 + charge * 40 + Math.sin(time / 120) * charge * 4 : 5 + n.flash * 14;
          const a = isOut ? 0.35 + charge * 0.5 : 0.5 * n.flash;
          const gl = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, rr);
          gl.addColorStop(0, `rgba(${HOT},${a})`); gl.addColorStop(1, `rgba(${ORANGE},0)`);
          ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(n.x, n.y, rr, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = n.flash > 0.3 || isOut ? `rgba(${HOT},0.95)` : `rgba(${STEEL},0.45)`;
        ctx.fillStyle = n.flash > 0.3 || isOut ? `rgba(${HOT},${isOut ? 0.95 : 0.85})` : '#151515';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(n.x, n.y, base + n.flash * 1.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }

      // Explosion.
      for (const r of rings) {
        ctx.strokeStyle = `rgba(${HOT},${Math.min(1, r.a)})`; ctx.lineWidth = 1 + r.a * 2.5;
        ctx.beginPath(); ctx.arc(o.x, o.y, r.r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter';
      if (rings.length && rings[0].a > 0.4) {
        const k = (rings[0].a - 0.4) / 0.6;
        const fl = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, 60 + (1 - k) * 220);
        fl.addColorStop(0, `rgba(255,240,230,${0.9 * k})`);
        fl.addColorStop(0.3, `rgba(${HOT},${0.5 * k})`);
        fl.addColorStop(1, `rgba(${ORANGE},0)`);
        ctx.fillStyle = fl; ctx.fillRect(0, 0, w, h);
      }
      for (const s of sparks) {
        const k = s.life / s.max;
        ctx.strokeStyle = k > 0.65 ? `rgba(255,236,224,${k})` : `rgba(${HOT},${k})`;
        ctx.lineWidth = s.size * (0.6 + k);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 3, s.y - s.vy * 3); ctx.stroke();
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
      charge = 0.7;
      for (let i = 0; i < 40; i++) {
        const n = Math.floor(rand() * (nodes.length - 1));
        emit(n);
      }
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
  const lines: [N, N][] = [];
  for (let li = 0; li < layers.length - 1; li++)
    for (const i of layers[li]) for (const j of layers[li + 1]) lines.push([nodes[i], nodes[j]]);
  const out = nodes[nodes.length - 1];
  return (
    <Svg width="100%" height="100%" viewBox="0 0 1000 570" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
      <G>{lines.map(([a, b], i) => <Line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={`rgb(${STEEL})`} strokeOpacity={0.08} />)}</G>
      <G>{nodes.map((n, i) => <Circle key={i} cx={n.x} cy={n.y} r={n === out ? 8 : 3} fill={n === out ? `rgb(${HOT})` : '#151515'} stroke={n === out ? `rgb(${HOT})` : `rgb(${STEEL})`} strokeOpacity={n === out ? 1 : 0.45} />)}</G>
    </Svg>
  );
}

export function HeroBackground({ compact }: { compact: boolean }) {
  const reduceMotion = usePrefersReducedMotion();
  return (
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
      {Platform.OS === 'web' ? <CanvasNetwork compact={compact} still={reduceMotion} /> : <StaticNetwork compact={compact} />}
      {/* Light scrim behind the copy column only — the network stays visible on the left. */}
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
  );
}
