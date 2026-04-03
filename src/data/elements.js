export const ELEMENT_TYPES = [
  { key: 'window',     label: 'Window',        icon: '🪟', w: 1200, h: 1200, d: 150 },
  { key: 'beam',       label: 'Beam',          icon: '🔩', w: 600,  h: 300,  d: 300 },
  { key: 'column',     label: 'Column',        icon: '🏛️', w: 450,  h: 3000, d: 450 },
  { key: 'niche',      label: 'Niche',         icon: '📦', w: 900,  h: 600,  d: 300 },
  { key: 'elec',       label: 'Electrical Pt', icon: '⚡', w: 150,  h: 150,  d: 30  },
  { key: 'plumb',      label: 'Plumbing Pt',   icon: '🚿', w: 150,  h: 300,  d: 150 },
  { key: 'ac',         label: 'AC Unit',       icon: '❄️', w: 900,  h: 300,  d: 300 },
  { key: 'vent',       label: 'Vent',          icon: '💨', w: 300,  h: 300,  d: 150 },
  { key: 'staircase',  label: 'Staircase',     icon: '🪜', w: 1200, h: 2400, d: 3000},
  { key: 'false_ceil', label: 'False Ceiling', icon: '⬛', w: 0,    h: 0,    d: 300 },
];

export const ELEMENT_DEFAULTS = {};
ELEMENT_TYPES.forEach(t => {
  ELEMENT_DEFAULTS[t.key] = { w: t.w, h: t.h, d: t.d };
});
