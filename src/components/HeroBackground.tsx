import { createElement, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * "Intelligence field" behind the homepage hero.
 *
 * Web: a canvas network — nodes drift, links form and fade with distance,
 * orange signals hop node to node along the links, and the field leans toward
 * the cursor. Pauses when off-screen or in a background tab.
 * Native, or reduced motion: a single still frame of the same field.
 */

const ORANGE = '232,80,26';
const ORANGE_LIGHT = '255,122,69';
const STEEL = '214,220,224';

type Node = { x: number; y: number; vx: number; vy: number; r: number; hot: boolean; flash: number };
type Pulse = { from: number; to: number; t: number; speed: number; hops: number };

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia) {
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReduce(media.matches);
      const onChange = (e: MediaQueryListEvent) => setReduce(e.matches);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => mounted && setReduce(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { mounted = false; sub.remove(); };
  }, []);
  return reduce;
}

// Deterministic pseudo-random so the still frame is stable between renders.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function makeNodes(w: number, h: number, count: number, rand: () => number): Node[] {
  const nodes: Node[] = [];
  for (let i = 0; i < count; i++) {
    // Bias toward the right side, where there is no copy.
    const bias = Math.pow(rand(), 0.55);
    nodes.push({
      x: w * (0.18 + 0.86 * bias),
      y: h * (-0.05 + 1.1 * rand()),
      vx: (rand() - 0.5) * 0.22,
      vy: (rand() - 0.5) * 0.22,
      r: 1.1 + rand() * 1.8,
      hot: rand() < 0.12,
      flash: 0,
    });
  }
  return nodes;
}

