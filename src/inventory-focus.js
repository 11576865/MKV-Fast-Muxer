// The inventory is rerendered from domain state after an item changes.
// Preserve a meaningful keyboard focus target rather than dropping focus to
// document.body when the clicked button/input has been removed.
export function focusUpdatedInventoryItem(root, {
  selector,
  previousIndex = 0,
  keyAttribute = '',
  key = '',
  fallback = null,
} = {}) {
  if (!root || !selector) return false;
  const controls = [...root.querySelectorAll(selector)];
  const matching = keyAttribute
    ? controls.find((control) => control.getAttribute(keyAttribute) === key)
    : null;
  const index = Math.max(0, Math.min(previousIndex, controls.length - 1));
  const target = matching || controls[index] || fallback;
  if (!target || target.disabled) return false;
  target.focus({ preventScroll: true });
  return true;
}
