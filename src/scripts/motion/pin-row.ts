import { clamp, follow, whenMotionAllowed } from './util';

/**
 * E9 on the about page. The "Our values" section pins, and while the page
 * scrolls by the width of the card row minus the viewport width, the row
 * moves left by the same distance, so the last card ends in view. Under
 * reduced motion the row stays a region that scrolls sideways by itself.
 */
export function initPinRow(): void {
  document.querySelectorAll<HTMLElement>('[data-values]').forEach(setup);
}

function setup(section: HTMLElement): void {
  const inner = section.querySelector<HTMLElement>('.values__pin');
  const track = section.querySelector<HTMLElement>('[data-values-track]');
  const row = track?.firstElementChild;
  if (!inner || !track || !(row instanceof HTMLElement)) return;
  let driver: ReturnType<typeof follow> | null = null;
  let distance = 0;
  let stickAt = 0;
  const resized = new ResizeObserver(() => measure());

  const measure = () => {
    distance = Math.max(0, row.scrollWidth - track.clientWidth);
    stickAt = Math.min(0, innerHeight - inner.offsetHeight);
    section.style.setProperty('--pin-top', `${stickAt}px`);
    section.style.height = `${inner.offsetHeight + distance}px`;
  };

  const render = (progress: number) => {
    row.style.transform = progress ? `translateX(${(-progress * distance).toFixed(2)}px)` : '';
  };

  const enable = () => {
    section.classList.add('is-pinned');
    track.scrollLeft = 0;
    measure();
    resized.observe(inner);
    addEventListener('resize', measure);
    driver = follow(() => (distance ? clamp((stickAt - section.getBoundingClientRect().top) / distance) : 0), render);
  };

  const disable = () => {
    driver?.stop();
    resized.disconnect();
    removeEventListener('resize', measure);
    section.classList.remove('is-pinned');
    section.style.removeProperty('height');
    section.style.removeProperty('--pin-top');
    row.style.removeProperty('transform');
  };

  whenMotionAllowed(enable, disable);
}
