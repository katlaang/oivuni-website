import { createElement, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * Hero background: a real 3D particle brain wrapped in blue and orange gas.
 * Hovering (or tapping) the brain sets off a multicolour nebula.
 * The WebGL scene lives in ./brain3d (web only); native shows the dark backdrop.
 *
 * Photosensitivity: the nebula brightens and fades over seconds and never
 * strobes; prefers-reduced-motion gets a still frame; the scene pauses when
 * off-screen or in a background tab.
 */

type BrainScene = {
  pointer: (x: number, y: number) => boolean;
  setHover: (on: boolean) => void;
  start: () => void;
  stop: () => void;
  resize: () => void;
  dispose: () => void;
};

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

function WebBrain({ compact, still }: { compact: boolean; still: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let scene: BrainScene | null = null;
    let cancelled = false;
    let visible = true;
    let tapTimer: ReturnType<typeof setTimeout> | undefined;

    const sync = () => { if (!scene) return; if (visible && !document.hidden) scene.start(); else scene.stop(); };
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, inside: e.clientY >= r.top && e.clientY <= r.bottom };
    };
    // The canvas sits under the copy and never takes pointer events, so hover is tracked on window.
    const onMove = (e: PointerEvent) => {
      if (!scene || e.pointerType === 'touch') return;
      const p = local(e);
      scene.setHover(p.inside && scene.pointer(p.x, p.y));
    };
    const onDown = (e: PointerEvent) => {
      if (!scene || e.pointerType !== 'touch') return;
      const p = local(e);
      if (p.inside && scene.pointer(p.x, p.y)) {
        scene.setHover(true);
        clearTimeout(tapTimer);
        tapTimer = setTimeout(() => scene?.setHover(false), 5600);
      }
    };
    const onLeave = () => scene?.setHover(false);

    (async () => {
      try {
        const { startBrain } = await import('./brain3d');
        if (cancelled) return;
        scene = (await startBrain(el, { compact, still })) as BrainScene;
        if (cancelled) { scene.dispose(); return; }
        sync();
      } catch {
        // No WebGL (or it failed): the dark hero background remains.
      }
    })();

    const ro = new ResizeObserver(() => scene?.resize());
    ro.observe(el);
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    io.observe(el);
    document.addEventListener('visibilitychange', sync);
    if (!still) {
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerdown', onDown, { passive: true });
      document.documentElement.addEventListener('pointerleave', onLeave);
    }

    return () => {
      cancelled = true;
      clearTimeout(tapTimer);
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      scene?.dispose();
    };
  }, [compact, still]);

  return createElement('div', { ref, 'aria-hidden': true, style: { position: 'absolute', inset: 0, overflow: 'hidden' } });
}

export function HeroBackground({ compact }: { compact: boolean }) {
  const reduceMotion = usePrefersReducedMotion();
  const web = Platform.OS === 'web';
  return (
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
      {web ? <WebBrain compact={compact} still={reduceMotion} /> : null}
      {/* Scrim behind the copy column keeps text readable, even at the nebula's peak. */}
      <Svg width="100%" height="100%" viewBox="0 0 1000 570" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="textScrim" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#070A14" stopOpacity="0.6" />
            <Stop offset={compact ? '85%' : '48%'} stopColor="#070A14" stopOpacity={compact ? '0.45' : '0.25'} />
            <Stop offset="100%" stopColor="#070A14" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect width="1000" height="570" fill="url(#textScrim)" />
      </Svg>
    </View>
  );
}
