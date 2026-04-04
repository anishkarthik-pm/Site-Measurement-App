import { state, getActiveProject, createRoom, updateRoom, deleteRoom } from '../state.js';
import { navigate } from '../router.js';
import { openSheet, closeSheet } from '../ui/bottom-sheet.js';
import { showToast } from '../ui/toast.js';
import { attachVoiceMicToAll } from '../ui/voice-input.js';
import { exportProject } from '../export/json-export.js';
import {
  canvasToMm, mmToCanvas,
  getBoundingBox, isPointInPolygon, calcArea,
} from '../canvas/canvas-utils.js';
import {
  SHAPE_PRESETS, mirrorH, mirrorV, translatePoints,
} from '../canvas/shape-presets.js';

// ── Room color palette ────────────────────────────────
const ROOM_COLORS = [
  '#3b82f6','#10b981','#f59e0b','#8b5cf6',
  '#ef4444','#06b6d4','#f97316','#ec4899',
];

// ── Canvas / viewport state ──────────────────────────
let canvas  = null;
let ctx     = null;

let scale   = 0.12;   // px per mm  (1× ≡ 100mm = 12px)
let offsetX = 60;
let offsetY = 60;
const MIN_SCALE = 0.03;
const MAX_SCALE = 0.5;

// ── Tool / selection state ───────────────────────────
let activeTool     = 'select'; // 'select' | 'delete' | 'pan'
let selectedRoomId = null;

// ── Pointer tracking ─────────────────────────────────
let pointers      = {};
let prevPinchDist = null;
let isPanning     = false;
let panStart      = null;
let tapDownPos    = null;   // position at pointerdown, for tap detection

// ─────────────────────────────────────────────────────
function getContainer() { return document.getElementById('screen-plan'); }

// ── Init (called once on app start) ──────────────────
export function initPlanScreen() {
  const container = getContainer();
  if (!container) return;

  container.innerHTML = `
    <div class="plan-screen-inner">
      <div class="screen-header">
        <button class="back-btn" id="plan-back">←</button>
        <span class="screen-title" id="plan-project-name">Plan</span>
        <button class="icon-btn" id="plan-export-btn" title="Export">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
      </div>

      <div class="plan-toolbar" id="plan-toolbar">
        <button class="tool-btn" data-tool="select">
          <span class="tool-icon">↖</span><span>Select</span>
        </button>
        <button class="tool-btn" data-tool="delete">
          <span class="tool-icon">🗑</span><span>Delete</span>
        </button>
        <button class="tool-btn" data-tool="pan">
          <span class="tool-icon">↔</span><span>Pan</span>
        </button>
        <div class="toolbar-spacer"></div>
        <button class="add-room-btn" id="add-room-btn">+ Room</button>
      </div>

      <div class="canvas-container" id="canvas-container">
        <canvas class="plan-canvas" id="plan-canvas"></canvas>
        <div class="canvas-zoom-badge" id="zoom-badge">1.0×</div>
      </div>

      <div class="plan-action-bar" id="plan-action-bar">
        <div class="action-content" id="action-content"></div>
      </div>
    </div>
  `;

  canvas = document.getElementById('plan-canvas');
  ctx    = canvas.getContext('2d');

  setupPointerEvents();
  setupToolbar();
  setTool('select');

  document.getElementById('plan-back').addEventListener('click', () => {
    selectedRoomId = null;
    hideActionBar();
    navigate('projects');
  });

  document.getElementById('plan-export-btn').addEventListener('click', () => {
    const proj = getActiveProject();
    if (!proj) return;
    exportProject(proj);
    showToast('Project exported', 'success');
  });

  document.getElementById('add-room-btn').addEventListener('click', () => {
    openShapePicker();
  });

  window.addEventListener('resize', () => {
    setupCanvasSize();
    renderCanvas();
  });
}

// ── Render (called on every nav to Plan tab) ─────────
export function renderPlan() {
  const proj   = getActiveProject();
  const nameEl = document.getElementById('plan-project-name');
  if (nameEl) nameEl.textContent = proj?.name || 'Plan';

  selectedRoomId = null;
  hideActionBar();

  // The screen was display:none when initPlanScreen ran, so canvas was 0×0.
  // Wait one rAF for the screen to be laid out before measuring.
  requestAnimationFrame(() => {
    setupCanvasSize();
    centerView();
    renderCanvas();
  });
}

