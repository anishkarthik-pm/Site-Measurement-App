import { getActiveProject } from '../state.js';
import { navigate } from '../router.js';
import { exportProject } from '../export/json-export.js';
import { showToast } from '../ui/toast.js';
import { ThreeScene } from '../three/scene.js';

let threeScene = null;

function getContainer() {
  return document.getElementById('screen-3d');
}

export function initViewer() {
  const container = getContainer();
  if (!container) return;

  container.innerHTML = `
    <div class="screen-header">
      <button class="back-btn" id="viewer-back">←</button>
      <span class="screen-title" id="viewer-project-name">3D View</span>
      <button class="icon-btn" id="viewer-export-btn" title="Export project">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
    </div>
    <div class="viewer-container" id="three-container"></div>
    <div class="viewer-hint">Drag to orbit · Pinch to zoom</div>
  `;

  document.getElementById('viewer-back').addEventListener('click', () => navigate('projects'));
  document.getElementById('viewer-export-btn').addEventListener('click', () => {
    const proj = getActiveProject();
    if (!proj) return;
    exportProject(proj);
    showToast('Project exported', 'success');
  });
}

export function renderViewer() {
  const proj = getActiveProject();

  const nameEl = document.getElementById('viewer-project-name');
  if (nameEl) nameEl.textContent = proj ? proj.name : '3D View';

  const container = document.getElementById('three-container');
  if (!container) return;

  // Dispose previous scene if exists
  if (threeScene) {
    threeScene.dispose();
    threeScene = null;
  }

  if (!proj || proj.rooms.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="position:absolute;inset:0;justify-content:center">
        <div class="empty-icon">🔲</div>
        <div class="empty-title">No rooms to display.</div>
        <div class="empty-subtitle">Draw rooms in the Plan tab first.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = '';

  try {
    threeScene = new ThreeScene(container);
    threeScene.buildFromProject(proj);
    threeScene.startRendering();
  } catch (e) {
    console.error('3D viewer error:', e);
    container.innerHTML = `
      <div class="empty-state" style="position:absolute;inset:0;justify-content:center">
        <div class="empty-icon">⚠️</div>
        <div class="empty-title">3D view unavailable.</div>
        <div class="empty-subtitle">WebGL may not be supported on this device.</div>
      </div>
    `;
  }
}
