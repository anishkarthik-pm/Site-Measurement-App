import { state, getActiveProject, addElement, deleteElement } from '../state.js';
import { navigate } from '../router.js';
import { openSheet, closeSheet } from '../ui/bottom-sheet.js';
import { showToast } from '../ui/toast.js';
import { attachVoiceMicToAll } from '../ui/voice-input.js';
import { exportProject } from '../export/json-export.js';
import { ELEMENT_TYPES } from '../data/elements.js';

const ELEV_LABELS = { N: 'North', S: 'South', E: 'East', W: 'West', ceiling: 'Ceiling', floor: 'Floor' };
const ELEV_KEYS   = ['N', 'S', 'E', 'W', 'ceiling', 'floor'];
const POS_REF_ICONS = { left: '↤', right: '↦', floor: '↥', ceiling: '↧' };

// Per-room UI state
const roomExpandedState = {};  // roomId → boolean
const roomActiveElev    = {};  // roomId → elevation key
let selectedElementKey  = null; // 'roomId:elevation:elementId'
let deleteConfirmKey     = null;

// Swipe tracking per element card
const swipeState = {};

function getContainer() { return document.getElementById('screen-elevations'); }

export function initElevationsScreen() {
  renderElevations();
}

export function renderElevations() {
  const container = getContainer();
  if (!container) return;

  const proj = getActiveProject();

  container.innerHTML = `
    <div class="screen-header">
      <button class="back-btn" id="elev-back">←</button>
      <span class="screen-title">${escHtml(proj?.name || 'Elevations')}</span>
      <button class="icon-btn" id="elev-export-btn" title="Export project">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
    </div>
    <div class="screen-content" id="elev-content">
      ${proj ? renderRoomAccordion(proj) : renderNoProject()}
    </div>
    <button class="fab ${!hasActiveElevation() ? 'hidden' : ''}" id="elev-fab" aria-label="Add element">+</button>
  `;

  document.getElementById('elev-back').addEventListener('click', () => navigate('projects'));
  document.getElementById('elev-export-btn').addEventListener('click', () => {
    if (!proj) return;
    exportProject(proj);
    showToast('Project exported', 'success');
  });

  const fab = document.getElementById('elev-fab');
  if (fab) {
    fab.addEventListener('click', () => {
      const { roomId, elev } = getActiveElevation();
      if (!roomId || !elev) {
        showToast('Select a wall first', 'info');
        return;
      }
      openAddElementSheet(roomId, elev);
    });
  }

  attachRoomInteractions();
}

function renderNoProject() {
  return `<div class="empty-state">
    <div class="empty-icon">🧱</div>
    <div class="empty-title">No project open.</div>
    <div class="empty-subtitle">Go to Projects and tap a project.</div>
  </div>`;
}

function renderRoomAccordion(proj) {
  if (!proj.rooms || proj.rooms.length === 0) {
    return `<div class="empty-state">
      <div class="empty-icon">🧱</div>
      <div class="empty-title">No rooms yet.</div>
      <div class="empty-subtitle">Draw rooms in the Plan tab first.</div>
    </div>`;
  }

  return `<div class="room-accordion" id="room-accordion">${
    proj.rooms.map(room => renderRoomSection(room)).join('')
  }</div>`;
}

function renderRoomSection(room) {
  const isExpanded = roomExpandedState[room.id] || false;
  const activeElev = roomActiveElev[room.id] || 'N';
  const totalEls   = countRoomElements(room);

  return `
    <div class="room-section ${isExpanded ? 'expanded' : ''}" data-room-id="${room.id}">
      <div class="room-section-header" data-room-id="${room.id}">
        <div class="room-color-dot" style="width:10px;height:10px;border-radius:50%;background:${room.color||'#3b82f6'};flex-shrink:0;margin-right:4px;"></div>
        <span class="room-section-name">${escHtml(room.name)}</span>
        <span class="room-section-meta">${totalEls} el${totalEls !== 1 ? 's' : ''}</span>
        <span class="room-chevron">›</span>
      </div>
      ${isExpanded ? renderRoomBody(room, activeElev) : ''}
    </div>
  `;
}

function renderRoomBody(room, activeElev) {
  return `
    <div class="room-section-body">
      <div class="elev-tab-bar" data-room-id="${room.id}">
        ${ELEV_KEYS.map(key => `
          <button class="elev-tab ${activeElev === key ? 'tab-active' : ''}"
                  data-room-id="${room.id}" data-elev="${key}">
            ${ELEV_LABELS[key]}
          </button>
        `).join('')}
      </div>
      <div class="elev-content" id="elev-body-${room.id}-${activeElev}">
        ${renderElementList(room, activeElev)}
      </div>
    </div>
  `;
}