// ── Canvas sizing ─────────────────────────────────────
function setupCanvasSize() {
  const container = document.getElementById('canvas-container');
  if (!container || !canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w   = container.clientWidth  || window.innerWidth;
  const h   = container.clientHeight || (window.innerHeight - 180);
  if (w === 0 || h === 0) return;
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(dpr, dpr);
}

function getLogicalSize() {
  const dpr = window.devicePixelRatio || 1;
  return { w: canvas.width / dpr, h: canvas.height / dpr };
}

/** Fit all rooms in view, or show default origin if no rooms. */
function centerView() {
  const proj = getActiveProject();
  const { w, h } = getLogicalSize();
  if (!proj || proj.rooms.length === 0) {
    // Show a 20 m × 20 m area centred
    scale   = Math.min(w, h) / 20000 * 0.7;
    offsetX = w / 2 - 10000 * scale;
    offsetY = h / 2 - 10000 * scale;
    return;
  }
  // Collect all points
  const allPts = proj.rooms.flatMap(r => r.shape_points || []);
  if (allPts.length === 0) return;
  const bb = getBoundingBox(allPts);
  const pad = 60; // px padding
  const scaleX = (w - pad * 2) / (bb.width  || 1);
  const scaleY = (h - pad * 2) / (bb.height || 1);
  scale   = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(scaleX, scaleY)));
  offsetX = pad - bb.minX * scale;
  offsetY = pad - bb.minY * scale;
}

// ── Canvas render ─────────────────────────────────────
function renderCanvas() {
  if (!canvas || !ctx) return;
  const { w, h } = getLogicalSize();
  ctx.clearRect(0, 0, w, h);
  drawGrid(w, h);

  const proj = getActiveProject();
  if (proj) proj.rooms.forEach(r => drawRoom(r, r.id === selectedRoomId));

  const badge = document.getElementById('zoom-badge');
  if (badge) badge.textContent = (scale / 0.12).toFixed(1) + '×';
}

function drawGrid(w, h) {
  const gridPx = 100 * scale;
  if (gridPx < 3) return;

  const sx = ((offsetX % gridPx) + gridPx) % gridPx;
  const sy = ((offsetY % gridPx) + gridPx) % gridPx;

  ctx.save();
  ctx.strokeStyle = '#1c2330';
  ctx.lineWidth   = 0.5;
  for (let x = sx; x <= w; x += gridPx) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
  for (let y = sy; y <= h; y += gridPx) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }

  ctx.fillStyle    = '#556070';
  ctx.font         = '10px JetBrains Mono, monospace';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('1 square = 100 mm', 8, h - 8);
  ctx.restore();
}

function drawRoom(room, isSelected) {
  const pts = (room.shape_points || []);
  if (pts.length < 3) return;

  const cpx = pts.map(p => ({
    x: mmToCanvas(p.x, scale, offsetX),
    y: mmToCanvas(p.y, scale, offsetY),
  }));

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cpx[0].x, cpx[0].y);
  for (let i = 1; i < cpx.length; i++) ctx.lineTo(cpx[i].x, cpx[i].y);
  ctx.closePath();

  const color = room.color || '#3b82f6';
  ctx.fillStyle   = hexAlpha(color, 0.18);
  ctx.fill();
  ctx.strokeStyle = isSelected ? '#3b82f6' : color;
  ctx.lineWidth   = isSelected ? 3 : 2;
  ctx.stroke();

  // Wall thickness inner dashed
  const tPx = (room.wall_thickness_mm || 150) * scale;
  if (tPx >= 1) {
    const inner = shrinkPoly(cpx, tPx);
    if (inner.length >= 3) {
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = hexAlpha(color, 0.45);
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(inner[0].x, inner[0].y);
      inner.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // Label
  const bb = getBoundingBox(pts);
  const cx = mmToCanvas(bb.minX + bb.width / 2,  scale, offsetX);
  const cy = mmToCanvas(bb.minY + bb.height / 2, scale, offsetY);

  ctx.fillStyle    = '#e2e8f0';
  ctx.font         = '600 13px Sora, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(room.name || 'Room', cx, cy - 9);

  ctx.fillStyle = '#556070';
  ctx.font      = '600 10px JetBrains Mono, monospace';
  ctx.fillText(`${room.dimensions.bounding_length_mm}×${room.dimensions.bounding_width_mm} mm`, cx, cy + 9);

  // Selection handles (corners)
  if (isSelected) {
    ctx.fillStyle = '#3b82f6';
    cpx.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.restore();
}

function shrinkPoly(pts, amount) {
  try {
    const norm = v => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x/l, y: v.y/l }; };
    return pts.map((p, i) => {
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const next = pts[(i + 1) % pts.length];
      const d1 = norm({ x: p.x - prev.x, y: p.y - prev.y });
      const d2 = norm({ x: next.x - p.x, y: next.y - p.y });
      const n  = norm({ x: d1.x + d2.x, y: d1.y + d2.y });
      return { x: p.x + n.x * amount, y: p.y + n.y * amount };
    });
  } catch { return []; }
}

