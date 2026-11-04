import { clamp, cubicBezier, follow, whenMotionAllowed } from './util';

const STEP = 500; // px of scrolling per card
const FROM_BELOW = 1100; // px below its place where the next card starts
const SHIFT = 20; // px each covered card moves per step
const SHRINK = 0.04; // scale each covered card loses per step
const ease = cubicBezier(0.165, 0.84, 0.44, 1);

/**
 * E10 on the service pages. The "How it works" section pins, and each 500 px
 * of scrolling slides the next numbered card up over the previous ones, which
 * move 20 px (down from 1024 px, up below) and shrink a little. Under reduced
 * motion the cards stay listed one after another.
 */
export function initStackCards(): void {
  document.querySelectorAll<HTMLElement>('[data-stack]').forEach(setup);
}

function setup(section: HTMLElement): void {
  const inner = section.querySelector<HTMLElement>('.steps__pin');
  const cards = [...section.querySelectorAll<HTMLElement>('ol > li')];
  if (!inner || cards.length < 2) return;
  const steps = cards.length - 1;
  const distance = STEP * steps;
  let driver: ReturnType<typeof follow> | null = null;
  let stickAt = 0;
  const resized = new ResizeObserver(() => measure());

  // The section gets the pinned distance as extra height. If the pinned
  // block is taller than the viewport, it pins with its bottom edge at the
  // bottom of the viewport instead of its top at the top.
  const measure = () => {
    stickAt = Math.min(0, innerHeight - inner.offsetHeight);
    section.style.setProperty('--pin-top', `${stickAt}px`);
    section.style.height = `${inner.offsetHeight + distance}px`;
  };

  const render = (progress: number) => {
    const dir = innerWidth >= 1024 ? 1 : -1;
    const done = Array.from({ length: steps }, (_, s) => ease(clamp(progress * steps - s)));
    cards.forEach((card, i) => {
      const arrive = i === 0 ? 0 : FROM_BELOW * (1 - done[i - 1]!);
      const covered = done.slice(i).reduce((sum, t) => sum + t, 0);
      const y = arrive + dir * SHIFT * covered;
      const scale = 1 - SHRINK * covered;
      card.style.transform = y === 0 && scale === 1 ? '' : `translateY(${y.toFixed(2)}px) scale(${scale.toFixed(4)})`;
    });
  };

  const enable = () => {
    section.classList.add('is-pinned');
    measure();
    resized.observe(inner);
    addEventListener('resize', measure);
    driver = follow(() => clamp((stickAt - section.getBoundingClientRect().top) / distance), render);
  };

  const disable = () => {
    driver?.stop();
    resized.disconnect();
    removeEventListener('resize', measure);
    section.classList.remove('is-pinned');
    section.style.removeProperty('height');
    section.style.removeProperty('--pin-top');
    cards.forEach((card) => card.style.removeProperty('transform'));
  };

  whenMotionAllowed(enable, disable);
}