function renderElementList(room, elev) {
  const elements = room.elevations?.[elev] || [];

  if (elements.length === 0) {
    return `<div class="empty-state" style="padding:30px 16px">
      <div class="empty-icon" style="font-size:32px">➕</div>
      <div class="empty-subtitle">No elements on this wall. Tap + to add one.</div>
    </div>`;
  }

  const selKey = `${room.id}:${elev}`;
  return elements.map(el => renderElementCard(room.id, elev, el, selKey)).join('');
}

function renderElementCard(roomId, elev, el, selKey) {
  const type    = ELEMENT_TYPES.find(t => t.key === el.type) || { icon: '📦', label: el.label };
  const isSelected = selectedElementKey === `${roomId}:${elev}:${el.id}`;
  const posIcon = POS_REF_ICONS[el.position?.reference] || '↤';

  return `
    <div class="element-card ${isSelected ? 'selected' : ''}"
         data-room-id="${roomId}" data-elev="${elev}" data-el-id="${el.id}">
      <span class="element-icon">${type.icon}</span>
      <div class="element-info">
        <span class="element-label">${escHtml(el.label || type.label)}</span>
        <span class="element-dims">${el.dimensions.w_mm}×${el.dimensions.h_mm}×${el.dimensions.d_mm} mm</span>
        <span class="element-position">${posIcon} ${el.position.distance_mm} mm from ${el.position.reference}</span>
        ${el.note ? `<span class="element-note">${escHtml(el.note)}</span>` : ''}
      </div>
      <div class="element-delete-reveal" data-room-id="${roomId}" data-elev="${elev}" data-el-id="${el.id}">🗑</div>
    </div>
  `;
}

function countRoomElements(room) {
  return Object.values(room.elevations || {}).reduce((sum, arr) => sum + arr.length, 0);
}

// ── Interactions ─────────────────────────────────────
function attachRoomInteractions() {
  // Room section headers — toggle expand
  document.querySelectorAll('.room-section-header').forEach(header => {
    header.addEventListener('click', () => {
      const roomId = header.dataset.roomId;
      roomExpandedState[roomId] = !roomExpandedState[roomId];
      if (!roomActiveElev[roomId]) roomActiveElev[roomId] = 'N';
      refreshRoomSection(roomId);
      updateFab();
    });
  });

  // Elevation tabs
  document.querySelectorAll('.elev-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const { roomId, elev } = tab.dataset;
      roomActiveElev[roomId] = elev;
      refreshRoomSection(roomId);
      updateFab();
    });
  });

  // Element cards — tap to select, swipe to delete
  attachElementCardInteractions();
}

function attachElementCardInteractions() {
  document.querySelectorAll('.element-card').forEach(card => {
    const { roomId, elev, elId } = card.dataset;
    const selKey = `${roomId}:${elev}:${elId}`;

    card.addEventListener('click', () => {
      if (selectedElementKey === selKey) {
        selectedElementKey = null;
        deleteConfirmKey   = null;
      } else {
        selectedElementKey = selKey;
        deleteConfirmKey   = null;
      }
      refreshElementList(roomId, elev);
    });

    // Swipe-left gesture
    let swipeStartX = null;
    card.addEventListener('pointerdown', (e) => {
      swipeStartX = e.clientX;
      swipeState[selKey] = { startX: e.clientX };
    });
    card.addEventListener('pointermove', (e) => {
      if (swipeStartX === null) return;
      const dx = swipeStartX - e.clientX;
      if (dx > 40) {
        card.classList.add('swipe-reveal');
      } else if (dx < 10) {
        card.classList.remove('swipe-reveal');
      }
    });
    card.addEventListener('pointerup', () => { swipeStartX = null; });
    card.addEventListener('pointercancel', () => { swipeStartX = null; });

    // Delete reveal tap
    const reveal = card.querySelector('.element-delete-reveal');
    if (reveal) {
      reveal.addEventListener('click', (e) => {
        e.stopPropagation();
        executeDeleteElement(roomId, elev, elId);
      });
    }
  });

  // Delete bar
  refreshDeleteBar();
}

