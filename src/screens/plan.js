import { state, getActiveProject, createRoom, updateRoom, deleteRoom, saveState } from '../state.js';
import { navigate } from '../router.js';
import { openSheet, closeSheet } from '../ui/bottom-sheet.js';
import { showToast } from '../ui/toast.js';
import { attachVoiceMicToAll } from '../ui/voice-input.js';
import { exportProject } from '../export/json-export.js';
import { OrthoSpline } from '../canvas/ortho-spline.js';
import {
  canvasToMm, mmToCanvas, snapToGrid,
  getBoundingBox, isPointInPolygon, calcArea
} from '../canvas/canvas-utils.js';

const ROOM_COLORS = [
  '#3b82f6','#10b981','#f59e0b','#8b5cf6',
  '#ef4444','#06b6d4','#f97316','#ec4899',
];

let canvas = null;
let ctx    = null;
let spline = null;

// Viewport transform
let scale   = 0.12; // pixels per mm (at 1× zoom, 100mm = 12px)
let offsetX = 100;
let offsetY = 100;
const MIN_ZOOM = 0.03;
const MAX_ZOOM = 0.5;

// Tool state
let activeTool = 'draw'; // 'draw' | 'select' | 'delete' | 'pan'
let selectedRoomId = null;
let confirmDeleteId = null;

// Pointer tracking for pan + pinch
let pointers = {};
let prevPinchDist = null;
let isPanning = false;
let panStart = null;
let lastSinglePos = null;

function getContainer() {
  return document.getElementById('screen-plan');
}