function hexAlpha(hex, a) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Pointer events ────────────────────────────────────
function setupPointerEvents() {
  canvas.addEventListener('pointerdown',   onPtrDown,   { passive: false });
  canvas.addEventListener('pointermove',   onPtrMove,   { passive: false });
  canvas.addEventListener('pointerup',     onPtrUp,     { passive: false });
  canvas.addEventListener('pointercancel', onPtrCancel, { passive: false });
  canvas.addEventListener('wheel',         onWheel,     { passive: false });
}

function onPtrDown(e) {
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  pointers[e.pointerId] = { x: e.clientX, y: e.clientY };

  const count = Object.keys(pointers).length;
  if (count === 1) {
    tapDownPos = { x: e.clientX, y: e.clientY };
    isPanning  = (activeTool === 'pan');
    panStart   = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };
    prevPinchDist = null;
  }
  if (count === 2) {
    isPanning = true;
    const [a, b] = Object.values(pointers);
    prevPinchDist = Math.hypot(b.x - a.x, b.y - a.y);
  }
}

function onPtrMove(e) {
  e.preventDefault();
  if (!pointers[e.pointerId]) return;
  pointers[e.pointerId] = { x: e.clientX, y: e.clientY };

  const vals = Object.values(pointers);
  if (vals.length === 2) {
    const dist = Math.hypot(vals[1].x - vals[0].x, vals[1].y - vals[0].y);
    if (prevPinchDist !== null) {
      const mid = { x: (vals[0].x + vals[1].x) / 2, y: (vals[0].y + vals[1].y) / 2 };
      applyZoom(1 + (dist - prevPinchDist) * 0.005, mid.x, mid.y);
      renderCanvas();
    }
    prevPinchDist = dist;
    return;
  }

  if (isPanning && panStart) {
    offsetX = panStart.ox + (e.clientX - panStart.x);
    offsetY = panStart.oy + (e.clientY - panStart.y);
    renderCanvas();
  }
}

function onPtrUp(e) {
  e.preventDefault();
  const downPos = tapDownPos;
  delete pointers[e.pointerId];

  const remaining = Object.keys(pointers).length;
  if (remaining < 2) prevPinchDist = null;
  if (remaining > 0) { isPanning = false; return; }

  const wasPanning = isPanning;
  isPanning  = false;
  panStart   = null;
  tapDownPos = null;

  if (!wasPanning && downPos) {
    const dx = Math.abs(e.clientX - downPos.x);
    const dy = Math.abs(e.clientY - downPos.y);
    if (dx < 10 && dy < 10) handleTap(e.clientX, e.clientY);
  }
}

function onPtrCancel(e) {
  delete pointers[e.pointerId];
  if (Object.keys(pointers).length < 2) prevPinchDist = null;
  isPanning = false; panStart = null;
}

function onWheel(e) {
  e.preventDefault();
  applyZoom(e.deltaY < 0 ? 1.12 : 0.89, e.clientX, e.clientY);
  renderCanvas();
}

function applyZoom(factor, pivotClientX, pivotClientY) {
  const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));
  if (ns === scale) return;
  const rect = canvas.getBoundingClientRect();
  const px = pivotClientX - rect.left;
  const py = pivotClientY - rect.top;
  offsetX = px - (px - offsetX) * (ns / scale);
  offsetY = py - (py - offsetY) * (ns / scale);
  scale   = ns;
}

