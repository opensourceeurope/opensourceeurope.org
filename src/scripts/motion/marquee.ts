import { whenMotionAllowed } from './util';

/**
 * E3: the partner logos move left in one row, 30 px/s above 768 px and
 * 15 px/s at 768 px and narrower. A copy of the logos follows the first set,
 * and the row jumps back by one set's width, so the loop has no seam. The row
 * pauses on hover, on keyboard focus and with the pause button (WCAG 2.2.2).
 * Under reduced motion the logos sit still and wrap into rows.
 */
export function initMarquee(): void {
  document.querySelectorAll<HTMLElement>('[data-marquee]').forEach(setup);
}

function setup(root: HTMLElement): void {
  const track = root.querySelector<HTMLElement>('[data-marquee-track]');
  const pause = root.querySelector<HTMLButtonElement>('[data-marquee-pause]');
  if (!track || !pause) return;
  const originals = [...track.children] as HTMLElement[];
  const narrow = matchMedia('(max-width: 768px)');

  // The duration follows the width of one set, so the speed stays the same at every width.
  const measure = () => {
    const shift = track.scrollWidth / 2;
    const speed = narrow.matches ? 15 : 30;
    root.style.setProperty('--marquee-shift', `${-shift}px`);
    root.style.setProperty('--marquee-duration', `${shift / speed}s`);
  };
  const resized = new ResizeObserver(measure);

  const toggle = () => {
    const paused = pause.getAttribute('aria-pressed') !== 'true';
    pause.setAttribute('aria-pressed', String(paused));
    root.classList.toggle('is-paused', paused);
  };

  const enable = () => {
    for (const item of originals) {
      const copy = item.cloneNode(true) as HTMLElement;
      copy.setAttribute('aria-hidden', 'true');
      copy.dataset.marqueeCopy = '';
      copy.querySelectorAll('a').forEach((link) => link.setAttribute('tabindex', '-1'));
      track.append(copy);
    }
    root.classList.add('is-running');
    measure();
    resized.observe(track);
    pause.addEventListener('click', toggle);
  };

  const disable = () => {
    resized.disconnect();
    pause.removeEventListener('click', toggle);
    track.querySelectorAll('[data-marquee-copy]').forEach((copy) => copy.remove());
    root.classList.remove('is-running', 'is-paused');
    pause.setAttribute('aria-pressed', 'false');
    root.style.removeProperty('--marquee-shift');
    root.style.removeProperty('--marquee-duration');
  };

  whenMotionAllowed(enable, disable);
}
