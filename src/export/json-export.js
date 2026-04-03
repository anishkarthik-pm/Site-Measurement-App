function slugify(str) {
  return (str || 'project')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildProjectSummary(project) {
  const totalRooms = project.rooms.length;
  let totalElements = 0;
  let totalFloorArea = 0;
  for (const room of project.rooms) {
    totalFloorArea += room.floor_area_sqmm || 0;
    for (const elev of Object.values(room.elevations || {})) {
      totalElements += elev.length;
    }
  }
  return {
    total_rooms: totalRooms,
    total_elements: totalElements,
    total_floor_area_sqmm: totalFloorArea,
  };
}

export function exportProject(project) {
  const payload = {
    exported_at: new Date().toISOString(),
    project: {
      ...project,
      summary: buildProjectSummary(project),
    },
  };
  const filename = `sitemeasure-${slugify(project.name)}-${todayStr()}.json`;
  downloadJSON(payload, filename);
}

export function exportAllProjects(projects) {
  const payload = {
    exported_at: new Date().toISOString(),
    projects: projects.map(p => ({
      ...p,
      summary: buildProjectSummary(p),
    })),
  };
  const filename = `sitemeasure-all-projects-${todayStr()}.json`;
  downloadJSON(payload, filename);
}
