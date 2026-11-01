import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, fonts } from '../theme';

// Temporary mark (logo concept A). Replace once the founders choose the final logo.
export function Mark({ size = 30, ring = colors.white, dot = colors.accentOnDark }: { size?: number; ring?: string; dot?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityLabel="Oivuni AI">
      <Circle cx={56} cy={64} r={40} fill="none" stroke={ring} strokeWidth={14} />
      <Circle cx={94} cy={24} r={13} fill={dot} />
    </Svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Mark size={size} />
      <Text style={{ fontFamily: fonts.display, fontSize: size * 0.73, letterSpacing: -0.6, color: colors.white }}>
        oivuni{' '}
        <Text style={{ fontFamily: fonts.displayMedium, fontSize: size * 0.5, color: colors.accentOnDark }}>AI</Text>
      </Text>
    </View>
  );
}
