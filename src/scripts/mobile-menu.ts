const DESKTOP = '(min-width: 1280px)';

/** Wires the menu button: aria-expanded, focus move, Escape, Tab trap, outside click. */
export function initMobileMenu(): void {
  const header = document.querySelector<HTMLElement>('[data-site-header]');
  const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const menu = toggle && document.getElementById(toggle.getAttribute('aria-controls') ?? '');
  if (!header || !toggle || !menu) return;

  const links = () => Array.from(menu.querySelectorAll<HTMLAnchorElement>('a[href]'));

  const setOpen = (open: boolean, restoreFocus = false) => {
    toggle.setAttribute('aria-expanded', String(open));
    header.classList.toggle('is-open', open);
    if (open) links()[0]?.focus();
    else if (restoreFocus) toggle.focus();
  };
  const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';

  toggle.addEventListener('click', () => setOpen(!isOpen()));

  document.addEventListener('keydown', (event) => {
    if (!isOpen()) return;
    if (event.key === 'Escape') {
      setOpen(false, true);
    } else if (event.key === 'Tab') {
      // The cycle is the toggle followed by the links, so the close button is reachable.
      const items = [toggle, ...links()];
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = active === toggle || menu.contains(active);
      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first?.focus();
      }
    }
  });

  document.addEventListener('click', (event) => {
    if (isOpen() && event.target instanceof Node && !header.contains(event.target)) setOpen(false);
  });
  menu.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a')) setOpen(false);
  });

  window.matchMedia(DESKTOP).addEventListener('change', (event) => {
    if (event.matches && isOpen()) setOpen(false);
  });
}
