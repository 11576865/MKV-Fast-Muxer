// Native task anchors remain the navigation mechanism. This module only
// reflects the viewport's active workbench section for sighted users and AT.
// It never moves focus, intercepts navigation, or remounts editor controls.
export function setupWorkbenchNavigation(nav, win = window, doc = document) {
  if (!nav) return () => {};
  const sections = [...nav.querySelectorAll('a[href^="#"]')]
    .map((link) => ({ link, heading: doc.getElementById(link.hash.slice(1)) }))
    .filter(({ heading }) => Boolean(heading));
  if (!sections.length) return () => {};

  // Narrow screens use a single active work area rather than a four-stage
  // document that forces the export action several screens below the files.
  // All DOM nodes stay mounted: editor values, FFmpeg jobs and file inputs
  // retain their original state and event listeners.
  const workspace = doc.querySelector?.('.workspace');
  let activeMobileView = 'source';
  const sectionViews = new Map([
    ['source-title', 'source'],
    ['workbench-editor-title', 'edit'],
    ['workbench-output-title', 'output'],
    ['batch-title', 'batch'],
  ]);
  const isMobile = () => Boolean(win.matchMedia?.('(max-width: 600px)')?.matches);
  const currentHashView = () => sectionViews.get(win.location?.hash?.slice(1));
  const mobileView = (view) => {
    if (!workspace || ![...sectionViews.values()].includes(view)) return;
    activeMobileView = view;
    workspace.dataset.mobileView = view;
    for (const item of sections) {
      const selected = sectionViews.get(item.heading.id) === view;
      if (selected) {
        item.link.setAttribute('aria-current', 'location');
      } else {
        item.link.removeAttribute('aria-current');
      }
    }
    if (view === 'batch') {
      const drawer = doc.querySelector?.('.batch-drawer');
      if (drawer) drawer.open = true;
    }
  };
  if (workspace && isMobile()) mobileView(currentHashView() || 'source');
  let pendingFrame = 0;
  const select = (active) => {
    for (const item of sections) {
      if (item === active) item.link.setAttribute('aria-current', 'location');
      else item.link.removeAttribute('aria-current');
    }
  };
  const update = () => {
    pendingFrame = 0;
    if (isMobile() && workspace) {
      mobileView(currentHashView() || activeMobileView);
      return;
    }
    if (win.getComputedStyle(nav).display === 'none') return;
    const cutoff = nav.getBoundingClientRect().bottom + 18;
    let active = sections[0];
    for (const item of sections) {
      if (item.heading.getBoundingClientRect().top <= cutoff) active = item;
    }
    // Native anchors close to the document end sometimes cannot reach their
    // scroll-margin target; the last section still needs an active state.
    if (win.scrollY + win.innerHeight >= doc.documentElement.scrollHeight - 2) {
      active = sections.at(-1);
    }
    // Native fragment navigation may stop the heading slightly BELOW the
    // sticky-nav cutoff because of scroll-margin, browser scroll anchoring,
    // or a short remaining page. The requested heading is authoritative
    // while it is genuinely near the top of the visible viewport.
    const hashTarget = sections.find(({ link }) => link.hash === win.location?.hash);
    if (hashTarget) {
      const top = hashTarget.heading.getBoundingClientRect().top;
      if (top >= -16 && top <= Math.min(win.innerHeight * .5, 260)) {
        active = hashTarget;
      }
    }
    select(active);
  };
  const schedule = () => {
    if (pendingFrame) return;
    pendingFrame = win.requestAnimationFrame(update);
  };
  const onClick = (event) => {
    const link = event.target.closest?.('a[href^="#"]');
    const item = sections.find(({ link: candidate }) => candidate === link);
    if (item && isMobile() && workspace) {
      mobileView(sectionViews.get(item.heading.id));
      return; // native anchor navigation works after its target is revealed
    }
    if (item) select(item);
    schedule();
  };
  nav.addEventListener('click', onClick);
  win.addEventListener('scroll', schedule, { passive: true });
  win.addEventListener('resize', schedule);
  win.addEventListener('hashchange', schedule);
  schedule();
  return () => {
    nav.removeEventListener('click', onClick);
    win.removeEventListener('scroll', schedule);
    win.removeEventListener('resize', schedule);
    win.removeEventListener('hashchange', schedule);
    if (pendingFrame) win.cancelAnimationFrame(pendingFrame);
  };
}