// ── Tap handler ───────────────────────────────────────
function handleTap(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const pxX  = clientX - rect.left;
  const pxY  = clientY - rect.top;
  const mmX  = canvasToMm(pxX, scale, offsetX);
  const mmY  = canvasToMm(pxY, scale, offsetY);

  const proj = getActiveProject();
  if (!proj) return;

  const hit = proj.rooms.find(r =>
    r.shape_points && isPointInPolygon({ x: mmX, y: mmY }, r.shape_points)
  );

  if (activeTool === 'select') {
    if (hit) {
      if (selectedRoomId === hit.id) {
        selectedRoomId = null;
        hideActionBar();
      } else {
        selectedRoomId = hit.id;
        showRoomActionBar(hit);
      }
    } else {
      selectedRoomId = null;
      hideActionBar();
    }
    renderCanvas();
  }

  if (activeTool === 'delete') {
    if (hit) promptDeleteRoom(hit);
    renderCanvas();
  }
}

// ── Tool switching ────────────────────────────────────
function setupToolbar() {
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });
}

function setTool(tool) {
  activeTool = tool;
  document.querySelectorAll('.tool-btn').forEach(btn =>
    btn.classList.toggle('tool-active', btn.dataset.tool === tool)
  );
  if (tool !== 'select') {
    selectedRoomId = null;
    hideActionBar();
    renderCanvas();
  }
}

// ── Action bars ───────────────────────────────────────
function showRoomActionBar(room) {
  const bar     = document.getElementById('plan-action-bar');
  const content = document.getElementById('action-content');
  if (!bar || !content) return;

  content.innerHTML = `
    <div style="display:flex;gap:6px;width:100%;flex-wrap:wrap">
      <button class="btn-secondary" id="bar-edit"   style="flex:1;min-width:70px">✎ Edit</button>
      <button class="btn-secondary" id="bar-clone"  style="flex:1;min-width:70px">⧉ Clone</button>
      <button class="btn-secondary" id="bar-mirror" style="flex:1;min-width:70px">⟺ Mirror</button>
      <button class="btn-danger"    id="bar-delete" style="flex:1;min-width:70px">🗑</button>
    </div>
    <div id="mirror-sub" style="display:none;gap:6px;width:100%;margin-top:6px">
      <button class="btn-secondary" id="bar-mirrorH" style="flex:1">↔ Flip H</button>
      <button class="btn-secondary" id="bar-mirrorV" style="flex:1">↕ Flip V</button>
      <button class="btn-secondary" id="bar-mirrorCancel" style="flex:1">✕</button>
    </div>
  `;
  bar.classList.add('visible');

  document.getElementById('bar-edit').onclick = () => openRoomEditSheet(room);

  document.getElementById('bar-clone').onclick = () => {
    const proj = getActiveProject();
    if (!proj) return;
    const orig = proj.rooms.find(r => r.id === room.id);
    if (!orig) return;
    const bb     = getBoundingBox(orig.shape_points);
    const offset = bb.width + 500;
    const newPts = translatePoints(orig.shape_points, offset, 0);
    const newBb  = getBoundingBox(newPts);
    const colorIdx = proj.rooms.length % ROOM_COLORS.length;
    createRoom(state.activeProjectId, {
      name:             orig.name + ' (Copy)',
      shape_points:     newPts,
      dimensions: {
        bounding_length_mm: Math.round(newBb.height),
        bounding_width_mm:  Math.round(newBb.width),
        height_mm:          orig.dimensions.height_mm,
      },
      wall_thickness_mm: orig.wall_thickness_mm,
      floor_area_sqmm:   orig.floor_area_sqmm,
      color:             ROOM_COLORS[colorIdx],
    });
    if (navigator.vibrate) navigator.vibrate(10);
    showToast('Room cloned', 'success');
    selectedRoomId = null;
    hideActionBar();
    renderCanvas();
  };

  document.getElementById('bar-mirror').onclick = () => {
    const sub = document.getElementById('mirror-sub');
    if (sub) { sub.style.display = sub.style.display === 'none' ? 'flex' : 'none'; }
  };

  document.getElementById('bar-mirrorH').onclick = () => doMirror('h', room);
  document.getElementById('bar-mirrorV').onclick = () => doMirror('v', room);
  document.getElementById('bar-mirrorCancel').onclick = () => {
    const sub = document.getElementById('mirror-sub');
    if (sub) sub.style.display = 'none';
  };

  document.getElementById('bar-delete').onclick = () => promptDeleteRoom(room);
}

