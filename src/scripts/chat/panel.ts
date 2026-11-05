/*
 * The Ask button and its dialog. This file loads with every page and stays
 * small. On the first open it fetches the chat markup (a fragment built at
 * /ask/panel.html), adds the chat stylesheet and imports the controller.
 * If any of that fails the visitor goes to /ask/. Without JavaScript the
 * button stays a plain link to /ask/.
 */
import chatCssUrl from '../../styles/chat.css?url';
import panelCssUrl from '../../styles/ask-panel.css?url';
import { shortcutApplies, shortcutLabel } from './shortcut';
import type { ChatTexts } from './types';

const STYLE_WAIT_MS = 2000;

/** Adds one stylesheet once; resolves on load, error or after 2 s. */
function addStyles(href: string): Promise<void> {
  if (document.head.querySelector(`link[href="${href}"]`)) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.addEventListener('load', () => resolve());
    link.addEventListener('error', () => resolve());
    setTimeout(resolve, STYLE_WAIT_MS);
    document.head.append(link);
  });
}

const loadChatStyles = (): Promise<unknown> => Promise.all([addStyles(chatCssUrl), addStyles(panelCssUrl)]);

// Keep in step with the width rule in ask-panel.css.
const PANEL_MIN = 440; // the default width, and the narrowest
const PAGE_KEPT = 96; // the page width that always stays visible left of the panel
const KEY_STEP = 40;

/**
 * Lets the visitor widen the panel by dragging its left edge, or with the arrow keys on the
 * handle. Double-click resets the width. The width lasts until the page changes: the only
 * browser storage the site uses is the consent choice. CSS hides the handle on narrow screens.
 * Returns a function that updates the handle's value; call it after the panel opens.
 */
export function wireResize(d: HTMLDialogElement): () => void {
  const handle = d.querySelector<HTMLElement>('[data-ask-resize]');
  if (!handle) return () => undefined;
  const max = (): number => Math.max(PANEL_MIN, document.documentElement.clientWidth - PAGE_KEPT);
  const clamp = (w: number): number => Math.round(Math.min(max(), Math.max(PANEL_MIN, w)));
  // The handle reports how far the panel is between its narrowest and widest, in percent.
  const report = (): void => {
    const range = max() - PANEL_MIN;
    const now = range > 0 ? ((clamp(d.getBoundingClientRect().width) - PANEL_MIN) / range) * 100 : 0;
    handle.setAttribute('aria-valuenow', String(Math.round(now)));
  };
  const set = (w: number): void => {
    d.style.setProperty('--ask-panel-width', `${clamp(w)}px`);
    report();
  };

  let startX = 0;
  let startWidth = 0;
  handle.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    startX = event.clientX;
    startWidth = d.getBoundingClientRect().width;
    handle.setPointerCapture(event.pointerId);
    d.dataset.resizing = '';
  });
  handle.addEventListener('pointermove', (event) => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    set(startWidth + startX - event.clientX);
  });
  const stop = (event: PointerEvent): void => {
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    delete d.dataset.resizing;
  };
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
  handle.addEventListener('dblclick', () => set(PANEL_MIN));

  handle.addEventListener('keydown', (event) => {
    const width = d.getBoundingClientRect().width;
    const next: Record<string, number> = {
      ArrowLeft: width + KEY_STEP,
      ArrowUp: width + KEY_STEP,
      ArrowRight: width - KEY_STEP,
      ArrowDown: width - KEY_STEP,
      Home: PANEL_MIN,
      End: max(),
    };
    const to = next[event.key];
    if (to === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    set(to);
  });

  window.addEventListener('resize', () => {
    if (d.open) report();
  });
  // Called on each open, when the panel has its size.
  return report;
}

