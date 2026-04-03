import './styles/main.css';
import './styles/components.css';

import { loadState, state } from './state.js';
import { navigate, registerScreenCallback } from './router.js';
import { initProjectsScreen, renderProjects } from './screens/projects.js';
import { initPlanScreen, renderPlan } from './screens/plan.js';
import { initElevationsScreen, renderElevations } from './screens/elevations.js';
import { initViewer, renderViewer } from './screens/viewer3d.js';

function buildAppShell() {
  document.getElementById('app').innerHTML = `
    <div id="screen-projects" class="screen hidden"></div>
    <div id="screen-plan"     class="screen hidden"></div>
    <div id="screen-elevations" class="screen hidden"></div>
    <div id="screen-3d"       class="screen hidden"></div>

    <nav id="bottom-nav">
      <button data-screen="projects">
        <span class="nav-icon">🏗️</span>
        <span>Projects</span>
      </button>
      <button data-screen="plan">
        <span class="nav-icon">📐</span>
        <span>Plan</span>
      </button>
      <button data-screen="elevations">
        <span class="nav-icon">🧱</span>
        <span>Elevations</span>
      </button>
      <button data-screen="3d">
        <span class="nav-icon">🔲</span>
        <span>3D</span>
      </button>
    </nav>

    <div id="toast-container"></div>
    <div id="sheet-overlay"></div>
  `;

  document.querySelectorAll('#bottom-nav button').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.screen));
  });
}

async function main() {
  loadState();
  buildAppShell();

  // Init all screens
  initProjectsScreen();
  initPlanScreen();
  initElevationsScreen();
  initViewer();

  // Register render callbacks for screen switches
  registerScreenCallback('projects', renderProjects);
  registerScreenCallback('plan', renderPlan);
  registerScreenCallback('elevations', renderElevations);
  registerScreenCallback('3d', renderViewer);

  // Navigate to start screen
  navigate('projects');
}

main();