function doMirror(axis, room) {
  const proj = getActiveProject();
  if (!proj) return;
  const orig = proj.rooms.find(r => r.id === room.id);
  if (!orig) return;
  const newPts = axis === 'h' ? mirrorH(orig.shape_points) : mirrorV(orig.shape_points);
  updateRoom(state.activeProjectId, room.id, { shape_points: newPts });
  if (navigator.vibrate) navigator.vibrate(10);
  showToast(`Mirrored ${axis === 'h' ? 'horizontally' : 'vertically'}`, 'success');
  hideActionBar();
  selectedRoomId = null;
  renderCanvas();
}

function promptDeleteRoom(room) {
  const bar     = document.getElementById('plan-action-bar');
  const content = document.getElementById('action-content');
  if (!bar || !content) return;
  bar.classList.add('visible');
  content.innerHTML = `
    <div style="display:flex;gap:8px;width:100%;align-items:center">
      <span style="flex:1;font-size:13px;color:var(--muted)">Delete <strong style="color:var(--text)">${escHtml(room.name)}</strong>?</span>
      <button class="btn-secondary" id="del-cancel">Cancel</button>
      <button class="btn-danger"    id="del-confirm">Delete</button>
    </div>
  `;
  document.getElementById('del-cancel').onclick = () => {
    selectedRoomId = null; hideActionBar(); renderCanvas();
  };
  document.getElementById('del-confirm').onclick = () => {
    deleteRoom(state.activeProjectId, room.id);
    if (navigator.vibrate) navigator.vibrate([10,50,10]);
    showToast('Room deleted', 'error');
    selectedRoomId = null; hideActionBar(); renderCanvas();
  };
}

function hideActionBar() {
  const bar = document.getElementById('plan-action-bar');
  if (bar) bar.classList.remove('visible');
}

// ── Shape picker sheet ────────────────────────────────
function openShapePicker(editRoom = null) {
  const isEdit = !!editRoom;

  const sheetHtml = `
    <div id="shape-picker-wrap">
      ${!isEdit ? `
      <p style="font-size:12px;color:var(--muted);margin-bottom:12px">Choose a room shape:</p>
      <div class="shape-preset-grid" id="shape-grid">
        ${SHAPE_PRESETS.map(s => `
          <button class="shape-preset-card" data-key="${s.key}" type="button">
            <svg viewBox="0 0 32 28" class="shape-preview-svg">${s.svg}</svg>
            <span class="shape-preset-label">${s.label}</span>
          </button>
        `).join('')}
      </div>
      ` : ''}
      <div id="shape-dim-form" ${!isEdit ? 'style="display:none"' : ''}>
        ${isEdit ? buildDimForm(editRoom) : ''}
      </div>
    </div>
  `;

  openSheet({ title: isEdit ? 'Edit Room' : 'Add Room', content: sheetHtml });

  setTimeout(() => {
    if (!isEdit) {
      document.querySelectorAll('.shape-preset-card').forEach(card => {
        card.addEventListener('click', () => {
          document.querySelectorAll('.shape-preset-card').forEach(c => c.classList.remove('shape-card-active'));
          card.classList.add('shape-card-active');
          const preset = SHAPE_PRESETS.find(s => s.key === card.dataset.key);
          if (!preset) return;
          const formEl = document.getElementById('shape-dim-form');
          if (formEl) {
            formEl.style.display = 'block';
            formEl.innerHTML = buildDimForm(null, preset);
            attachVoiceMicToAll(formEl);
            attachFormSubmit(null, preset);
          }
        });
      });
    } else {
      attachVoiceMicToAll(document.getElementById('shape-dim-form'));
      // Figure out which preset was used
      const preset = SHAPE_PRESETS.find(s => s.key === editRoom._presetKey) || SHAPE_PRESETS[0];
      attachFormSubmit(editRoom, preset);
    }
  }, 50);
}

