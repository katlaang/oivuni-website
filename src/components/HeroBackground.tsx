import { createElement, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * Neural-network hero animation.
 *
 * Electrons fire from the input layer (left, "research"), travel through the
 * hidden layers and converge on several output neurons (right, "real-world
 * innovation"). Each output charges independently; when full it blooms into a
 * nebula (cyan core, orange/red filaments), then swirls and collapses back into
 * itself. Bursts are staggered so only one happens at a time.
 *
 * Photosensitivity safeguards (WCAG 2.3.1 / 2.2.2):
 *  - at most one burst every 3 s (limit is 3 flashes per second)
 *  - the nebula brightens and fades over ~3 s and is confined to a small area;
 *    no full-screen flash, no strobing
 *  - visible pause control; choice is remembered per browser
 *  - honours prefers-reduced-motion with a still frame
 *  - pauses off-screen and in background tabs
 */

const ORANGE = '232,80,26';
const HOT = '255,122,69';
const STEEL = '214,220,224';
const MIN_BURST_GAP = 3000; // ms between any two bursts
const OUTPUT_COOLDOWN = 1200; // ms an output rests after its nebula collapses
const NEB_EXPAND = 1300, NEB_HOLD = 700, NEB_COLLAPSE = 900;
const NEB_LIFE = NEB_EXPAND + NEB_HOLD + NEB_COLLAPSE;

type N = { x: number; y: number; bx: number; by: number; ph: number; layer: number; flash: number };
type Electron = { from: number; to: number; t: number; speed: number };
type Fil = { pts: [number, number][]; w: number }; // polar points: angle, radius fraction
type Arc = { a: number; span: number; d: number };
type Lobe = { a: number; d: number; r: number };
type Star = { a: number; d: number; s: number };
type Nebula = { x: number; y: number; age: number; spin: number; fils: Fil[]; arcs: Arc[]; lobes: Lobe[]; stars: Star[] };
type Dust = { x: number; y: number; vx: number; vy: number; a: number };
type Out = { node: number; charge: number; rest: number };

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function layerSizes(compact: boolean) {
  return compact ? [5, 6, 6, 5, 2] : [7, 9, 10, 9, 7, 3];
}

/** Evenly balanced layout: every hidden layer spans the same height; outputs sit in the middle half. */
function buildNetwork(w: number, h: number, compact: boolean, rand: () => number) {
  const sizes = layerSizes(compact);
  const nodes: N[] = [];
  const layers: number[][] = [];
  const x0 = w * (compact ? 0.07 : 0.05);
  const x1 = w * (compact ? 0.84 : 0.82);
  const last = sizes.length - 1;
  sizes.forEach((count, li) => {
    const ids: number[] = [];
    const x = x0 + ((x1 - x0) * li) / last;
    const span = h * (li === last ? (compact ? 0.4 : 0.5) : 0.76);
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
    let nebulae: Nebula[] = [];
    let dust: Dust[] = [];
    let sinceBurst = MIN_BURST_GAP;
    let fireClock = 0;
    let time = 0;
    let raf = 0, running = true, visible = true, last = performance.now();
    const mouse = { x: -9999, y: -9999, on: false };
    const CHARGE_PER_HIT = compact ? 0.09 : 0.07;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ({ nodes, layers } = buildNetwork(w, h, compact, rand));
      outs = layers[layers.length - 1].map((node, i) => ({ node, charge: 0.25 * i, rest: 0 }));
      electrons = []; nebulae = [];
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

    const burst = (o: Out) => {
      const n = nodes[o.node];
      const fils: Fil[] = [];
      const FC = compact ? 46 : 72;
      for (let i = 0; i < FC; i++) {
        let a = rand() * Math.PI * 2;
        let d = 0.08 + rand() * 0.2;
        const pts: [number, number][] = [[a, d]];
        const segs = 5 + Math.floor(rand() * 6);
        for (let k = 0; k < segs; k++) {
          a += (rand() - 0.5) * 0.75;
          d += 0.06 + rand() * 0.12;
          pts.push([a, Math.min(1.1, d)]);
        }
        fils.push({ pts, w: 0.6 + rand() * 1.1 });
      }
      const arcs: Arc[] = Array.from({ length: compact ? 26 : 44 }, () => ({ a: rand() * Math.PI * 2, span: 0.15 + rand() * 0.4, d: 0.3 + rand() * 0.75 }));
      const lobes: Lobe[] = Array.from({ length: 8 }, (_, i) => ({ a: rand() * Math.PI * 2, d: i < 4 ? 0.1 + rand() * 0.25 : 0.45 + rand() * 0.35, r: i < 4 ? 0.35 + rand() * 0.3 : 0.3 + rand() * 0.25 }));
      const stars: Star[] = Array.from({ length: compact ? 30 : 50 }, () => ({ a: rand() * Math.PI * 2, d: rand() * 1.15, s: 0.5 + rand() * 1.2 }));
      nebulae.push({ x: n.x, y: n.y, age: 0, spin: rand() < 0.5 ? -1 : 1, fils, arcs, lobes, stars });
      for (const id of layers[layers.length - 2]) nodes[id].flash = Math.max(nodes[id].flash, 0.7);
      o.charge = 0; o.rest = OUTPUT_COOLDOWN + NEB_LIFE; sinceBurst = 0;
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
      const interval = compact ? 150 : 85;
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
        e.t += (dt * 0.32 * e.speed) / len;
        if (e.t < 1) { keep.push(e); continue; }
        nodes[e.to].flash = 1;
        const o = outOf(e.to);
        if (o) { if (o.rest <= 0) o.charge = Math.min(1, o.charge + CHARGE_PER_HIT); }
        else { emit(e.to); if (rand() < 0.12) emit(e.to); }
      }
      electrons = keep.concat(electrons);
      if (electrons.length > 240) electrons = electrons.slice(-240);

      for (const o of outs) o.rest = Math.max(0, o.rest - dt);
      if (sinceBurst >= MIN_BURST_GAP) {
        const ready = outs.filter((o) => o.charge >= 1).sort((a, b) => b.charge - a.charge);
        if (ready.length) burst(ready[0]);
      }

      for (const nb of nebulae) {
        nb.age += dt;
        if (nb.age >= NEB_LIFE && nb.age - dt < NEB_LIFE) {
          // Collapse complete: the output re-ignites as a point and the network brightens.
          const o = outs.find((q) => Math.hypot(nodes[q.node].x - nb.x, nodes[q.node].y - nb.y) < 30);
          if (o) nodes[o.node].flash = 1;
          for (const id of layers[layers.length - 2]) nodes[id].flash = Math.max(nodes[id].flash, 0.9);
        }
      }
      nebulae = nebulae.filter((nb) => nb.age < NEB_LIFE + 500);
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Soft glow around each output grows with its charge.
      for (const o of outs) {
        const n = nodes[o.node];
        const gr = Math.max(w, h) * (0.12 + o.charge * 0.14);
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, gr);
        g.addColorStop(0, `rgba(${ORANGE},${0.06 + o.charge * 0.14})`);
        g.addColorStop(1, `rgba(${ORANGE},0)`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }

      for (const d of dust) { ctx.fillStyle = `rgba(${STEEL},${d.a})`; ctx.fillRect(d.x, d.y, 1.2, 1.2); }

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

      for (const e of electrons) {
        const a = nodes[e.from], b = nodes[e.to];
        const x = a.x + (b.x - a.x) * e.t, y = a.y + (b.y - a.y) * e.t;
        const tt = Math.max(0, e.t - 0.28);
        const tx = a.x + (b.x - a.x) * tt, ty = a.y + (b.y - a.y) * tt;
        const tail = ctx.createLinearGradient(tx, ty, x, y);
        tail.addColorStop(0, `rgba(${HOT},0)`); tail.addColorStop(1, `rgba(${HOT},0.95)`);
        ctx.strokeStyle = tail; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
        const halo = ctx.createRadialGradient(x, y, 0, x, y, 9);
        halo.addColorStop(0, `rgba(${HOT},0.6)`); halo.addColorStop(1, `rgba(${ORANGE},0)`);
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFE1D3'; ctx.beginPath(); ctx.arc(x, y, 1.7, 0, Math.PI * 2); ctx.fill();
      }

      for (const n of nodes) {
        const o = outOf(nodes.indexOf(n));
        const c = o ? o.charge : 0;
        const base = o ? 4.5 + c * 5 : 2.6;
        if (n.flash > 0.02 || o) {
          const rr = o ? 14 + c * 26 : 5 + n.flash * 14;
          const a = o ? 0.25 + c * 0.45 : 0.5 * n.flash;
          const gl = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, rr);
          gl.addColorStop(0, `rgba(${HOT},${a})`); gl.addColorStop(1, `rgba(${ORANGE},0)`);
          ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(n.x, n.y, rr, 0, Math.PI * 2); ctx.fill();
        }
        const lit = n.flash > 0.3 || !!o;
        ctx.strokeStyle = lit ? `rgba(${HOT},0.95)` : `rgba(${STEEL},0.45)`;
        ctx.fillStyle = lit ? `rgba(${HOT},${o ? 0.6 + c * 0.35 : 0.85})` : '#151515';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(n.x, n.y, base + n.flash * 1.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }

      // Nebulae: bloom outward, hold and drift, then swirl and collapse back in.
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      const Rmax = compact ? Math.min(100, w * 0.26) : Math.min(165, h * 0.24);
      for (const nb of nebulae) {
        const t = nb.age;
        let scale: number, alpha: number, rot: number;
        if (t < NEB_EXPAND) {
          const p = t / NEB_EXPAND;
          scale = 1 - Math.pow(1 - p, 3);
          alpha = Math.min(1, t / 350);
          rot = 0;
        } else if (t < NEB_EXPAND + NEB_HOLD) {
          const p = (t - NEB_EXPAND) / NEB_HOLD;
          scale = 1 + p * 0.06; alpha = 1; rot = p * 0.05;
        } else if (t < NEB_LIFE) {
          const p = (t - NEB_EXPAND - NEB_HOLD) / NEB_COLLAPSE;
          scale = 1.06 * (1 - p * p * (3 - 2 * p));
          alpha = 1 - p * 0.3;
          rot = 0.05 + p * p * 2.4;
        } else {
          // Afterglow: a small bright core that fades out gently.
          const p = (t - NEB_LIFE) / 500;
          const R = 10 + 8 * (1 - p);
          const core = ctx.createRadialGradient(nb.x, nb.y, 0, nb.x, nb.y, R);
          core.addColorStop(0, `rgba(190,240,255,${0.5 * (1 - p)})`);
          core.addColorStop(1, 'rgba(120,220,255,0)');
          ctx.fillStyle = core; ctx.beginPath(); ctx.arc(nb.x, nb.y, R, 0, Math.PI * 2); ctx.fill();
          continue;
        }
        const R = Math.max(2, Rmax * scale);
        const spin = rot * nb.spin;
        const P = (a: number, d: number): [number, number] => {
          // Inner material swirls faster during the collapse.
          const aa = a + spin * (1.4 - d * 0.6);
          return [nb.x + Math.cos(aa) * d * R, nb.y + Math.sin(aa) * d * R * 0.86];
        };

        // Outer orange-red shell haze.
        const shell = ctx.createRadialGradient(nb.x, nb.y, R * 0.35, nb.x, nb.y, R * 1.15);
        shell.addColorStop(0, `rgba(${ORANGE},0)`);
        shell.addColorStop(0.7, `rgba(220,90,40,${0.12 * alpha})`);
        shell.addColorStop(1, 'rgba(180,50,30,0)');
        ctx.fillStyle = shell; ctx.beginPath(); ctx.arc(nb.x, nb.y, R * 1.15, 0, Math.PI * 2); ctx.fill();

        // Cyan lobes in the core.
        for (const lb of nb.lobes) {
          const [lx, ly] = P(lb.a, lb.d);
          const lr = lb.r * R;
          const inner = lb.d < 0.4;
          const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
          g.addColorStop(0, inner ? `rgba(150,225,255,${0.22 * alpha})` : `rgba(240,120,60,${0.13 * alpha})`);
          g.addColorStop(0.6, inner ? `rgba(90,190,220,${0.08 * alpha})` : `rgba(200,80,40,${0.05 * alpha})`);
          g.addColorStop(1, 'rgba(90,190,220,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI * 2); ctx.fill();
        }

        // Filaments: cyan near the core, through gold-green, to orange-red at the rim.
        for (const f of nb.fils) {
          for (let k = 1; k < f.pts.length; k++) {
            const [a0, d0] = f.pts[k - 1], [a1, d1] = f.pts[k];
            const [x0, y0] = P(a0, d0), [x1, y1] = P(a1, d1);
            const d = (d0 + d1) / 2;
            const col = d < 0.35 ? '160,230,255' : d < 0.6 ? '200,215,140' : d < 0.85 ? '255,150,70' : '230,80,40';
            ctx.strokeStyle = `rgba(${col},${(0.45 - d * 0.15) * alpha})`;
            ctx.lineWidth = f.w * (0.6 + scale * 0.6);
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
          }
        }

        // Fine web of threads between filaments.
        ctx.lineWidth = 0.7;
        for (const ar of nb.arcs) {
          const col = ar.d < 0.5 ? '170,230,250' : '255,140,80';
          ctx.strokeStyle = `rgba(${col},${0.22 * alpha})`;
          ctx.beginPath();
          for (let k = 0; k <= 6; k++) {
            const [x, y] = P(ar.a + (ar.span * k) / 6, ar.d + Math.sin(k) * 0.02);
            if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }

        // Embedded stars.
        for (const st of nb.stars) {
          const [x, y] = P(st.a, st.d);
          ctx.fillStyle = `rgba(235,245,255,${0.7 * alpha})`;
          ctx.beginPath(); ctx.arc(x, y, st.s, 0, Math.PI * 2); ctx.fill();
        }

        // Pulsar core.
        const cr = 6 + R * 0.12;
        const core = ctx.createRadialGradient(nb.x, nb.y, 0, nb.x, nb.y, cr);
        core.addColorStop(0, `rgba(225,250,255,${0.55 * alpha})`);
        core.addColorStop(1, 'rgba(120,220,255,0)');
        ctx.fillStyle = core; ctx.beginPath(); ctx.arc(nb.x, nb.y, cr, 0, Math.PI * 2); ctx.fill();
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
