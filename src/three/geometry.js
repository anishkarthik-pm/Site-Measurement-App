import * as THREE from 'three';

const ELEMENT_COLORS = {
  window:     '#3b82f6',
  beam:       '#a78bfa',
  column:     '#94a3b8',
  niche:      '#10b981',
  elec:       '#fbbf24',
  plumb:      '#60a5fa',
  ac:         '#34d399',
  vent:       '#9ca3af',
  staircase:  '#f97316',
  false_ceil: '#e2e8f0',
};

/**
 * Build a Three.js Group for a room: floor + 4 walls with edges
 * Scale: 1 Three.js unit = 1000mm
 */
export function buildRoomGeometry(room, isActive = false) {
  const group = new THREE.Group();

  const { bounding_length_mm, bounding_width_mm, height_mm } = room.dimensions;
  const t = (room.wall_thickness_mm || 150) / 1000;
  const w = (bounding_width_mm || 3000) / 1000;
  const l = (bounding_length_mm || 4000) / 1000;
  const h = (height_mm || 3000) / 1000;

  const edgeColor = isActive ? 0x3b82f6 : 0x394856;

  // Floor
  const floorGeo = new THREE.PlaneGeometry(w, l);
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x161b24, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // Floor edges
  const floorEdges = new THREE.EdgesGeometry(floorGeo);
  const floorLine = new THREE.LineSegments(floorEdges, new THREE.LineBasicMaterial({ color: edgeColor }));
  floorLine.rotation.x = -Math.PI / 2;
  group.add(floorLine);

  // Wall definitions: [centerX, centerZ, sizeX, sizeZ]
  const wallDefs = [
    // North wall (back, +Z side)
    { cx: 0,       cy: h / 2, cz: l / 2,  sx: w, sz: t,   rotY: 0 },
    // South wall (front, -Z side)
    { cx: 0,       cy: h / 2, cz: -l / 2, sx: w, sz: t,   rotY: 0 },
    // East wall (+X side)
    { cx: w / 2,   cy: h / 2, cz: 0,      sx: t, sz: l,   rotY: 0 },
    // West wall (-X side)
    { cx: -w / 2,  cy: h / 2, cz: 0,      sx: t, sz: l,   rotY: 0 },
  ];

  for (const wd of wallDefs) {
    const wallGeo = new THREE.BoxGeometry(wd.sx, h, wd.sz);
    const wallMat = new THREE.MeshLambertMaterial({
      color: 0x1c2330,
      transparent: true,
      opacity: 0.85,
    });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(wd.cx, wd.cy, wd.cz);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    // Wireframe edges
    const edges = new THREE.EdgesGeometry(wallGeo);
    const edgeLine = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: edgeColor })
    );
    edgeLine.position.set(wd.cx, wd.cy, wd.cz);
    group.add(edgeLine);
  }

  return group;
}

/**
 * Build a colored box for an element
 */
export function buildElementGeometry(element) {
  const w = (element.dimensions?.w_mm || 300) / 1000;
  const h = (element.dimensions?.h_mm || 300) / 1000;
  const d = (element.dimensions?.d_mm || 150) / 1000;

  const color = ELEMENT_COLORS[element.type] || '#94a3b8';
  const geo = new THREE.BoxGeometry(Math.max(w, 0.05), Math.max(h, 0.05), Math.max(d, 0.05));
  const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color) });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}
