let currentSheet = null;
let sheetConfig = null;

export function openSheet(config) {
  closeSheet(false);

  sheetConfig = config;

  const overlay = document.getElementById('sheet-overlay');
  if (!overlay) return;

  // Build sheet HTML
  const sheet = document.createElement('div');
  sheet.className = 'bottom-sheet';
  sheet.innerHTML = `
    <div class="sheet-drag-handle"></div>
    <div class="sheet-header">
      <span class="sheet-title">${config.title || ''}</span>
      <button class="sheet-close-btn" aria-label="Close">✕</button>
    </div>
    <div class="sheet-content"></div>
  `;

  const contentEl = sheet.querySelector('.sheet-content');
  if (typeof config.content === 'string') {
    contentEl.innerHTML = config.content;
  } else if (config.content instanceof Node) {
    contentEl.appendChild(config.content);
  }

  overlay.innerHTML = '';
  overlay.appendChild(sheet);
  overlay.classList.add('sheet-overlay-active');
  currentSheet = sheet;

  // Animate in
  requestAnimationFrame(() => {
    sheet.classList.add('sheet-open');
  });

  // Close button
  sheet.querySelector('.sheet-close-btn').addEventListener('click', () => closeSheet(true));

  // Tap backdrop
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSheet(true);
  }, { once: true });

  // Drag-to-close
  let startY = 0;
  let isDragging = false;
  const handle = sheet.querySelector('.sheet-drag-handle');

  handle.addEventListener('pointerdown', (e) => {
    startY = e.clientY;
    isDragging = true;
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const dy = e.clientY - startY;
    if (dy > 0) {
      sheet.style.transform = `translateY(${dy}px)`;
    }
  });

  handle.addEventListener('pointerup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    const dy = e.clientY - startY;
    if (dy > 80) {
      closeSheet(true);
    } else {
      sheet.style.transform = '';
    }
  });
}

export function closeSheet(callOnClose = true) {
  if (!currentSheet) return;
  const sheet = currentSheet;
  const overlay = document.getElementById('sheet-overlay');
  currentSheet = null;

  sheet.classList.remove('sheet-open');
  sheet.classList.add('sheet-closing');

  sheet.addEventListener('transitionend', () => {
    if (overlay) {
      overlay.classList.remove('sheet-overlay-active');
      overlay.innerHTML = '';
    }
  }, { once: true });

  if (callOnClose && sheetConfig && typeof sheetConfig.onClose === 'function') {
    sheetConfig.onClose();
  }
  sheetConfig = null;
}
