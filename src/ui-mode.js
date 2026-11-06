/* UI presentation route only. Never grants output-file authority or bypasses
 * the explicit V3 target requirement. Unspecified URLs use the current V3
 * workbench; an explicit fallback keeps the prior production UI accessible. */
export function resolveSoftmuxUiMode(search = '') {
  const requested = new URLSearchParams(search).get('ui');
  if (requested === 'legacy') return 'legacy';      // original diagnostic page
  if (requested === 'workbench') return 'workbench'; // previous 10.14 workbench
  return 'v3'; // /, ?ui=v3 and unrecognised values consistently use V3
}
