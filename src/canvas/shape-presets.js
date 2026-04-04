/**
 * Preset room shapes for SiteMeasure.
 * Each preset defines:
 *   key       — unique id
 *   label     — display name
 *   svg       — 32×28 viewBox SVG path for visual preview
 *   dims      — ordered list of dimension inputs (key, label, default mm)
 *   generate  — function(dimValues) → [{x,y},...] polygon points in mm
 */

export const SHAPE_PRESETS = [
  {
    key: 'rectangle',
    label: 'Rectangle',
    svg: `<rect x="2" y="3" width="28" height="22" fill="none" stroke="currentColor" stroke-width="2" rx="1"/>`,
    dims: [
      { key: 'w',  label: 'Width',  default: 5000, hint: 'e.g. 5000 mm' },
      { key: 'h',  label: 'Length', default: 4000, hint: 'e.g. 4000 mm' },
    ],
    generate({ w, h }) {
      return [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ];
    },
  },

  {
    key: 'l_shape',
    label: 'L-Shape',
    // Notch cut from the top-right corner
    svg: `<path d="M2,3 L30,3 L30,17 L18,17 L18,25 L2,25 Z" fill="none" stroke="currentColor" stroke-width="2"/>`,
    dims: [
      { key: 'outerW', label: 'Outer Width',    default: 7000, hint: 'e.g. 7000 mm' },
      { key: 'outerH', label: 'Outer Length',   default: 6000, hint: 'e.g. 6000 mm' },
      { key: 'cutW',   label: 'Cut Width',      default: 3000, hint: 'Width of removed corner' },
      { key: 'cutH',   label: 'Cut Length',     default: 3000, hint: 'Length of removed corner' },
    ],
    generate({ outerW, outerH, cutW, cutH }) {
      // Clamp cut to be smaller than outer
      const cW = Math.min(cutW,  outerW - 500);
      const cH = Math.min(cutH,  outerH - 500);
      return [
        { x: 0,           y: 0 },
        { x: outerW,      y: 0 },
        { x: outerW,      y: outerH - cH },
        { x: outerW - cW, y: outerH - cH },
        { x: outerW - cW, y: outerH },
        { x: 0,           y: outerH },
      ];
    },
  },

  {
    key: 't_shape',
    label: 'T-Shape',
    // Horizontal bar on top, stem extends downward from centre
    svg: `<path d="M2,3 L30,3 L30,13 L21,13 L21,25 L11,25 L11,13 L2,13 Z" fill="none" stroke="currentColor" stroke-width="2"/>`,
    dims: [
      { key: 'barW',  label: 'Bar Width',   default: 8000, hint: 'Full width of the bar' },
      { key: 'barH',  label: 'Bar Length',  default: 3000, hint: 'Depth of the top bar' },
      { key: 'stemW', label: 'Stem Width',  default: 3000, hint: 'Width of the stem' },
      { key: 'stemH', label: 'Stem Length', default: 4000, hint: 'Length of the stem' },
    ],
    generate({ barW, barH, stemW, stemH }) {
      const sW = Math.min(stemW, barW - 500);
      const stemX = Math.round((barW - sW) / 2);
      return [
        { x: 0,          y: 0 },
        { x: barW,       y: 0 },
        { x: barW,       y: barH },
        { x: stemX + sW, y: barH },
        { x: stemX + sW, y: barH + stemH },
        { x: stemX,      y: barH + stemH },
        { x: stemX,      y: barH },
        { x: 0,          y: barH },
      ];
    },
  },

  {
    key: 'u_shape',
    label: 'U-Shape',
    // Two arms + base; open gap at the top
    svg: `<path d="M2,3 L10,3 L10,16 L22,16 L22,3 L30,3 L30,25 L2,25 Z" fill="none" stroke="currentColor" stroke-width="2"/>`,
    dims: [
      { key: 'outerW', label: 'Outer Width',  default: 9000, hint: 'Overall width' },
      { key: 'outerH', label: 'Outer Length', default: 7000, hint: 'Overall length' },
      { key: 'gapW',   label: 'Gap Width',    default: 4000, hint: 'Width of the open gap' },
      { key: 'gapH',   label: 'Gap Length',   default: 5000, hint: 'Depth of the gap' },
    ],
    generate({ outerW, outerH, gapW, gapH }) {
      const gW   = Math.min(gapW, outerW - 1000);
      const gH   = Math.min(gapH, outerH - 500);
      const armW = Math.round((outerW - gW) / 2);
      return [
        { x: 0,          y: 0 },
        { x: armW,       y: 0 },
        { x: armW,       y: gH },
        { x: armW + gW,  y: gH },
        { x: armW + gW,  y: 0 },
        { x: outerW,     y: 0 },
        { x: outerW,     y: outerH },
        { x: 0,          y: outerH },
      ];
    },
  },
];

/**
 * Mirror a set of polygon points horizontally (flip on vertical axis).
 * The bounding box stays the same position.
 */
export function mirrorH(points) {
  const xs = points.map(p => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  return points.map(p => ({ x: minX + maxX - p.x, y: p.y }));
}

/**
 * Mirror a set of polygon points vertically (flip on horizontal axis).
 */
export function mirrorV(points) {
  const ys = points.map(p => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return points.map(p => ({ x: p.x, y: minY + maxY - p.y }));
}

/**
 * Offset all points by dx, dy (mm).
 */
export function translatePoints(points, dx, dy) {
  return points.map(p => ({ x: p.x + dx, y: p.y + dy }));
}
