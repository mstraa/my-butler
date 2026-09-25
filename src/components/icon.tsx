import Svg, { Path } from 'react-native-svg';

/** Tracés repris des maquettes (icônes au trait, 24×24). */
export const iconPaths = {
  calendar: 'M6 5h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM3 10h18M8 3v4M16 3v4',
  target: 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0M8.5 12a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0',
  wallet: 'M6 6h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3zM3 10h18M16 15h2',
  pulse: 'M3 12h4l3 7 4-14 3 7h4',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  plus: 'M12 5v14M5 12h14',
  gear:
    'M12 15a3 3 0 1 0 0-6a3 3 0 1 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  back: 'M19 12H5M11 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  work: 'M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 13h18',
  friends: 'M6 8a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3 20a6 6 0 0 1 12 0M15 5a3 3 0 0 1 0 6M17 14a4.5 4.5 0 0 1 4 6',
  health: 'M3 12h4l2-5 4 10 2-5h6',
  cart: 'M3 4h2l2.4 11h10.8L21 8H6.2M8 19.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0M17 19.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  cake: 'M4 21h16v-8H4zM4 16c2 1.5 4 1.5 5.3 0 1.4 1.5 4 1.5 5.4 0 1.3 1.5 3.3 1.5 5.3 0M12 13V9M12 6.5c-.8-.8-.8-2 0-3 .8 1 .8 2.2 0 3z',
  sport: 'M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12',
  glass: 'M7 3h10l-1 7a4 4 0 0 1-8 0zM12 14v6M8 21h8',
  task: 'M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3zM8 12l3 3 5-6',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  drop: 'M12 3c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z',
  note: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
  home: 'M4 10.5L12 4l8 6.5V20H4zM10 20v-6h4v6',
  sun: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  clock: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2',
  x: 'M6 6l12 12M18 6L6 18',
} as const;

export type IconName = keyof typeof iconPaths;

export function Icon({
  name,
  size = 22,
  color = '#F4F4F2',
  strokeWidth = 1.8,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={iconPaths[name]}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
