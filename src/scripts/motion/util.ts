/** Helpers shared by the motion scripts. No effect runs on import. */

export const reducedMotion = (): MediaQueryList => matchMedia('(prefers-reduced-motion: reduce)');

export const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));

export const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

/** A CSS `cubic-bezier()` timing function as a JavaScript function of time (0 to 1). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const bez = (a: number, b: number, t: number) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t ** 2 + t ** 3;
  const slope = (a: number, b: number, t: number) => 3 * a * (1 - t) ** 2 + 6 * (b - a) * (1 - t) * t + 3 * (1 - b) * t ** 2;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton's method finds the curve parameter for x, then y follows from it.
    let t = x;
    for (let i = 0; i < 8; i++) {
      const dx = bez(x1, x2, t) - x;
      const d = slope(x1, x2, t);
      if (Math.abs(dx) < 1e-6 || d === 0) break;
      t = clamp(t - dx / d);
    }
    return bez(y1, y2, t);
  };
}

export const easeCss = cubicBezier(0.25, 0.1, 0.25, 1);

/**
 * Runs `render` with a value that follows `target()` with the live site's
 * smoothing: each 60 Hz frame it moves `factor` of the remaining distance.
 * The value is recomputed on scroll and resize. `stop()` removes the listeners.
 */
export function follow(target: () => number, render: (value: number) => void, factor = 0.12) {
  let goal = target();
  let value = goal;
  let frame = 0;
  let last = 0;

  const tick = (now: number) => {
    const dt = last ? Math.min(now - last, 100) : 1000 / 60;
    last = now;
    value += (goal - value) * (1 - (1 - factor) ** (dt / (1000 / 60)));
    if (Math.abs(goal - value) < 1e-4) value = goal;
    render(value);
    if (value === goal) {
      frame = 0;
      last = 0;
    } else {
      frame = requestAnimationFrame(tick);
    }
  };
  const kick = () => {
    goal = target();
    if (!frame) frame = requestAnimationFrame(tick);
  };

  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', kick);
  render(value);

  return {
    kick,
    stop() {
      removeEventListener('scroll', kick);
      removeEventListener('resize', kick);
      cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/** Calls `enable` when motion is allowed and `disable` when the user turns on reduced motion. */
export function whenMotionAllowed(enable: () => void, disable: () => void): void {
  const query = reducedMotion();
  let on = false;
  const sync = () => {
    if (!query.matches && !on) {
      on = true;
      enable();
    } else if (query.matches && on) {
      on = false;
      disable();
    }
  };
  query.addEventListener('change', sync);
  sync();
}
