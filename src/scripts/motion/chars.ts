import { reducedMotion } from './util';

const FIRST_DELAY = 380;
const STAGGER = 50;

/**
 * E1: when a highlighted word comes into view, its bar grows and its letters
 * grow one after another. The letters stay at full height until that moment,
 * so nothing is hidden before the script runs, and nothing moves under
 * reduced motion.
 */
export function initChars(): void {
  const marks = document.querySelectorAll<HTMLElement>('[data-highlight]');
  if (!marks.length || reducedMotion().matches) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        if (!reducedMotion().matches) grow(entry.target as HTMLElement);
      }
    },
    { threshold: 0.2 },
  );
  marks.forEach((mark) => observer.observe(mark));
}

function grow(mark: HTMLElement): void {
  const chars = [...mark.querySelectorAll<HTMLElement>('.char')];
  chars.forEach((char, i) => (char.style.animationDelay = `${FIRST_DELAY + i * STAGGER}ms`));
  mark.classList.add('is-growing');
  // Drop the animation once the last letter is done, so the word is back in its plain state.
  chars.at(-1)?.addEventListener(
    'animationend',
    () => {
      mark.classList.remove('is-growing');
      chars.forEach((char) => char.style.removeProperty('animation-delay'));
    },
    { once: true },
  );
}
