import type { ZoneColor } from '../api/types';

/**
 * A zone's colour, shared by Admin → Space Zones, Space Map and the booking map: the light fill
 * (200) and the edge (700), as in Figma 3039:112245 and 3039:112388.
 */
export const ZONE_COLORS: Record<ZoneColor, { label: string; fill: string; edge: string }> = {
  blue: { label: 'Blue', fill: '#b3ccff', edge: '#0000ff' },
  green: { label: 'Green', fill: '#b9f9c4', edge: '#12872a' },
  orange: { label: 'Orange', fill: '#ffd6ae', edge: '#c4320a' },
  purple: { label: 'Purple', fill: '#ddd6fe', edge: '#6927da' },
  pink: { label: 'Pink', fill: '#fcceee', edge: '#c11574' },
  teal: { label: 'Teal', fill: '#99f6e0', edge: '#107569' },
  yellow: { label: 'Yellow', fill: '#fde272', edge: '#a15c07' },
  red: { label: 'Red', fill: '#fecdca', edge: '#d92d20' },
};

/** Zones are drawn in their colour, lightened: this much of the fill shows (as a hex alpha). */
export const ZONE_FILL_ALPHA = '8c';
