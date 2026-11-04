export const CONSENT_KEY = 'ose-consent';

export type Consent = 'granted' | 'denied';

/** Fired on `document` after every stored choice, so other scripts on the page can follow it. */
export const CONSENT_EVENT = 'ose-consent-change';

// Used when localStorage is missing or throws (private mode, blocked site data).
// Set only by an explicit choice on this page view. It is the only case where
// blocked storage can read as 'granted'.
let memory: Consent | null = null;

export function readConsent(): Consent | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (raw) {
      const data = JSON.parse(raw) as { v?: number; analytics?: string };
      if (data.v === 1 && (data.analytics === 'granted' || data.analytics === 'denied')) return data.analytics;
    }
  } catch {
    // fall through to the in-memory value
  }
  return memory;
}

export function writeConsent(value: Consent): void {
  memory = value;
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: 1, analytics: value }));
  } catch {
    // the choice lives in memory until the page unloads
  }
  document.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
}

let injected = false;

/** Adds the analytics script once. Does nothing without a script or without consent. */
function injectAnalytics(src: string | undefined): void {
  if (!src || injected || readConsent() !== 'granted') return;
  injected = true;
  const el = document.createElement('script');
  el.src = src;
  el.async = true;
  document.head.append(el);
}

/** Wires the banner: shows it without a stored choice, handles the buttons, the settings view and `[data-consent-open]`. */
export function initConsent(): void {
  const banner = document.querySelector<HTMLElement>('[data-consent]');
  if (!banner) return;
  const analyticsSrc = banner.dataset.analyticsSrc || undefined;
  const main = banner.querySelector<HTMLElement>('[data-consent-main]')!;
  const settings = banner.querySelector<HTMLElement>('[data-consent-settings]')!;
  const toggle = banner.querySelector<HTMLInputElement>('[data-consent-toggle]')!;
  let returnTo: HTMLElement | null = null;

  const view = (name: 'main' | 'settings') => {
    main.hidden = name !== 'main';
    settings.hidden = name !== 'settings';
    if (name === 'settings') toggle.checked = readConsent() === 'granted';
  };
  const focusFirst = () => {
    const target = banner.querySelector<HTMLElement>('[data-consent-main]:not([hidden]) button, [data-consent-settings]:not([hidden]) input:not(:disabled), [data-consent-settings]:not([hidden]) button');
    target?.focus();
  };
  const open = (fromUser: boolean) => {
    if (fromUser) returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    view('main');
    banner.hidden = false;
    if (fromUser) focusFirst();
  };
  const close = () => {
    const hadFocus = banner.contains(document.activeElement);
    banner.hidden = true;
    if (hadFocus && returnTo?.isConnected && returnTo !== document.body) returnTo.focus();
    returnTo = null;
  };
  const choose = (value: Consent) => {
    writeConsent(value);
    injectAnalytics(analyticsSrc);
    close();
  };

  banner.querySelector('[data-consent-accept]')!.addEventListener('click', () => choose('granted'));
  banner.querySelector('[data-consent-reject]')!.addEventListener('click', () => choose('denied'));
  banner.querySelector('[data-consent-manage]')!.addEventListener('click', () => {
    view('settings');
    focusFirst();
  });
  banner.querySelector('[data-consent-save]')!.addEventListener('click', () => choose(toggle.checked ? 'granted' : 'denied'));
  banner.querySelectorAll('[data-consent-close]').forEach((el) => el.addEventListener('click', close));
  banner.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  document.addEventListener('click', (event) => {
    if ((event.target as Element | null)?.closest('[data-consent-open]')) open(true);
  });

  if (readConsent() === null) open(false);
  else injectAnalytics(analyticsSrc);
}
