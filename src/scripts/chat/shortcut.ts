/*
 * The keyboard shortcut for the chat: Ctrl+K or Cmd+K. A modifier shortcut types no
 * character, so it is allowed in text fields and meets WCAG 2.1.4. Shared by the Ask
 * panel (every page) and the /ask/ page script.
 */

interface PlatformSource {
  userAgentData?: { platform?: string };
  platform?: string;
}

/** True on macOS and iOS-like platforms, from `userAgentData.platform` or else `platform`. */
export function isApplePlatform(nav: PlatformSource = navigator): boolean {
  const name = nav.userAgentData?.platform || nav.platform || '';
  return /mac|iphone|ipad|ipod/i.test(name);
}

/** The hint text for the visitor's platform. */
export function shortcutLabel(texts: { mac: string; other: string }, nav?: PlatformSource): string {
  return isApplePlatform(nav) ? texts.mac : texts.other;
}

type KeyEvent = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'defaultPrevented'> &
  Partial<Pick<KeyboardEvent, 'code' | 'isComposing' | 'keyCode' | 'repeat'>>;

/** The K key: by `key` when it is an ASCII letter, else (non-Latin layouts) by its physical `code`. */
function isK(event: KeyEvent): boolean {
  return /^[a-z]$/i.test(event.key) ? event.key.toLowerCase() === 'k' : event.code === 'KeyK';
}

/** True for Ctrl+K or Meta+K with no Alt or Shift, on an event nobody has handled yet, outside IME composition. */
export function isShortcutKey(event: KeyEvent): boolean {
  return (
    !event.defaultPrevented &&
    !event.isComposing &&
    event.keyCode !== 229 &&
    isK(event) &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

/** Whether a dialog is modal. `:modal` throws in older browsers, so those fall back to "open". */
function isModal(d: HTMLDialogElement): boolean {
  if (!d.open) return false;
  try {
    return d.matches(':modal');
  } catch {
    return true;
  }
}

/**
 * True when the shortcut may act: the key matches, no modal dialog is open (our own panel
 * excepted) and the privacy settings banner is not showing.
 */
export function shortcutApplies(event: KeyEvent, ownDialogRoot?: Element | null): boolean {
  if (!isShortcutKey(event)) return false;
  if (document.querySelector('[data-consent]:not([hidden])')) return false;
  for (const d of document.querySelectorAll('dialog')) {
    if (isModal(d) && !ownDialogRoot?.contains(d)) return false;
  }
  return true;
}
