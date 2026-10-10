// Native task anchors remain the navigation mechanism. This module only
// reflects the viewport's active workbench section for sighted users and AT.
// It never moves focus, intercepts navigation, or remounts editor controls.
export function setupWorkbenchNavigation(nav, win = window, doc = document) {
  if (!nav) return () => {};
  const sections = [...nav.querySelectorAll('a[href^="#"]')]
    .map((link) => ({ link, heading: doc.getElementById(link.hash.slice(1)) }))
    .filter(({ heading }) => Boolean(heading));
  if (!sections.length) return () => {};

  let pendingFrame = 0;
  const select = (active) => {
    for (const item of sections) {
      if (item === active) item.link.setAttribute('aria-current', 'location');
      else item.link.removeAttribute('aria-current');
    }
  };
  const update = () => {
    pendingFrame = 0;
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
    select(active);
  };
  const schedule = () => {
    if (pendingFrame) return;
    pendingFrame = win.requestAnimationFrame(update);
  };
  const onClick = (event) => {
    const link = event.target.closest?.('a[href^="#"]');
    const item = sections.find(({ link: candidate }) => candidate === link);
    if (item) select(item);
    // Let the browser handle real hash navigation and heading focus.
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
