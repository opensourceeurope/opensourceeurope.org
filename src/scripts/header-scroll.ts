const HIDE_AFTER = 108;
const SHOW_AFTER_UP = 600;

/** Header behaviour from dev-guide/animations.md E7: solid below the top, hides on scroll down, returns after 600 px up. */
export function initHeaderScroll(): void {
  const header = document.querySelector<HTMLElement>('[data-site-header]');
  if (!header) return;
  // A pinned header (the docs) turns solid but never hides.
  const pinned = header.hasAttribute('data-pinned');

  let lastY = window.scrollY;
  let upDistance = 0;
  let ticking = false;

  const update = () => {
    ticking = false;
    const y = Math.max(0, window.scrollY);
    const delta = y - lastY;
    lastY = y;
    header.classList.toggle('is-solid', y > 0);

    const menuOpen = header.classList.contains('is-open');
    if (pinned || y === 0 || menuOpen) {
      upDistance = 0;
      header.classList.remove('is-hidden');
    } else if (delta > 0) {
      upDistance = 0;
      if (y > HIDE_AFTER && !header.contains(document.activeElement)) header.classList.add('is-hidden');
    } else if (delta < 0) {
      upDistance -= delta;
      if (upDistance >= SHOW_AFTER_UP) header.classList.remove('is-hidden');
    }
  };

  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  header.addEventListener('focusin', () => header.classList.remove('is-hidden'));
  update();
}
