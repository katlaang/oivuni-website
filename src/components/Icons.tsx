import Svg, { Path, Rect } from 'react-native-svg';
import { colors } from '../theme';

const common = { width: 36, height: 36, viewBox: '0 0 24 24', fill: 'none', stroke: colors.ink, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function PartnerIcon({ name }: { name: 'book' | 'institution' | 'briefcase' }) {
  if (name === 'book') {
    return (
      <Svg {...common} accessibilityElementsHidden importantForAccessibility="no">
        <Path d="M4 19.5V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2" />
        <Path d="M8 7h6" />
        <Path d="M8 11h4" />
      </Svg>
    );
  }
  if (name === 'institution') {
    return (
      <Svg {...common} accessibilityElementsHidden importantForAccessibility="no">
        <Path d="M3 10l9-6 9 6" />
        <Path d="M5 10v9" />
        <Path d="M19 10v9" />
        <Path d="M9 19v-6h6v6" />
        <Path d="M3 21h18" />
      </Svg>
    );
  }
  return (
    <Svg {...common} accessibilityElementsHidden importantForAccessibility="no">
      <Rect x={3} y={7} width={18} height={13} rx={2} />
      <Path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <Path d="M3 13h18" />
    </Svg>
  );
}
