import {
  state,
  createProject,
  updateProject,
  deleteProject,
  duplicateProject,
} from '../state.js';
import { navigate } from '../router.js';
import { openSheet, closeSheet } from '../ui/bottom-sheet.js';
import { showToast } from '../ui/toast.js';
import { exportAllProjects, exportProject } from '../export/json-export.js';

const STATUS_COLORS = {
  'Draft': 'var(--amber)',
  'In Progress': 'var(--accent)',
  'Complete': 'var(--green)',
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getContainer() {
  return document.getElementById('screen-projects');
}

export function initProjectsScreen() {
  renderProjects();
}

export function renderProjects() {
  const container = getContainer();
  if (!container) return;

  const showSkeletons = !state._projectsLoaded;
  state._projectsLoaded = true;

  container.innerHTML = `
    <div class="screen-header">
      <span class="screen-title">SiteMeasure</span>
      <button class="icon-btn" id="export-all-btn" title="Export All">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
    </div>
    <div class="screen-content" id="projects-list-container">
      ${showSkeletons ? renderSkeletons() : ''}
    </div>
    <button class="fab" id="new-project-fab" aria-label="New Project">+</button>
  `;

  document.getElementById('export-all-btn').addEventListener('click', () => {
    if (state.projects.length === 0) {
      showToast('No projects to export', 'info');
      return;
    }
    exportAllProjects(state.projects);
    showToast('Exported all projects', 'success');
  });

  document.getElementById('new-project-fab').addEventListener('click', () => {
    openProjectForm(null);
  });

  if (showSkeletons) {
    setTimeout(() => renderProjectList(), 400);
  } else {
    renderProjectList();
  }
}

function renderSkeletons() {
  return Array(3).fill(0).map(() => `
    <div class="project-card skeleton-card">
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-text" style="width:60%"></div>
    </div>
  `).join('');
}

function renderProjectList() {
  const container = document.getElementById('projects-list-container');
  if (!container) return;

  if (state.projects.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏗️</div>
        <div class="empty-title">No projects yet.</div>
        <div class="empty-subtitle">Start your first site survey.</div>
        <button class="btn-primary" id="empty-new-btn">New Project</button>
      </div>
    `;
    document.getElementById('empty-new-btn')?.addEventListener('click', () => openProjectForm(null));
    return;
  }

  container.innerHTML = state.projects.map(p => renderProjectCard(p)).join('');

  // Attach interactions
  container.querySelectorAll('.project-card').forEach(card => {
    const id = card.dataset.id;

    // Tap to open
    let longPressTimer = null;
    let moved = false;

    card.addEventListener('pointerdown', () => {
      moved = false;
      longPressTimer = setTimeout(() => {
        if (!moved) showQuickActions(id);
      }, 500);
    });

    card.addEventListener('pointermove', () => {
      moved = true;
      clearTimeout(longPressTimer);
    });

    card.addEventListener('pointerup', () => {
      if (longPressTimer) clearTimeout(longPressTimer);
    });

    card.addEventListener('click', () => {
      if (moved) return;
      state.activeProjectId = id;
      navigate('plan');
    });

    // Export button on card
    card.querySelector('.card-export-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const proj = state.projects.find(p => p.id === id);
      if (proj) {
        exportProject(proj);
        showToast('Project exported', 'success');
      }
    });
  });
}

function renderProjectCard(p) {
  const statusColor = STATUS_COLORS[p.status] || 'var(--muted)';
  const roomCount = (p.rooms || []).length;
  return `
    <div class="project-card" data-id="${p.id}">
      <div class="card-top-row">
        <span class="card-title">${escHtml(p.name)}</span>
        <span class="status-badge" style="background:${statusColor}20;color:${statusColor};border-color:${statusColor}40">${escHtml(p.status)}</span>
      </div>
      <div class="card-address">${escHtml(p.site_address)}</div>
      <div class="card-meta-row">
        <span class="card-meta">${formatDate(p.visit_date)}</span>
        <span class="card-meta">· ${escHtml(p.executive_name)}</span>
        <span class="room-badge">${roomCount} room${roomCount !== 1 ? 's' : ''}</span>
      </div>
      <button class="card-export-btn icon-btn" title="Export">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
    </div>
  `;
}

function showQuickActions(id) {
  if (navigator.vibrate) navigator.vibrate(10);
  const proj = state.projects.find(p => p.id === id);
  if (!proj) return;

  openSheet({
    title: escHtml(proj.name),
    content: `
      <div class="sheet-actions">
        <button class="sheet-action-btn" id="qa-edit">✎ Edit Details</button>
        <button class="sheet-action-btn" id="qa-duplicate">⧉ Duplicate</button>
        <button class="sheet-action-btn danger" id="qa-delete">🗑 Delete</button>
      </div>
    `,
  });

  setTimeout(() => {
    document.getElementById('qa-edit')?.addEventListener('click', () => {
      closeSheet(false);
      openProjectForm(id);
    });
    document.getElementById('qa-duplicate')?.addEventListener('click', () => {
      duplicateProject(id);
      closeSheet(false);
      renderProjects();
      showToast('Project duplicated', 'success');
    });
    document.getElementById('qa-delete')?.addEventListener('click', () => {
      if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
      deleteProject(id);
      closeSheet(false);
      renderProjects();
      showToast('Project deleted', 'error');
    });
  }, 50);
}

function openProjectForm(editId) {
  const proj = editId ? state.projects.find(p => p.id === editId) : null;
  const isEdit = !!proj;

  const formHtml = `
    <form class="sheet-form" id="project-form" autocomplete="off">
      <label class="form-label">Project Name *
        <input class="form-input" type="text" name="name" required value="${escHtml(proj?.name || '')}" placeholder="e.g. High Street Retail Unit">
      </label>
      <label class="form-label">Site Address *
        <input class="form-input" type="text" name="site_address" required value="${escHtml(proj?.site_address || '')}" placeholder="Full address">
      </label>
      <label class="form-label">Executive Name *
        <input class="form-input" type="text" name="executive_name" required value="${escHtml(proj?.executive_name || '')}" placeholder="Your name">
      </label>
      <label class="form-label">Visit Date *
        <input class="form-input" type="date" name="visit_date" required value="${proj?.visit_date || today()}">
      </label>
      <label class="form-label">Property Type *
        <select class="form-input" name="property_type" required>
          ${['Retail','Residential','Commercial','Industrial'].map(t =>
            `<option value="${t}" ${proj?.property_type === t ? 'selected' : ''}>${t}</option>`
          ).join('')}
        </select>
      </label>
      <label class="form-label">Floor Number
        <input class="form-input" type="text" name="floor_number" value="${escHtml(proj?.floor_number || '')}" placeholder="e.g. G, 1, 2">
      </label>
      <label class="form-label">Status
        <select class="form-input" name="status">
          ${['Draft','In Progress','Complete'].map(s =>
            `<option value="${s}" ${proj?.status === s ? 'selected' : ''}>${s}</option>`
          ).join('')}
        </select>
      </label>
      <button class="btn-primary" type="submit">${isEdit ? 'Save Changes' : 'Create Project'}</button>
    </form>
  `;

  openSheet({
    title: isEdit ? 'Edit Project' : 'New Project',
    content: formHtml,
  });

  setTimeout(() => {
    const form = document.getElementById('project-form');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      if (isEdit) {
        updateProject(editId, data);
        showToast('Project updated', 'success');
      } else {
        createProject(data);
        showToast('Project created', 'success');
      }
      if (navigator.vibrate) navigator.vibrate(10);
      closeSheet(false);
      renderProjects();
    });
  }, 50);
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
