import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * Subtle intelligence-field artwork for the homepage hero.
 * Uses existing React Native and react-native-svg dependencies, so it works
 * on Expo Web and native targets without a video or animation package.
 * Respects the platform's reduced-motion preference.
 */
export function HeroBackground({ compact }: { compact: boolean }) {
  const drift = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const signal = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReduceMotion(media.matches);
      const onChange = (event: MediaQueryListEvent) => setReduceMotion(event.matches);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }

    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (mounted) setReduceMotion(enabled); })
      .catch(() => { if (mounted) setReduceMotion(true); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      drift.stopAnimation();
      glow.stopAnimation();
      signal.stopAnimation();
      drift.setValue(0);
      glow.setValue(0);
      signal.setValue(0);
      return;
    }

    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 17000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 17000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const signalLoop = Animated.loop(
      Animated.timing(signal, { toValue: 1, duration: 24000, easing: Easing.linear, useNativeDriver: true }),
    );

    driftLoop.start();
    glowLoop.start();
    signalLoop.start();

    return () => {
      driftLoop.stop();
      glowLoop.stop();
      signalLoop.stop();
    };
  }, [reduceMotion, drift, glow, signal]);

  const floatX = drift.interpolate({ inputRange: [0, 1], outputRange: [-10, 10] });
  const floatY = drift.interpolate({ inputRange: [0, 1], outputRange: [9, -9] });
  const fieldOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.62, 0.94] });
  const signalX = signal.interpolate({ inputRange: [0, 1], outputRange: [-70, 85] });
  const signalY = signal.interpolate({ inputRange: [0, 1], outputRange: [55, -90] });

  return (
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.field,
          {
            width: compact ? '165%' : '93%',
            right: compact ? '-61%' : '-11%',
            opacity: reduceMotion ? (compact ? 0.36 : 0.67) : fieldOpacity,
            transform: [{ translateX: floatX }, { translateY: floatY }],
          },
        ]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 1000 570" preserveAspectRatio="xMidYMid slice">
          <Defs>
            <RadialGradient id="ambientGlow" cx="69%" cy="45%" rx="47%" ry="55%">
              <Stop offset="0%" stopColor="#E8501A" stopOpacity="0.19" />
              <Stop offset="55%" stopColor="#E8501A" stopOpacity="0.045" />
              <Stop offset="100%" stopColor="#E8501A" stopOpacity="0" />
            </RadialGradient>
            <LinearGradient id="fieldFade" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#111111" stopOpacity="0.92" />
              <Stop offset="38%" stopColor="#111111" stopOpacity="0.38" />
              <Stop offset="100%" stopColor="#111111" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect width="1000" height="570" fill="url(#ambientGlow)" />
          <G fill="none" stroke="#D6DCE0" strokeOpacity="0.25" strokeWidth="1">
            <Path d="M250 630 C390 135 600 -110 1050 60" />
            <Path d="M325 640 C475 190 670 -35 1050 130" />
            <Path d="M410 640 C545 240 730 50 1050 210" />
            <Path d="M490 640 C620 280 790 130 1050 285" />
            <Path d="M580 640 C685 345 835 215 1050 355" />
            <Path d="M670 640 C760 410 895 300 1050 425" />
            <Path d="M415 -90 C595 200 790 370 1050 65" />
            <Path d="M510 -90 C650 220 840 420 1050 155" />
            <Path d="M605 -90 C705 255 900 465 1050 250" />
          </G>
          <G fill="#E1E6E9" fillOpacity="0.53">
            <Circle cx="616" cy="121" r="2.4" />
            <Circle cx="777" cy="203" r="2.2" />
            <Circle cx="680" cy="388" r="2.3" />
            <Circle cx="851" cy="349" r="2.2" />
            <Circle cx="943" cy="184" r="2" />
            <Circle cx="555" cy="317" r="2" />
          </G>
          <G fill="#FF8859" fillOpacity="0.78">
            <Circle cx="800" cy="115" r="3.5" />
            <Circle cx="894" cy="284" r="2.8" />
          </G>
          <Rect width="1000" height="570" fill="url(#fieldFade)" />
        </Svg>
      </Animated.View>

      {!reduceMotion ? (
        <Animated.View
          style={[
            styles.beacon,
            {
              right: compact ? '20%' : '18%',
              top: compact ? '27%' : '32%',
              opacity: compact ? 0.36 : 0.7,
              transform: [{ translateX: signalX }, { translateY: signalY }],
            },
          ]}
        />
      ) : null}

      {/* Dark scrim keeps all hero copy readable at desktop and phone widths. */}
      <Svg width="100%" height="100%" viewBox="0 0 1000 570" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="textScrim" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#111111" stopOpacity="0.97" />
            <Stop offset={compact ? '78%' : '44%'} stopColor="#111111" stopOpacity={compact ? '0.76' : '0.70'} />
            <Stop offset="100%" stopColor="#111111" stopOpacity={compact ? '0.48' : '0.17'} />
          </LinearGradient>
        </Defs>
        <Rect width="1000" height="570" fill="url(#textScrim)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    position: 'absolute',
    top: '-10%',
    bottom: '-10%',
  },
  beacon: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FF8859',
    shadowColor: '#E8501A',
    shadowOpacity: 0.85,
    shadowRadius: 12,
    elevation: 2,
  },
});
