import { state, saveState } from './state.js';
import { showToast } from './ui/toast.js';

const SCREENS = ['projects', 'plan', 'elevations', '3d'];
const PROJECT_REQUIRED = ['plan', 'elevations', '3d'];

let screenCallbacks = {};

export function registerScreenCallback(screen, fn) {
  screenCallbacks[screen] = fn;
}

export function navigate(screen) {
  if (!SCREENS.includes(screen)) return;

  if (PROJECT_REQUIRED.includes(screen) && !state.activeProjectId) {
    showToast('No project open — tap a project first', 'info');
    return;
  }

  const prev = state.currentScreen;
  state.currentScreen = screen;

  // Hide all screens
  SCREENS.forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (el) {
      el.classList.add('hidden');
      el.classList.remove('screen-active');
    }
  });

  // Show active screen
  const activeEl = document.getElementById(`screen-${screen}`);
  if (activeEl) {
    activeEl.classList.remove('hidden');
    activeEl.classList.add('screen-active');
  }

  // Update nav
  document.querySelectorAll('#bottom-nav button').forEach(btn => {
    btn.classList.toggle('nav-active', btn.dataset.screen === screen);
  });

  // Call screen render callback
  if (screenCallbacks[screen]) {
    screenCallbacks[screen]();
  }

  saveState();
}
