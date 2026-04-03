let currentToast = null;
let dismissTimer = null;

export function showToast(message, type = 'info') {
  // Dismiss existing toast immediately
  if (currentToast) {
    if (dismissTimer) clearTimeout(dismissTimer);
    currentToast.remove();
    currentToast = null;
  }

  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  currentToast = toast;

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('toast-visible');
  });

  dismissTimer = setTimeout(() => {
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-hiding');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.remove();
      if (currentToast === toast) currentToast = null;
    }, { once: true });
  }, 2500);
}
