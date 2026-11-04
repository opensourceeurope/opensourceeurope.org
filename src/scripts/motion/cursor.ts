import { reducedMotion } from './util';

type Glow = { el: HTMLElement; x: number; y: number; tx: number; ty: number; factor: number };

const KINDS = {
  // Pill buttons: an 80 px glow that moves 18 % of the way to the pointer each frame.
  button: { factor: 0.18, className: 'glow glow--button' },
  // "Getting started" step cards: a 200 px blurred glow, about 15 % per frame.
  card: { factor: 0.15, className: 'glow glow--card' },
} as const;

/**
 * E5: a soft glow follows the pointer inside buttons and step cards, and the
 * arrow circle of the project carousel sits under the pointer. Runs only with
 * a fine pointer, never hides the system cursor, and under reduced motion
 * nothing follows the pointer.
 */
export function initCursor(): void {
  const fine = matchMedia('(pointer: fine)');
  const glows = new Map<HTMLElement, Glow>();
  let frame = 0;
  const allowed = () => fine.matches && !reducedMotion().matches;

  const tick = () => {
    let moving = false;
    for (const glow of glows.values()) {
      glow.x += (glow.tx - glow.x) * glow.factor;
      glow.y += (glow.ty - glow.y) * glow.factor;
      if (Math.abs(glow.tx - glow.x) > 0.1 || Math.abs(glow.ty - glow.y) > 0.1) {
        moving = true;
      } else {
        glow.x = glow.tx;
        glow.y = glow.ty;
      }
      glow.el.style.transform = `translate(${glow.x.toFixed(1)}px, ${glow.y.toFixed(1)}px)`;
    }
    frame = moving ? requestAnimationFrame(tick) : 0;
  };

  const point = (host: HTMLElement, event: PointerEvent) => {
    const box = host.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  document.addEventListener('pointerover', (event) => {
    if (event.pointerType !== 'mouse' || !allowed()) return;
    const host = (event.target as Element).closest<HTMLElement>('[data-glow]');
    if (!host || glows.get(host)?.el.classList.contains('is-on')) return;
    const kind = KINDS[host.dataset.glow as keyof typeof KINDS];
    if (!kind) return;
    const { x, y } = point(host, event);
    let glow = glows.get(host);
    if (!glow) {
      const el = document.createElement('span');
      el.className = kind.className;
      el.setAttribute('aria-hidden', 'true');
      el.dataset.glowEl = '';
      host.prepend(el);
      glow = { el, x, y, tx: x, ty: y, factor: kind.factor };
      glows.set(host, glow);
      el.style.transform = `translate(${x}px, ${y}px)`;
    }
    glow.el.classList.add('is-on');
  });

  document.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse' || !allowed()) return;
    const target = event.target as Element;
    const host = target.closest<HTMLElement>('[data-glow]');
    const glow = host && glows.get(host);
    if (host && glow) {
      ({ x: glow.tx, y: glow.ty } = point(host, event));
      if (!frame) frame = requestAnimationFrame(tick);
    }
    // The carousel arrow circle sits right under the pointer, with no delay.
    const zone = target.closest<HTMLElement>('[data-carousel-prev], [data-carousel-next]');
    const arrow = zone?.querySelector<HTMLElement>('[data-follow]');
    if (zone && arrow) {
      const box = zone.getBoundingClientRect();
      arrow.style.setProperty('--x', `${event.clientX - box.left - box.width / 2}px`);
      arrow.style.setProperty('--y', `${event.clientY - box.top - box.height / 2}px`);
    }
  });

  document.addEventListener('pointerout', (event) => {
    const host = (event.target as Element).closest<HTMLElement>('[data-glow]');
    if (!host || (event.relatedTarget instanceof Node && host.contains(event.relatedTarget))) return;
    glows.get(host)?.el.classList.remove('is-on');
  });

  // Turning on reduced motion removes every glow and puts the arrows back in the middle.
  reducedMotion().addEventListener('change', () => {
    if (allowed()) return;
    glows.forEach((glow) => glow.el.remove());
    glows.clear();
    document.querySelectorAll<HTMLElement>('[data-follow]').forEach((arrow) => {
      arrow.style.removeProperty('--x');
      arrow.style.removeProperty('--y');
    });
  });
}