function refreshDeleteBar() {
  // Remove any existing delete bars first
  document.querySelectorAll('.element-delete-bar').forEach(b => b.remove());

  if (!selectedElementKey) return;

  const [roomId, elev, elId] = selectedElementKey.split(':');
  const contentId = `elev-body-${roomId}-${elev}`;
  const contentEl = document.getElementById(contentId);
  if (!contentEl) return;

  const bar = document.createElement('div');
  bar.className = 'element-delete-bar';

  if (deleteConfirmKey === selectedElementKey) {
    bar.innerHTML = `
      <div class="delete-confirm-row">
        <button class="delete-cancel-btn">Cancel</button>
        <button class="delete-confirm-btn">Yes, delete</button>
      </div>
    `;
    bar.querySelector('.delete-cancel-btn').addEventListener('click', () => {
      deleteConfirmKey = null;
      refreshDeleteBar();
    });
    bar.querySelector('.delete-confirm-btn').addEventListener('click', () => {
      executeDeleteElement(roomId, elev, elId);
    });
  } else {
    bar.innerHTML = `
      <div class="delete-bar-inner">
        <button class="delete-main-btn">🗑 Delete selected element</button>
      </div>
    `;
    bar.querySelector('.delete-main-btn').addEventListener('click', () => {
      deleteConfirmKey = selectedElementKey;
      refreshDeleteBar();
    });
  }

  contentEl.appendChild(bar);
}

function executeDeleteElement(roomId, elev, elId) {
  deleteElement(state.activeProjectId, roomId, elev, elId);
  selectedElementKey = null;
  deleteConfirmKey   = null;
  if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
  showToast('Element deleted', 'error');
  refreshElementList(roomId, elev);
  refreshRoomSection(roomId); // update element count in header
}

function refreshElementList(roomId, elev) {
  const proj = getActiveProject();
  if (!proj) return;
  const room = proj.rooms.find(r => r.id === roomId);
  if (!room) return;

  const contentId = `elev-body-${roomId}-${elev}`;
  const contentEl = document.getElementById(contentId);
  if (!contentEl) return;

  contentEl.innerHTML = renderElementList(room, elev);
  attachElementCardInteractions();
}

function refreshRoomSection(roomId) {
  const proj = getActiveProject();
  if (!proj) return;
  const room = proj.rooms.find(r => r.id === roomId);
  if (!room) return;

  const section = document.querySelector(`.room-section[data-room-id="${roomId}"]`);
  if (!section) return;

  const isExpanded = roomExpandedState[roomId] || false;
  const activeElev = roomActiveElev[roomId] || 'N';
  const totalEls   = countRoomElements(room);

  section.className = `room-section ${isExpanded ? 'expanded' : ''}`;
  section.innerHTML = `
    <div class="room-section-header" data-room-id="${roomId}">
      <div class="room-color-dot" style="width:10px;height:10px;border-radius:50%;background:${room.color||'#3b82f6'};flex-shrink:0;margin-right:4px;"></div>
      <span class="room-section-name">${escHtml(room.name)}</span>
      <span class="room-section-meta">${totalEls} el${totalEls !== 1 ? 's' : ''}</span>
      <span class="room-chevron">›</span>
    </div>
    ${isExpanded ? renderRoomBody(room, activeElev) : ''}
  `;

  // Re-attach interactions for this section
  section.querySelector('.room-section-header').addEventListener('click', () => {
    roomExpandedState[roomId] = !roomExpandedState[roomId];
    if (!roomActiveElev[roomId]) roomActiveElev[roomId] = 'N';
    refreshRoomSection(roomId);
    updateFab();
  });

  section.querySelectorAll('.elev-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      roomActiveElev[tab.dataset.roomId] = tab.dataset.elev;
      refreshRoomSection(tab.dataset.roomId);
      updateFab();
    });
  });

  attachElementCardInteractions();
  updateFab();
}

function updateFab() {
  const fab = document.getElementById('elev-fab');
  if (!fab) return;
  fab.classList.toggle('hidden', !hasActiveElevation());
}

function hasActiveElevation() {
  const proj = getActiveProject();
  if (!proj) return false;
  return proj.rooms.some(r => roomExpandedState[r.id]);
}

function getActiveElevation() {
  const proj = getActiveProject();
  if (!proj) return { roomId: null, elev: null };
  const room = proj.rooms.find(r => roomExpandedState[r.id]);
  if (!room) return { roomId: null, elev: null };
  return { roomId: room.id, elev: roomActiveElev[room.id] || 'N' };
}

