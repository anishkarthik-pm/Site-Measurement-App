import * as THREE from 'three';
import { buildRoomGeometry, buildElementGeometry } from './geometry.js';

export class ThreeScene {
  constructor(containerEl) {
    this.container = containerEl;
    this.animating = false;
    this.rafId = null;

    // Camera spherical coords
    this.radius = 40;
    this.phi = 0.55;    // polar angle (up/down)
    this.theta = 0.7;   // azimuth (left/right)

    this._initRenderer();
    this._initScene();
    this._initControls();
    this._resize();
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(containerEl);
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x0b0e13);
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
  }

  _initScene() {
    this.scene = new THREE.Scene();

    // Grid
    const gridHelper = new THREE.GridHelper(200, 100, 0x263040, 0x1c2330);
    this.scene.add(gridHelper);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 30, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 200;
    dirLight.shadow.camera.left = -50;
    dirLight.shadow.camera.right = 50;
    dirLight.shadow.camera.top = 50;
    dirLight.shadow.camera.bottom = -50;
    this.scene.add(dirLight);

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 10000);
    this._updateCamera();

    this.roomGroup = new THREE.Group();
    this.scene.add(this.roomGroup);
  }

  _updateCamera() {
    this.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.01, this.phi));
    this.camera.position.set(
      this.radius * Math.sin(this.phi) * Math.sin(this.theta),
      this.radius * Math.cos(this.phi),
      this.radius * Math.sin(this.phi) * Math.cos(this.theta)
    );
    this.camera.lookAt(0, 0, 0);
  }

  _initControls() {
    const canvas = this.renderer.domElement;
    let pointers = {};
    let prevPinchDist = null;
    let prevPointerPos = null;

    canvas.addEventListener('pointerdown', (e) => {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      prevPointerPos = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!pointers[e.pointerId]) return;

      const pids = Object.keys(pointers);

      if (pids.length === 2) {
        // Pinch zoom
        const [pid0, pid1] = pids;
        const p0 = pid0 == e.pointerId ? { x: e.clientX, y: e.clientY } : pointers[pid0];
        const p1 = pid1 == e.pointerId ? { x: e.clientX, y: e.clientY } : pointers[pid1];
        const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);

        if (prevPinchDist !== null) {
          const delta = prevPinchDist - dist;
          this.radius = Math.max(5, Math.min(200, this.radius + delta * 0.1));
          this._updateCamera();
        }
        prevPinchDist = dist;
      } else if (pids.length === 1) {
        // Orbit
        if (prevPointerPos) {
          const dx = e.clientX - prevPointerPos.x;
          const dy = e.clientY - prevPointerPos.y;
          this.theta -= dx * 0.005;
          this.phi -= dy * 0.005;
          this._updateCamera();
        }
      }

      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      prevPointerPos = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('pointerup', (e) => {
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) prevPinchDist = null;
      if (Object.keys(pointers).length === 0) prevPointerPos = null;
    });

    canvas.addEventListener('pointercancel', (e) => {
      delete pointers[e.pointerId];
      prevPinchDist = null;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.radius = Math.max(5, Math.min(200, this.radius + e.deltaY * 0.05));
      this._updateCamera();
    }, { passive: false });
  }

  _resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  buildFromProject(project) {
    // Clear existing room geometry
    while (this.roomGroup.children.length > 0) {
      const child = this.roomGroup.children[0];
      this.roomGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }

    if (!project || !project.rooms) return;

    // Lay rooms out side by side
    let offsetX = 0;
    const padding = 1;

    for (const room of project.rooms) {
      const w = (room.dimensions.bounding_width_mm || 3000) / 1000;
      const l = (room.dimensions.bounding_length_mm || 4000) / 1000;

      const group = buildRoomGeometry(room);
      group.position.set(offsetX + w / 2, 0, 0);
      this.roomGroup.add(group);

      // Add elements on each elevation
      for (const [elev, elements] of Object.entries(room.elevations || {})) {
        let elOffsetX = -w / 2 + 0.3;
        for (const el of elements) {
          const mesh = buildElementGeometry(el);
          const elH = (el.dimensions?.h_mm || 300) / 1000;
          const elW = (el.dimensions?.w_mm || 300) / 1000;
          const wallOffset = 0.1;

          // Place on appropriate wall
          switch (elev) {
            case 'N':
              mesh.position.set(offsetX + elOffsetX + elW / 2, elH / 2 + 0.5, l / 2 - wallOffset);
              break;
            case 'S':
              mesh.position.set(offsetX + elOffsetX + elW / 2, elH / 2 + 0.5, -l / 2 + wallOffset);
              break;
            case 'E':
              mesh.position.set(offsetX + w / 2 - wallOffset, elH / 2 + 0.5, elOffsetX + elW / 2);
              break;
            case 'W':
              mesh.position.set(offsetX - w / 2 + wallOffset, elH / 2 + 0.5, elOffsetX + elW / 2);
              break;
            case 'ceiling':
              mesh.position.set(offsetX + elOffsetX, (room.dimensions.height_mm || 3000) / 1000 - 0.1, elOffsetX);
              break;
            default:
              mesh.position.set(offsetX + elOffsetX, 0.05, elOffsetX);
          }

          this.roomGroup.add(mesh);
          elOffsetX += elW + 0.1;
        }
      }

      offsetX += w + padding;
    }
  }

  startRendering() {
    if (this.animating) return;
    this.animating = true;
    const loop = () => {
      if (!this.animating) return;
      this.renderer.render(this.scene, this.camera);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stopRendering() {
    this.animating = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  dispose() {
    this.stopRendering();
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
