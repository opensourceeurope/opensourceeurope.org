import { clamp, follow, lerp, whenMotionAllowed } from './util';

const MIN_PIN_HEIGHT = 600;

/**
 * E2 on the home page. The quote section with the rows of round holders pins
 * to the top of the viewport. Over two viewport heights of scrolling every
 * holder grows until the middle one fills the screen as one large circle.
 * Then the "Getting started" section, which follows in the page, scrolls up
 * over the pinned circle. Under reduced motion, or on a viewport shorter than
 * 600 px, nothing is pinned and the sections keep their settled layout.
 */
export function initPinCircle(): void {
  const quote = document.querySelector<HTMLElement>('[data-pin-circle]');
  // Script elements may sit between the two sections; skip them.
  let over = quote?.nextElementSibling;
  while (over instanceof HTMLScriptElement) over = over.nextElementSibling;
  if (!quote || !(over instanceof HTMLElement) || !over.matches('[data-pin-circle-over]')) return;

  let wrapper: HTMLDivElement | null = null;
  let driver: ReturnType<typeof follow> | null = null;
  const props = ['--c-size', '--c-y', '--c-pad', '--c-rows', '--c-fade-h', '--c-fade-b'];

  const enable = () => {
    wrapper = document.createElement('div');
    wrapper.className = 'pin-circle';
    quote.before(wrapper);
    wrapper.append(quote, over);
    // The growth runs while the wrapper's top moves from the top of the
    // viewport up by the gap that the stylesheet puts above the next section.
    driver = follow(() => {
      const distance = parseFloat(getComputedStyle(over).marginTop) || innerHeight * 2;
      return clamp(-wrapper!.getBoundingClientRect().top / distance);
    }, render);
  };

  const disable = () => {
    driver?.stop();
    if (wrapper) {
      wrapper.before(quote, over);
      wrapper.remove();
    }
    props.forEach((prop) => quote.style.removeProperty(prop));
    wrapper = null;
    driver = null;
  };

  const render = (progress: number) => {
    const wide = innerWidth >= 1024;
    const vh = innerHeight;
    const vw = document.documentElement.clientWidth;
    // Phase 1 grows every holder to the viewport height. Phase 2 grows it on
    // until the middle holder covers the screen, and fades in its lower edge.
    const t1 = clamp(progress * 2);
    const t2 = clamp(progress * 2 - 1);
    const end = wide ? { size: 1.5 * vw, y: 2 * vw, pad: 120, fade: 700, rows: 0 } : { size: 1.5 * vh, y: 1.8 * vh, pad: 220, fade: 240, rows: -60 };
    const start = wide ? { size: 150, pad: 30, rows: -75 } : { size: 45, pad: 10, rows: -20 };

    const set = (prop: string, value: number) => quote.style.setProperty(prop, `${value.toFixed(2)}px`);
    set('--c-size', t2 > 0 ? lerp(vh, end.size, t2) : lerp(start.size, vh, t1));
    set('--c-y', t2 > 0 ? lerp(vh, end.y, t2) : lerp(0, vh, t1));
    set('--c-pad', t2 > 0 ? lerp(150, end.pad, t2) : lerp(start.pad, 150, t1));
    set('--c-rows', lerp(start.rows, end.rows, t1));
    set('--c-fade-h', lerp(0, 600, t2));
    set('--c-fade-b', lerp(-20, end.fade, t2));
  };

    // The pinned quote is exactly one viewport tall. On a short viewport its text
  // would be clipped behind the circles, so it stays unpinned there.
  const tall = matchMedia(`(min-height: ${MIN_PIN_HEIGHT}px)`);
  let motion = false;
  const sync = () => {
    if (motion && tall.matches && !wrapper) enable();
    else if (!(motion && tall.matches) && wrapper) disable();
  };
  tall.addEventListener('change', sync);
  whenMotionAllowed(
    () => {
      motion = true;
      sync();
    },
    () => {
      motion = false;
      sync();
    },
  );
}
