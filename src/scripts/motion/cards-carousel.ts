import { clamp, easeCss, reducedMotion } from './util';

const SLIDE_MS = 600; // previous and next
const DOT_MS = 300;

/**
 * E4: the project card row. Previous and next move it by one card in 0.6 s,
 * a dot below 1024 px moves it to its card in 0.3 s, both with CSS `ease`.
 * The row has no autoplay and does not loop. It stays a native scrolling
 * row, so touch, trackpad and keyboard scrolling keep working. Under reduced
 * motion the row jumps without the slide.
 */
export function initCarousel(): void {
  document.querySelectorAll<HTMLElement>('[data-carousel]').forEach(setup);
}

function setup(root: HTMLElement): void {
  const track = root.querySelector<HTMLElement>('[data-cards-track]');
  const prev = root.querySelector<HTMLButtonElement>('[data-carousel-prev]');
  const next = root.querySelector<HTMLButtonElement>('[data-carousel-next]');
  const dots = [...root.querySelectorAll<HTMLButtonElement>('[data-carousel-dot]')];
  if (!track || !prev || !next) return;
  const cards = [...track.children] as HTMLElement[];
  let frame = 0;

  // The scroll position of each card, as far as the row can scroll.
  const stops = () => {
    const max = track.scrollWidth - track.clientWidth;
    return [...new Set(cards.map((card) => Math.round(clamp(card.offsetLeft - cards[0]!.offsetLeft, 0, max))))];
  };
  const current = () => {
    const list = stops();
    let best = 0;
    list.forEach((stop, i) => {
      if (Math.abs(stop - track.scrollLeft) < Math.abs(list[best]! - track.scrollLeft)) best = i;
    });
    return best;
  };

  const go = (index: number, duration: number) => {
    const list = stops();
    const to = list[clamp(index, 0, list.length - 1)]!;
    cancelAnimationFrame(frame);
    if (reducedMotion().matches || duration === 0) {
      track.scrollLeft = to;
      return;
    }
    // Scroll snapping would fight the animation, so it is off until the row arrives.
    const from = track.scrollLeft;
    const start = performance.now();
    track.style.scrollSnapType = 'none';
    const step = (now: number) => {
      const t = clamp((now - start) / duration);
      track.scrollLeft = from + (to - from) * easeCss(t);
      if (t < 1) frame = requestAnimationFrame(step);
      else track.style.removeProperty('scroll-snap-type');
    };
    frame = requestAnimationFrame(step);
  };

  const update = () => {
    const index = current();
    const last = stops().length - 1;
    prev.setAttribute('aria-disabled', String(index <= 0));
    next.setAttribute('aria-disabled', String(index >= last));
    dots.forEach((dot, i) => {
      if (i === index) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  };

  prev.addEventListener('click', () => {
    if (prev.getAttribute('aria-disabled') !== 'true') go(current() - 1, SLIDE_MS);
  });
  next.addEventListener('click', () => {
    if (next.getAttribute('aria-disabled') !== 'true') go(current() + 1, SLIDE_MS);
  });
  dots.forEach((dot, i) => dot.addEventListener('click', () => go(i, DOT_MS)));

  let pending = 0;
  track.addEventListener(
    'scroll',
    () => {
      if (!pending) pending = requestAnimationFrame(() => ((pending = 0), update()));
    },
    { passive: true },
  );
  new ResizeObserver(update).observe(track);
  update();
}