// ── Add element sheet ─────────────────────────────────
function openAddElementSheet(roomId, elev) {
  let selectedType = null;

  const paletteHtml = `
    <div class="element-palette" id="el-palette">
      ${ELEMENT_TYPES.map(t => `
        <div class="palette-item" data-key="${t.key}">
          <span class="palette-item-icon">${t.icon}</span>
          <span class="palette-item-label">${t.label}</span>
        </div>
      `).join('')}
    </div>
    <div id="el-form-fields" class="element-form-fields" style="display:none">
      <div class="dims-row">
        <label class="form-label">W (mm)
          <input class="form-input" type="number" id="el-w" data-voice="true" inputmode="numeric" placeholder="e.g. 1200 mm">
        </label>
        <label class="form-label">H (mm)
          <input class="form-input" type="number" id="el-h" data-voice="true" inputmode="numeric" placeholder="e.g. 1200 mm">
        </label>
        <label class="form-label">D (mm)
          <input class="form-input" type="number" id="el-d" data-voice="true" inputmode="numeric" placeholder="e.g. 150 mm">
        </label>
      </div>
      <label class="form-label">Position from
        <div class="segmented-control" id="pos-ref-ctrl">
          <button type="button" data-ref="left"    class="seg-active">Left</button>
          <button type="button" data-ref="right"   >Right</button>
          <button type="button" data-ref="floor"   >Floor</button>
          <button type="button" data-ref="ceiling" >Ceiling</button>
        </div>
        <p class="position-desc" id="pos-desc">Distance from left wall:</p>
        <input class="form-input" type="number" id="el-dist" data-voice="true" inputmode="numeric" placeholder="e.g. 1200 mm" style="margin-top:6px">
      </label>
      <label class="form-label">Note (optional)
        <input class="form-input" type="text" id="el-note" placeholder="Any notes...">
      </label>
      <button class="btn-primary" id="el-add-btn">Add Element</button>
    </div>
  `;

  openSheet({ title: `Add Element — ${ELEV_LABELS[elev] || elev}`, content: paletteHtml });

  setTimeout(() => {
    let posRef = 'left';

    // Palette selection
    document.querySelectorAll('.palette-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.palette-item').forEach(i => i.classList.remove('palette-selected'));
        item.classList.add('palette-selected');
        selectedType = item.dataset.key;

        const type = ELEMENT_TYPES.find(t => t.key === selectedType);
        if (type) {
          document.getElementById('el-w').value = type.w || '';
          document.getElementById('el-h').value = type.h || '';
          document.getElementById('el-d').value = type.d || '';
        }

        document.getElementById('el-form-fields').style.display = 'flex';
        document.getElementById('el-form-fields').style.flexDirection = 'column';
        document.getElementById('el-form-fields').style.gap = '12px';

        attachVoiceMicToAll(document.querySelector('.sheet-content'));
      });
    });

    // Position segmented control
    document.querySelectorAll('#pos-ref-ctrl button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#pos-ref-ctrl button').forEach(b => b.classList.remove('seg-active'));
        btn.classList.add('seg-active');
        posRef = btn.dataset.ref;
        const descs = { left: 'Distance from left wall:', right: 'Distance from right wall:', floor: 'Distance from floor:', ceiling: 'Distance from ceiling:' };
        const desc = document.getElementById('pos-desc');
        if (desc) desc.textContent = descs[posRef] || '';
      });
    });

    // Add button
    document.getElementById('el-add-btn').addEventListener('click', () => {
      if (!selectedType) {
        showToast('Select an element type', 'info');
        return;
      }
      const type = ELEMENT_TYPES.find(t => t.key === selectedType);
      const w = parseInt(document.getElementById('el-w').value) || type?.w || 0;
      const h = parseInt(document.getElementById('el-h').value) || type?.h || 0;
      const d = parseInt(document.getElementById('el-d').value) || type?.d || 0;
      const dist = parseInt(document.getElementById('el-dist').value) || 0;
      const note = document.getElementById('el-note').value || '';

      addElement(state.activeProjectId, roomId, elev, {
        type: selectedType,
        label: type?.label || selectedType,
        dimensions: { w_mm: w, h_mm: h, d_mm: d },
        position: { reference: posRef, distance_mm: dist },
        note,
      });

      if (navigator.vibrate) navigator.vibrate(10);
      closeSheet(false);
      showToast('Element added', 'success');
      selectedElementKey = null;
      refreshRoomSection(roomId);
    });
  }, 50);
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