function buildDimForm(editRoom, preset) {
  // If editing, reconstruct preset from editRoom
  if (editRoom && !preset) {
    preset = SHAPE_PRESETS.find(s => s.key === editRoom._presetKey) || SHAPE_PRESETS[0];
  }
  if (!preset) return '';

  const dimFields = preset.dims.map(d => `
    <label class="form-label">${d.label} (mm)
      <input class="form-input" type="number" inputmode="numeric"
             data-voice="true" name="${d.key}"
             value="${editRoom?._dimValues?.[d.key] ?? d.default}"
             placeholder="${d.hint}">
    </label>
  `).join('');

  return `
    <form class="sheet-form" id="room-dim-form" autocomplete="off" style="margin-top:12px">
      <label class="form-label">Room Name *
        <input class="form-input" type="text" name="name" required
               value="${escHtml(editRoom?.name || '')}"
               placeholder="e.g. Main Hall">
      </label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${dimFields}
      </div>
      <label class="form-label">Height (mm)
        <input class="form-input" type="number" inputmode="numeric"
               data-voice="true" name="height_mm"
               value="${editRoom?.dimensions?.height_mm ?? 3000}"
               placeholder="e.g. 3000 mm">
      </label>
      <label class="form-label">Wall Thickness (mm)
        <input class="form-input" type="number" inputmode="numeric"
               data-voice="true" name="wall_thickness_mm"
               value="${editRoom?.wall_thickness_mm ?? 150}"
               placeholder="e.g. 150 mm">
      </label>
      <button class="btn-primary" type="submit">${editRoom ? 'Save Changes' : 'Place Room'}</button>
    </form>
  `;
}

function attachFormSubmit(editRoom, preset) {
  const form = document.getElementById('room-dim-form');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    const fd   = new FormData(form);
    const data = Object.fromEntries(fd.entries());

    // Collect dimension values
    const dimValues = {};
    preset.dims.forEach(d => {
      dimValues[d.key] = parseInt(data[d.key]) || d.default;
    });

    const points = preset.generate(dimValues);
    const bb     = getBoundingBox(points);

    // Centre the shape in the current view for new rooms
    let finalPoints = points;
    if (!editRoom) {
      const { w, h } = getLogicalSize();
      const viewCx  = canvasToMm(w / 2, scale, offsetX);
      const viewCy  = canvasToMm(h / 2, scale, offsetY);
      finalPoints   = translatePoints(points, viewCx - bb.width / 2, viewCy - bb.height / 2);
    }

    const finalBb = getBoundingBox(finalPoints);
    const area    = calcArea(finalPoints);

    if (editRoom) {
      updateRoom(state.activeProjectId, editRoom.id, {
        name:         data.name || editRoom.name,
        shape_points: finalPoints,
        dimensions: {
          bounding_length_mm: Math.round(finalBb.height),
          bounding_width_mm:  Math.round(finalBb.width),
          height_mm:          parseInt(data.height_mm) || 3000,
        },
        wall_thickness_mm: parseInt(data.wall_thickness_mm) || 150,
        floor_area_sqmm:   Math.round(area),
        _presetKey:        preset.key,
        _dimValues:        dimValues,
      });
      showToast('Room updated', 'success');
    } else {
      const proj     = getActiveProject();
      const colorIdx = proj ? proj.rooms.length % ROOM_COLORS.length : 0;
      createRoom(state.activeProjectId, {
        name:         data.name || 'Room',
        shape_points: finalPoints,
        dimensions: {
          bounding_length_mm: Math.round(finalBb.height),
          bounding_width_mm:  Math.round(finalBb.width),
          height_mm:          parseInt(data.height_mm) || 3000,
        },
        wall_thickness_mm: parseInt(data.wall_thickness_mm) || 150,
        floor_area_sqmm:   Math.round(area),
        color:             ROOM_COLORS[colorIdx],
        _presetKey:        preset.key,
        _dimValues:        dimValues,
      });
      showToast('Room placed', 'success');
    }

    if (navigator.vibrate) navigator.vibrate(10);
    closeSheet(false);
    setTool('select');
    selectedRoomId = null;
    hideActionBar();
    requestAnimationFrame(() => {
      centerView();
      renderCanvas();
    });
  });
}

function openRoomEditSheet(room) {
  openShapePicker(room);
}

// ── Helpers ───────────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