function CanvasField({ compact, still }: { compact: boolean; still: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rand = seeded(7);
    let w = 0, h = 0, dpr = 1;
    let nodes: Node[] = [];
    let pulses: Pulse[] = [];
    let raf = 0;
    let running = true;
    let visible = true;
    let last = performance.now();
    let spawnClock = 0;
    const mouse = { x: -9999, y: -9999, active: false };

    const linkDist = () => (compact ? 120 : 150);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const density = compact ? 9000 : 11000;
      const count = Math.max(36, Math.min(compact ? 60 : 120, Math.round((w * h) / density)));
      nodes = makeNodes(w, h, count, rand);
      pulses = [];
    };

    const neighbours = (i: number) => {
      const a = nodes[i];
      const out: number[] = [];
      const d2max = linkDist() ** 2;
      for (let j = 0; j < nodes.length; j++) {
        if (j === i) continue;
        const dx = nodes[j].x - a.x, dy = nodes[j].y - a.y;
        if (dx * dx + dy * dy < d2max) out.push(j);
      }
      return out;
    };

    const spawnPulse = (from?: number) => {
      const start = from ?? Math.floor(rand() * nodes.length);
      const n = neighbours(start);
      if (!n.length) return;
      const to = n[Math.floor(rand() * n.length)];
      pulses.push({ from: start, to, t: 0, speed: 0.9 + rand() * 0.7, hops: 3 + Math.floor(rand() * 5) });
      nodes[start].flash = 1;
    };

    const step = (dt: number) => {
      const md = 170;
      for (const n of nodes) {
        // Gentle pull toward the cursor.
        if (mouse.active) {
          const dx = mouse.x - n.x, dy = mouse.y - n.y;
          const d = Math.hypot(dx, dy);
          if (d < md && d > 1) {
            const f = (1 - d / md) * 0.012;
            n.vx += (dx / d) * f; n.vy += (dy / d) * f;
          }
        }
        n.vx *= 0.995; n.vy *= 0.995;
        const sp = Math.hypot(n.vx, n.vy);
        if (sp < 0.06) { n.vx += (rand() - 0.5) * 0.02; n.vy += (rand() - 0.5) * 0.02; }
        if (sp > 0.5) { n.vx *= 0.5 / sp; n.vy *= 0.5 / sp; }
        n.x += n.vx * dt * 0.06; n.y += n.vy * dt * 0.06;
        const minX = w * 0.12;
        if (n.x < minX) { n.x = minX; n.vx = Math.abs(n.vx); }
        if (n.x > w + 20) { n.x = w + 20; n.vx = -Math.abs(n.vx); }
        if (n.y < -20) { n.y = -20; n.vy = Math.abs(n.vy); }
        if (n.y > h + 20) { n.y = h + 20; n.vy = -Math.abs(n.vy); }
        n.flash = Math.max(0, n.flash - dt / 900);
      }

      spawnClock += dt;
      const interval = compact ? 900 : 520;
      if (spawnClock > interval && pulses.length < (compact ? 6 : 14)) { spawnClock = 0; spawnPulse(); }

      const next: Pulse[] = [];
      for (const p of pulses) {
        const a = nodes[p.from], b = nodes[p.to];
        const len = Math.max(20, Math.hypot(b.x - a.x, b.y - a.y));
        p.t += (dt * 0.12 * p.speed) / len;
        if (p.t >= 1) {
          nodes[p.to].flash = 1;
          if (p.hops > 0) {
            const n = neighbours(p.to).filter((j) => j !== p.from);
            if (n.length) {
              next.push({ from: p.to, to: n[Math.floor(rand() * n.length)], t: 0, speed: p.speed, hops: p.hops - 1 });
            }
          }
        } else next.push(p);
      }
      pulses = next;
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Ambient glow behind the field.
      const g = ctx.createRadialGradient(w * 0.72, h * 0.45, 0, w * 0.72, h * 0.45, Math.max(w, h) * 0.55);
      g.addColorStop(0, `rgba(${ORANGE},0.16)`);
      g.addColorStop(0.5, `rgba(${ORANGE},0.04)`);
      g.addColorStop(1, `rgba(${ORANGE},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // Links.
      const L = linkDist();
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > L * L) continue;
          const k = 1 - Math.sqrt(d2) / L;
          let alpha = k * 0.28;
          if (mouse.active) {
            const mx = (a.x + b.x) / 2 - mouse.x, my = (a.y + b.y) / 2 - mouse.y;
            const md = Math.hypot(mx, my);
            if (md < 180) alpha += (1 - md / 180) * 0.35 * k;
          }
          const heat = Math.max(a.flash, b.flash);
          ctx.strokeStyle = heat > 0.05
            ? `rgba(${ORANGE_LIGHT},${Math.min(0.75, alpha + heat * 0.45 * k)})`
            : `rgba(${STEEL},${alpha})`;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }

      // Signals travelling along links, with a short tail.
      for (const p of pulses) {
        const a = nodes[p.from], b = nodes[p.to];
        const x = a.x + (b.x - a.x) * p.t, y = a.y + (b.y - a.y) * p.t;
        const tt = Math.max(0, p.t - 0.35);
        const tx = a.x + (b.x - a.x) * tt, ty = a.y + (b.y - a.y) * tt;
        const tail = ctx.createLinearGradient(tx, ty, x, y);
        tail.addColorStop(0, `rgba(${ORANGE_LIGHT},0)`);
        tail.addColorStop(1, `rgba(${ORANGE_LIGHT},0.9)`);
        ctx.strokeStyle = tail; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
        const halo = ctx.createRadialGradient(x, y, 0, x, y, 12);
        halo.addColorStop(0, `rgba(${ORANGE_LIGHT},0.55)`);
        halo.addColorStop(1, `rgba(${ORANGE},0)`);
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFD2BF'; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
      }

      // Nodes.
      for (const n of nodes) {
        if (n.flash > 0.02) {
          const rr = 4 + n.flash * 14;
          const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, rr);
          glow.addColorStop(0, `rgba(${ORANGE_LIGHT},${0.5 * n.flash})`);
          glow.addColorStop(1, `rgba(${ORANGE},0)`);
          ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(n.x, n.y, rr, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = n.hot || n.flash > 0.3 ? `rgba(${ORANGE_LIGHT},0.95)` : `rgba(${STEEL},0.7)`;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + n.flash * 1.2, 0, Math.PI * 2); ctx.fill();
      }
    };

    const loop = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      if (running && visible) { step(dt); draw(); }
      raf = requestAnimationFrame(loop);
    };

    resize();
    if (still) {
      for (let i = 0; i < 6; i++) spawnPulse();
      for (const p of pulses) p.t = 0.6;
      draw();
    } else {
      raf = requestAnimationFrame(loop);
    }

    const ro = new ResizeObserver(() => { resize(); if (still) draw(); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; last = performance.now(); });
    io.observe(canvas);
    const onVis = () => { running = !document.hidden; last = performance.now(); };
    document.addEventListener('visibilitychange', onVis);

    // The canvas ignores pointer events so the hero copy stays clickable; track on window instead.
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
      mouse.active = mouse.y > 0 && mouse.y < r.height && e.pointerType === 'mouse';
    };
    const onLeave = () => { mouse.active = false; };
    if (!still) {
      window.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('pointerleave', onLeave);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [compact, still]);

  return createElement('canvas', {
    ref: canvasRef,
    'aria-hidden': true,
    style: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none' },
  });
}

/** Still frame for native targets. */
function StaticField() {
  const rand = seeded(7);
  const nodes = makeNodes(1000, 570, 70, rand);
  const lines: [Node, Node, number][] = [];
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d < 140) lines.push([nodes[i], nodes[j], 1 - d / 140]);
    }
  return (
    <Svg width="100%" height="100%" viewBox="0 0 1000 570" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
      <G>
        {lines.map(([a, b, k], i) => (
          <Line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={`rgb(${STEEL})`} strokeOpacity={k * 0.28} strokeWidth={1} />
        ))}
      </G>
      <G>
        {nodes.map((n, i) => (
          <Circle key={i} cx={n.x} cy={n.y} r={n.r} fill={n.hot ? `rgb(${ORANGE_LIGHT})` : `rgb(${STEEL})`} fillOpacity={n.hot ? 0.95 : 0.7} />
        ))}
      </G>
    </Svg>
  );
}

export function HeroBackground({ compact }: { compact: boolean }) {
  const reduceMotion = usePrefersReducedMotion();
  return (
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
      {Platform.OS === 'web' ? <CanvasField compact={compact} still={reduceMotion} /> : <StaticField />}
      {/* Scrim keeps the hero copy readable at desktop and phone widths. */}
      <Svg width="100%" height="100%" viewBox="0 0 1000 570" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="textScrim" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#111111" stopOpacity="0.92" />
            <Stop offset={compact ? '70%' : '40%'} stopColor="#111111" stopOpacity={compact ? '0.6' : '0.45'} />
            <Stop offset="100%" stopColor="#111111" stopOpacity={compact ? '0.3' : '0'} />
          </LinearGradient>
        </Defs>
        <Rect width="1000" height="570" fill="url(#textScrim)" />
      </Svg>
    </View>
  );
}