export function initAskPanel(): void {
  const root = document.querySelector<HTMLElement>('[data-ask-panel]');
  if (!root) return;
  // Whatever happens below, the button ends up visible: a plain link to /ask/ if the panel cannot start.
  const reveal = (): void => {
    root.dataset.ready = '';
  };
  const button = root.querySelector<HTMLAnchorElement>('[data-ask-open]');
  const fragmentUrl = button?.dataset.askFragment;
  if (!button || !fragmentUrl || typeof HTMLDialogElement === 'undefined') {
    reveal();
    return;
  }

  let dialog: HTMLDialogElement | null = null;
  let ready: Promise<boolean> | null = null;
  const prepare = (): Promise<boolean> => {
    ready ??= (async () => {
      try {
        const [res, controller] = await Promise.all([fetch(fragmentUrl), import('./controller'), loadChatStyles()]);
        if (!res.ok) throw new Error(`fragment ${res.status}`);
        const template = document.createElement('template');
        template.innerHTML = await res.text();
        const found = template.content.querySelector<HTMLDialogElement>('dialog');
        const chatRoot = template.content.querySelector<HTMLElement>('[data-chat]');
        if (!found || !chatRoot) throw new Error('fragment without dialog');
        controller.mountChat(chatRoot, {
          endpoint: chatRoot.dataset.chatEndpoint ?? '',
          texts: JSON.parse(chatRoot.dataset.chatTexts ?? '{}') as ChatTexts,
        });
        wire(found);
        // Insert only now, so a failed attempt leaves no markup behind.
        root.append(found);
        dialog = found;
        return true;
      } catch {
        ready = null;
        return false;
      }
    })();
    return ready;
  };

  // Where the focus was when the shortcut opened the panel. A click on the button leaves it null.
  let returnTo: HTMLElement | null = null;
  let reportWidth = (): void => undefined;
  const wire = (d: HTMLDialogElement): void => {
    reportWidth = wireResize(d);
    d.querySelector('[data-ask-close]')?.addEventListener('click', () => d.close());
    // Close on a click outside the panel's box only. A click on its padding also targets the dialog.
    d.addEventListener('click', (event) => {
      if (event.target !== d) return;
      const r = d.getBoundingClientRect();
      const outside = event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
      if (outside) d.close();
    });
    // The banner sits below an open modal dialog. Close the panel first, and leave the focus to the banner.
    let toBanner = false;
    d.querySelector('[data-consent-open]')?.addEventListener('click', () => {
      toBanner = true;
      d.close();
      // When the banner closes again, focus goes back to the Ask button.
      const banner = document.querySelector<HTMLElement>('[data-consent]');
      if (banner) {
        let seen = false;
        const watch = new MutationObserver(() => {
          if (!banner.hidden) seen = true;
          else if (seen) {
            watch.disconnect();
            button.focus();
          }
        });
        watch.observe(banner, { attributes: true, attributeFilter: ['hidden'] });
      }
    });
    d.addEventListener('close', () => {
      if (!toBanner) (returnTo?.isConnected ? returnTo : button).focus();
      returnTo = null;
      toBanner = false;
    });
  };

  // A same-origin prefetch of the fragment when the visitor shows interest.
  const warm = (): void => {
    void fetch(fragmentUrl).catch(() => undefined);
  };
  button.addEventListener('pointerenter', warm, { once: true });
  button.addEventListener('focus', warm, { once: true });

  // Opens the panel (loading it on the first use) and focuses the question field.
  const open = async (): Promise<void> => {
    if (!(await prepare())) {
      window.location.assign(button.href);
      return;
    }
    if (!dialog) return;
    if (!dialog.open) {
      dialog.showModal();
      reportWidth();
    }
    dialog.querySelector<HTMLTextAreaElement>('[data-chat-input]')?.focus();
  };

  button.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    void open();
  });

  // Ctrl+K or Cmd+K, also from text fields. Pressed again while open, it refocuses the question field.
  document.addEventListener('keydown', (event) => {
    if (!shortcutApplies(event, root)) return;
    event.preventDefault();
    if (event.repeat) return;
    const active = document.activeElement;
    if (!dialog?.open && active instanceof HTMLElement && active !== document.body) returnTo = active;
    void open();
  });

  button.setAttribute('aria-keyshortcuts', 'Control+K Meta+K');
  // The key hint shows once the platform is known. CSS hides it on touch-only devices.
  const hint = button.querySelector<HTMLElement>('[data-ask-hint]');
  if (hint) {
    hint.textContent = shortcutLabel({ mac: hint.dataset.mac ?? '', other: hint.dataset.other ?? '' });
    hint.hidden = !hint.textContent;
  }
  // Keep the button clear of the consent banner while it is shown, but never push it out of the
  // viewport: on a short screen (400% zoom) the tall banner would lift it above the top edge, so
  // the offset is capped. The capped button then sits under the banner (z-index 1100 over 1000)
  // and comes back into view when the banner hides.
  const banner = document.querySelector<HTMLElement>('[data-consent]');
  if (banner) {
    const BOTTOM = 20; // the button's own bottom distance in AskPanel.astro
    const MARGIN = 8; // the least space kept above the button
    const place = (): void => {
      const wanted = banner.hidden ? 0 : banner.offsetHeight + 12;
      const room = document.documentElement.clientHeight - BOTTOM - button.offsetHeight - MARGIN;
      const gap = Math.max(0, Math.min(wanted, room));
      root.style.setProperty('--ask-offset', `${gap}px`);
    };
    place();
    new MutationObserver(place).observe(banner, { attributes: true, attributeFilter: ['hidden'] });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(place).observe(banner);
    window.addEventListener('resize', place);
  }
  // The button shows once its place is known, so it never jumps when the consent banner appears.
  reveal();
}
