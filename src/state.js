// Central state store for SiteMeasure v2

export const state = {
  projects: [],
  activeProjectId: null,
  activeRoomId: null,
  activeElevation: 'N',
  currentScreen: 'projects'
};

let saveTimer = null;

export function saveState() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem('sm_projects', JSON.stringify(state.projects));
      if (state.activeProjectId) {
        localStorage.setItem('sm_active_project_id', state.activeProjectId);
      } else {
        localStorage.removeItem('sm_active_project_id');
      }
    } catch (e) {
      console.error('Failed to save state:', e);
    }
  }, 500);
}

export function loadState() {
  try {
    const projectsRaw = localStorage.getItem('sm_projects');
    if (projectsRaw) {
      state.projects = JSON.parse(projectsRaw);
    }
    const activeId = localStorage.getItem('sm_active_project_id');
    if (activeId) {
      state.activeProjectId = activeId;
    }
  } catch (e) {
    console.error('Failed to load state:', e);
    state.projects = [];
    state.activeProjectId = null;
  }
}

export function getActiveProject() {
  if (!state.activeProjectId) return null;
  return state.projects.find(p => p.id === state.activeProjectId) || null;
}

export function getActiveRoom() {
  const project = getActiveProject();
  if (!project || !state.activeRoomId) return null;
  return project.rooms.find(r => r.id === state.activeRoomId) || null;
}

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createProject(data) {
  const now = new Date().toISOString();
  const project = {
    id: generateId('proj'),
    name: data.name || 'Untitled Project',
    site_address: data.site_address || '',
    executive_name: data.executive_name || '',
    visit_date: data.visit_date || new Date().toISOString().slice(0, 10),
    property_type: data.property_type || 'Retail',
    floor_number: data.floor_number || '',
    status: data.status || 'Draft',
    created_at: now,
    updated_at: now,
    rooms: []
  };
  state.projects.unshift(project);
  saveState();
  return project;
}

export function updateProject(id, data) {
  const idx = state.projects.findIndex(p => p.id === id);
  if (idx === -1) return;
  state.projects[idx] = {
    ...state.projects[idx],
    ...data,
    id: state.projects[idx].id,
    rooms: state.projects[idx].rooms,
    created_at: state.projects[idx].created_at,
    updated_at: new Date().toISOString()
  };
  saveState();
}

export function deleteProject(id) {
  state.projects = state.projects.filter(p => p.id !== id);
  if (state.activeProjectId === id) {
    state.activeProjectId = null;
    state.activeRoomId = null;
    localStorage.removeItem('sm_active_project_id');
  }
  saveState();
}

export function duplicateProject(id) {
  const original = state.projects.find(p => p.id === id);
  if (!original) return null;
  const now = new Date().toISOString();
  const duplicate = JSON.parse(JSON.stringify(original));
  duplicate.id = generateId('proj');
  duplicate.name = original.name + ' (Copy)';
  duplicate.created_at = now;
  duplicate.updated_at = now;
  duplicate.status = 'Draft';
  // Re-generate room IDs
  duplicate.rooms = duplicate.rooms.map(room => {
    const newRoom = { ...room, id: generateId('r') };
    const newElevations = {};
    for (const [key, elements] of Object.entries(room.elevations)) {
      newElevations[key] = elements.map(el => ({ ...el, id: generateId('el') }));
    }
    newRoom.elevations = newElevations;
    return newRoom;
  });
  state.projects.unshift(duplicate);
  saveState();
  return duplicate;
}

export function createRoom(projectId, roomData) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return null;
  const room = {
    id: generateId('r'),
    name: roomData.name || 'Room',
    shape_points: roomData.shape_points || [],
    dimensions: {
      bounding_length_mm: roomData.dimensions?.bounding_length_mm || 0,
      bounding_width_mm: roomData.dimensions?.bounding_width_mm || 0,
      height_mm: roomData.dimensions?.height_mm || 3000
    },
    wall_thickness_mm: roomData.wall_thickness_mm || 150,
    floor_area_sqmm: roomData.floor_area_sqmm || 0,
    color: roomData.color || '#3b82f6',
    elevations: { N: [], S: [], E: [], W: [], ceiling: [], floor: [] }
  };
  project.rooms.push(room);
  project.updated_at = new Date().toISOString();
  saveState();
  return room;
}

export function updateRoom(projectId, roomId, data) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;
  const idx = project.rooms.findIndex(r => r.id === roomId);
  if (idx === -1) return;
  project.rooms[idx] = {
    ...project.rooms[idx],
    ...data,
    id: project.rooms[idx].id,
    elevations: data.elevations || project.rooms[idx].elevations
  };
  project.updated_at = new Date().toISOString();
  saveState();
}

export function deleteRoom(projectId, roomId) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;
  project.rooms = project.rooms.filter(r => r.id !== roomId);
  if (state.activeRoomId === roomId) state.activeRoomId = null;
  project.updated_at = new Date().toISOString();
  saveState();
}

export function addElement(projectId, roomId, elevation, elementData) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return null;
  const room = project.rooms.find(r => r.id === roomId);
  if (!room) return null;
  if (!room.elevations[elevation]) room.elevations[elevation] = [];
  const element = {
    id: generateId('el'),
    type: elementData.type || 'window',
    label: elementData.label || 'Element',
    dimensions: {
      w_mm: parseInt(elementData.dimensions?.w_mm) || 1200,
      h_mm: parseInt(elementData.dimensions?.h_mm) || 1200,
      d_mm: parseInt(elementData.dimensions?.d_mm) || 150
    },
    position: {
      reference: elementData.position?.reference || 'left',
      distance_mm: parseInt(elementData.position?.distance_mm) || 0
    },
    note: elementData.note || ''
  };
  room.elevations[elevation].push(element);
  project.updated_at = new Date().toISOString();
  saveState();
  return element;
}

export function deleteElement(projectId, roomId, elevation, elementId) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;
  const room = project.rooms.find(r => r.id === roomId);
  if (!room || !room.elevations[elevation]) return;
  room.elevations[elevation] = room.elevations[elevation].filter(el => el.id !== elementId);
  project.updated_at = new Date().toISOString();
  saveState();
}
