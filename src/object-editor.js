// Focus one object category without moving or recreating live track controls.
export function setupObjectEditor(root) {
  if (!root) return;
  const buttons = [...root.querySelectorAll('[data-editor-filter]')];
  const panels = [...root.querySelectorAll('[data-object-panel]')];
  const config = root.querySelector('.config-card');
  const apply = (category) => {
    root.dataset.editorFocus = category;
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.editorFilter === category));
    }
    for (const panel of panels) {
      panel.hidden = category !== 'all' && panel.dataset.objectPanel !== category;
    }
    config.hidden = category === 'source';
  };
  for (const [index, button] of buttons.entries()) {
    button.addEventListener('click', () => apply(button.dataset.editorFilter));
    button.addEventListener('keydown', (event) => {
      let target;
      if (event.key === 'ArrowRight') target = (index + 1) % buttons.length;
      if (event.key === 'ArrowLeft') target = (index - 1 + buttons.length) % buttons.length;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = buttons.length - 1;
      if (target === undefined) return;
      event.preventDefault();
      buttons[target].focus();
      buttons[target].click();
    });
  }
  apply('all');
}