export function initPlanScreen() {
  const container = getContainer();
  if (!container) return;

  container.innerHTML = `
    <div class="plan-screen-inner">
      <div class="screen-header">
        <button class="back-btn" id="plan-back">←</button>
        <span class="screen-title" id="plan-project-name">Plan</span>
        <button class="icon-btn" id="plan-export-btn" title="Export project">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
      </div>

      <div class="plan-toolbar" id="plan-toolbar">
        <button class="tool-btn tool-active" data-tool="draw">
          <span class="tool-icon">✏️</span><span>Draw</span>
        </button>
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

  spline = new OrthoSpline(canvas, onShapeClose);

  setupCanvasSize();
  setupPointerEvents();
  setupToolbar();

  document.getElementById('plan-back').addEventListener('click', () => {
    spline.stop();
    spline.reset();
    navigate('projects');
  });

  document.getElementById('plan-export-btn').addEventListener('click', () => {
    const proj = getActiveProject();
    if (!proj) return;
    exportProject(proj);
    showToast('Project exported', 'success');
  });

  document.getElementById('add-room-btn').addEventListener('click', () => {
    setTool('draw');
    spline.start();
    showToast('Tap to place first corner', 'info');
  });

  window.addEventListener('resize', () => {
    setupCanvasSize();
    renderCanvas();
  });

  renderCanvas();
}

export function renderPlan() {
  const proj = getActiveProject();
  const nameEl = document.getElementById('plan-project-name');
  if (nameEl) nameEl.textContent = proj ? proj.name : 'Plan';

  // Reset view state when switching projects
  selectedRoomId = null;
  confirmDeleteId = null;
  hideActionBar();

  if (proj && proj.rooms.length === 0) {
    setTool('draw');
    spline.start();
    showToast('Tap to place first corner', 'info');
  }

  renderCanvas();
}

function setupCanvasSize() {
  const container = document.getElementById('canvas-container');
  if (!container || !canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = container.clientWidth;
  const h = container.clientHeight;
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(dpr, dpr);
}

function getCanvasLogicalSize() {
  const dpr = window.devicePixelRatio || 1;
  return { w: canvas.width / dpr, h: canvas.height / dpr };
}

// ── Rendering ────────────────────────────────────────
function renderCanvas() {
  if (!canvas || !ctx) return;
  const { w, h } = getCanvasLogicalSize();
  ctx.clearRect(0, 0, w, h);

  drawGrid(w, h);

  const proj = getActiveProject();
  if (proj) {
    for (const room of proj.rooms) {
      drawRoom(room, room.id === selectedRoomId);
    }
  }

  // Draw spline preview
  spline.scale   = scale;
  spline.offsetX = offsetX;
  spline.offsetY = offsetY;
  spline.drawPreview(ctx, { scale, offsetX, offsetY });

  // Zoom badge
  const badge = document.getElementById('zoom-badge');
  if (badge) badge.textContent = (scale / 0.12).toFixed(1) + '×';
}

function drawGrid(w, h) {
  const gridMm  = 100;
  const gridPx  = gridMm * scale;

  if (gridPx < 4) return; // too dense to draw

  const startX = ((offsetX % gridPx) + gridPx) % gridPx;
  const startY = ((offsetY % gridPx) + gridPx) % gridPx;

  ctx.save();
  ctx.strokeStyle = '#1c2330';
  ctx.lineWidth = 0.5;

  for (let x = startX; x <= w; x += gridPx) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = startY; y <= h; y += gridPx) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  ctx.fillStyle = '#556070';
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.fillText('1 square = 100mm', 8, h - 8);
  ctx.restore();
}

function drawRoom(room, isSelected) {
  if (!room.shape_points || room.shape_points.length < 3) return;

  const pts = room.shape_points.map(p => ({
    x: mmToCanvas(p.x, scale, offsetX),
    y: mmToCanvas(p.y, scale, offsetY),
  }));

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();

  // Fill
  const color = room.color || '#3b82f6';
  ctx.fillStyle = hexToRgba(color, 0.15);
  ctx.fill();

  // Stroke
  ctx.strokeStyle = isSelected ? '#3b82f6' : color;
  ctx.lineWidth   = isSelected ? 3 : 2;
  ctx.stroke();

  // Wall thickness dashed inner stroke
  const t = (room.wall_thickness_mm || 150) * scale;
  if (t > 1) {
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = hexToRgba(color, 0.4);
    ctx.lineWidth   = 0.5;
    ctx.setLineDash([4, 3]);
    const pts2 = shrinkPolygon(pts, t);
    if (pts2.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(pts2[0].x, pts2[0].y);
      for (let i = 1; i < pts2.length; i++) ctx.lineTo(pts2[i].x, pts2[i].y);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Label
  const bb = getBoundingBox(room.shape_points);
  const cx = mmToCanvas(bb.minX + bb.width / 2, scale, offsetX);
  const cy = mmToCanvas(bb.minY + bb.height / 2, scale, offsetY);

  ctx.fillStyle = '#e2e8f0';
  ctx.font      = '600 13px Sora, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(room.name || 'Room', cx, cy - 8);

  ctx.fillStyle = '#556070';
  ctx.font      = '600 10px JetBrains Mono, monospace';
  ctx.fillText(
    `${room.dimensions.bounding_length_mm}×${room.dimensions.bounding_width_mm} mm`,
    cx, cy + 8
  );

  ctx.restore();
}

/** Shrink polygon inward by `amount` pixels for wall thickness dashed line */
function shrinkPolygon(pts, amount) {
  try {
    return pts.map((p, i) => {
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const next = pts[(i + 1) % pts.length];
      const d1 = normalize({ x: p.x - prev.x, y: p.y - prev.y });
      const d2 = normalize({ x: next.x - p.x, y: next.y - p.y });
      const n1 = { x: -d1.y, y:  d1.x };
      const n2 = { x: -d2.y, y:  d2.x };
      const n  = normalize({ x: n1.x + n2.x, y: n1.y + n2.y });
      return { x: p.x + n.x * amount, y: p.y + n.y * amount };
    });
  } catch { return []; }
}
function normalize(v) {
  const len = Math.sqrt(v.x*v.x + v.y*v.y) || 1;
  return { x: v.x/len, y: v.y/len };
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Pointer events ───────────────────────────────────
function setupPointerEvents() {
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup',   onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('wheel', onWheel, { passive: false });
}

function clientToCanvas(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left),
    y: (clientY - rect.top),
  };
}

function onPointerDown(e) {
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  pointers[e.pointerId] = { x: e.clientX, y: e.clientY };

  const pcount = Object.keys(pointers).length;

  if (pcount === 1) {
    lastSinglePos = { x: e.clientX, y: e.clientY };
    isPanning = (activeTool === 'pan');
    panStart  = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };
    prevPinchDist = null;
  }

  if (pcount === 2) {
    isPanning = true;
    const pids = Object.keys(pointers);
    const p0 = pointers[pids[0]];
    const p1 = pointers[pids[1]];
    prevPinchDist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  }
}

function onPointerMove(e) {
  e.preventDefault();
  if (!pointers[e.pointerId]) return;
  pointers[e.pointerId] = { x: e.clientX, y: e.clientY };

  const pids = Object.keys(pointers);

  if (pids.length === 2) {
    // Pinch zoom
    const [pid0, pid1] = pids;
    const p0 = pointers[pid0];
    const p1 = pointers[pid1];
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);

    if (prevPinchDist !== null) {
      const delta = dist - prevPinchDist;
      const factor = 1 + delta * 0.005;
      const midX = (p0.x + p1.x) / 2;
      const midY = (p0.y + p1.y) / 2;
      applyZoom(factor, midX, midY);
    }
    prevPinchDist = dist;
    renderCanvas();
    return;
  }

  // Single pointer
  if (isPanning && panStart) {
    offsetX = panStart.ox + (e.clientX - panStart.x);
    offsetY = panStart.oy + (e.clientY - panStart.y);
    renderCanvas();
    return;
  }

  // Update spline cursor in draw mode
  if (activeTool === 'draw' && spline.active) {
    spline._handlePointerMove(e.clientX, e.clientY);
    renderCanvas();
  }
}

function onPointerUp(e) {
  e.preventDefault();
  const prev = pointers[e.pointerId];
  delete pointers[e.pointerId];

  const pids = Object.keys(pointers);
  if (pids.length < 2) prevPinchDist = null;

  if (isPanning && pids.length === 0) {
    isPanning = false;
    panStart  = null;
    lastSinglePos = null;
    return;
  }

  if (pids.length > 0) return; // still multi-touch

  // Was this a tap? (minimal movement)
  if (prev && lastSinglePos) {
    const dx = Math.abs(e.clientX - lastSinglePos.x);
    const dy = Math.abs(e.clientY - lastSinglePos.y);
    if (dx < 8 && dy < 8) {
      handleTap(e.clientX, e.clientY);
    }
  }

  isPanning = false;
  panStart  = null;
  lastSinglePos = null;
}

function onPointerCancel(e) {
  delete pointers[e.pointerId];
  if (Object.keys(pointers).length < 2) prevPinchDist = null;
  isPanning = false;
  panStart  = null;
}

function onWheel(e) {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  applyZoom(factor, e.clientX, e.clientY);
  renderCanvas();
}

function applyZoom(factor, pivotClientX, pivotClientY) {
  const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale * factor));
  if (newScale === scale) return;

  const rect = canvas.getBoundingClientRect();
  const px = pivotClientX - rect.left;
  const py = pivotClientY - rect.top;

  // Keep the world point under the pivot fixed
  offsetX = px - (px - offsetX) * (newScale / scale);
  offsetY = py - (py - offsetY) * (newScale / scale);
  scale = newScale;
}

function handleTap(clientX, clientY) {
  const pxPos = clientToCanvas(clientX, clientY);
  const mmPos = {
    x: canvasToMm(pxPos.x, scale, offsetX),
    y: canvasToMm(pxPos.y, scale, offsetY),
  };

  if (activeTool === 'draw' && spline.active) {
    spline._handlePointerDown(null, clientX, clientY);
    renderCanvas();
    return;
  }

  if (activeTool === 'select' || activeTool === 'delete') {
    const proj = getActiveProject();
    if (!proj) return;

    const hit = proj.rooms.find(r =>
      r.shape_points && isPointInPolygon(mmPos, r.shape_points)
    );

    if (activeTool === 'select') {
      if (hit) {
        selectedRoomId = hit.id;
        confirmDeleteId = null;
        showRoomActionBar(hit);
      } else {
        selectedRoomId = null;
        hideActionBar();
      }
      renderCanvas();
    }

    if (activeTool === 'delete') {
      if (hit) {
        if (confirmDeleteId === hit.id) {
          deleteRoom(state.activeProjectId, hit.id);
          confirmDeleteId = null;
          selectedRoomId  = null;
          hideActionBar();
          showToast('Room deleted', 'error');
          if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
        } else {
          confirmDeleteId = hit.id;
          showDeleteConfirmBar(hit);
        }
        renderCanvas();
      } else {
        confirmDeleteId = null;
        hideActionBar();
      }
    }
  }
}

// ── Tool selection ───────────────────────────────────
function setupToolbar() {
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setTool(btn.dataset.tool);
    });
  });
}

function setTool(tool) {
  activeTool = tool;

  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.toggle('tool-active', btn.dataset.tool === tool);
  });

  if (tool !== 'draw') {
    spline.stop();
    spline.reset();
  } else {
    spline.start();
  }

  if (tool !== 'select' && tool !== 'delete') {
    selectedRoomId = null;
    confirmDeleteId = null;
    hideActionBar();
  }

  renderCanvas();
}

// ── Action bars ──────────────────────────────────────
function showRoomActionBar(room) {
  const bar = document.getElementById('plan-action-bar');
  const content = document.getElementById('action-content');
  if (!bar || !content) return;

  content.innerHTML = `
    <button class="btn-secondary" style="flex:1" id="bar-edit">✎ Edit Room</button>
    <button class="btn-danger"    style="flex:1" id="bar-delete">🗑 Delete</button>
  `;
  bar.classList.add('visible');

  document.getElementById('bar-edit').addEventListener('click', () => openRoomEditSheet(room));
  document.getElementById('bar-delete').addEventListener('click', () => {
    content.innerHTML = `
      <button class="btn-secondary" style="flex:1" id="bar-cancel">Cancel</button>
      <button class="btn-danger"    style="flex:1" id="bar-confirm-del">Yes, delete</button>
    `;
    document.getElementById('bar-cancel').addEventListener('click', () => {
      selectedRoomId = null;
      hideActionBar();
      renderCanvas();
    });
    document.getElementById('bar-confirm-del').addEventListener('click', () => {
      deleteRoom(state.activeProjectId, room.id);
      selectedRoomId = null;
      hideActionBar();
      showToast('Room deleted', 'error');
      if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
      renderCanvas();
    });
  });
}

function showDeleteConfirmBar(room) {
  const bar = document.getElementById('plan-action-bar');
  const content = document.getElementById('action-content');
  if (!bar || !content) return;

  content.innerHTML = `
    <span style="color:var(--muted);font-size:13px;flex:1">Tap again to confirm delete: <strong style="color:var(--text)">${escHtml(room.name)}</strong></span>
    <button class="btn-secondary" id="bar-cancel-del">Cancel</button>
  `;
  bar.classList.add('visible');

  document.getElementById('bar-cancel-del').addEventListener('click', () => {
    confirmDeleteId = null;
    hideActionBar();
  });
}

function hideActionBar() {
  const bar = document.getElementById('plan-action-bar');
  if (bar) bar.classList.remove('visible');
}

// ── Shape close callback ─────────────────────────────
function onShapeClose(points) {
  const bb = getBoundingBox(points);
  const area = calcArea(points);

  const proj = getActiveProject();
  const colorIdx = proj ? (proj.rooms.length % ROOM_COLORS.length) : 0;

  openSheet({
    title: 'New Room',
    content: buildRoomForm({
      name: '',
      bounding_length_mm: Math.round(bb.width),
      bounding_width_mm:  Math.round(bb.height),
      height_mm: 3000,
      wall_thickness_mm: 150,
    }),
    onClose: () => {
      // If they dismiss without saving, we're done
      spline.stop();
      spline.reset();
      renderCanvas();
    },
  });

  setTimeout(() => {
    attachVoiceMicToAll(document.querySelector('.sheet-content'));

    const form = document.getElementById('room-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());

      const roomData = {
        name: data.name || 'Room',
        shape_points: points,
        dimensions: {
          bounding_length_mm: parseInt(data.bounding_length_mm) || Math.round(bb.width),
          bounding_width_mm:  parseInt(data.bounding_width_mm)  || Math.round(bb.height),
          height_mm:          parseInt(data.height_mm)          || 3000,
        },
        wall_thickness_mm: parseInt(data.wall_thickness_mm) || 150,
        floor_area_sqmm: Math.round(area),
        color: ROOM_COLORS[colorIdx],
      };

      createRoom(state.activeProjectId, roomData);
      if (navigator.vibrate) navigator.vibrate(10);
      closeSheet(false);
      showToast('Room saved', 'success');
      setTool('select');
      renderCanvas();
    });
  }, 50);
}

function buildRoomForm(defaults) {
  return `
    <form class="sheet-form" id="room-form" autocomplete="off">
      <label class="form-label">Room Name *
        <input class="form-input" type="text" name="name" required
               value="${escHtml(defaults.name || '')}" placeholder="e.g. Main Hall">
      </label>
      <div class="dims-row">
        <label class="form-label">Length (mm)
          <input class="form-input" type="number" name="bounding_length_mm"
                 data-voice="true" inputmode="numeric"
                 value="${defaults.bounding_length_mm || ''}" placeholder="e.g. 5000 mm">
        </label>
        <label class="form-label">Width (mm)
          <input class="form-input" type="number" name="bounding_width_mm"
                 data-voice="true" inputmode="numeric"
                 value="${defaults.bounding_width_mm || ''}" placeholder="e.g. 4000 mm">
        </label>
        <label class="form-label">Height (mm)
          <input class="form-input" type="number" name="height_mm"
                 data-voice="true" inputmode="numeric"
                 value="${defaults.height_mm || 3000}" placeholder="e.g. 3000 mm">
        </label>
      </div>
      <label class="form-label">Wall Thickness (mm)
        <input class="form-input" type="number" name="wall_thickness_mm"
               data-voice="true" inputmode="numeric"
               value="${defaults.wall_thickness_mm || 150}" placeholder="e.g. 150 mm">
      </label>
      <button class="btn-primary" type="submit">Save Room</button>
    </form>
  `;
}

function openRoomEditSheet(room) {
  openSheet({
    title: 'Edit Room',
    content: buildRoomForm({
      name: room.name,
      bounding_length_mm: room.dimensions.bounding_length_mm,
      bounding_width_mm:  room.dimensions.bounding_width_mm,
      height_mm:          room.dimensions.height_mm,
      wall_thickness_mm:  room.wall_thickness_mm,
    }),
  });

  setTimeout(() => {
    attachVoiceMicToAll(document.querySelector('.sheet-content'));

    const form = document.getElementById('room-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());

      updateRoom(state.activeProjectId, room.id, {
        name: data.name || room.name,
        dimensions: {
          bounding_length_mm: parseInt(data.bounding_length_mm) || room.dimensions.bounding_length_mm,
          bounding_width_mm:  parseInt(data.bounding_width_mm)  || room.dimensions.bounding_width_mm,
          height_mm:          parseInt(data.height_mm)          || room.dimensions.height_mm,
        },
        wall_thickness_mm: parseInt(data.wall_thickness_mm) || room.wall_thickness_mm,
      });

      if (navigator.vibrate) navigator.vibrate(10);
      closeSheet(false);
      hideActionBar();
      selectedRoomId = null;
      showToast('Room updated', 'success');
      renderCanvas();
    });
  }, 50);
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
