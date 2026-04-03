/**
 * Convert mm coordinates to canvas pixels
 * @param {number} mm - value in millimeters
 * @param {number} scale - pixels per mm
 * @param {number} offset - pan offset in pixels
 */
export function mmToCanvas(mm, scale, offset) {
  return mm * scale + offset;
}

/**
 * Convert canvas pixels to mm coordinates
 * @param {number} px - pixel value
 * @param {number} scale - pixels per mm
 * @param {number} offset - pan offset in pixels
 */
export function canvasToMm(px, scale, offset) {
  return (px - offset) / scale;
}

/**
 * Snap a mm value to the nearest grid point
 * @param {number} mmVal
 * @param {number} gridMm
 */
export function snapToGrid(mmVal, gridMm = 100) {
  return Math.round(mmVal / gridMm) * gridMm;
}

/**
 * Check if two canvas points are within threshold pixels
 */
export function isPointNear(p1, p2, thresholdPx) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy) <= thresholdPx;
}

/**
 * Get bounding box of an array of mm points
 * @param {{x:number,y:number}[]} points
 * @returns {{minX, minY, maxX, maxY, width, height}}
 */
export function getBoundingBox(points) {
  if (!points || points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Ray-casting point-in-polygon test
 * @param {{x:number,y:number}} point
 * @param {{x:number,y:number}[]} polygon
 */
export function isPointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  const { x, y } = point;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Calculate polygon area using shoelace formula
 * @param {{x:number,y:number}[]} points
 * @returns {number} area in sqmm
 */
export function calcArea(points) {
  if (!points || points.length < 3) return 0;
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}
