import { describe, expect, it } from 'vitest';
import { isApplePlatform, isShortcutKey, shortcutLabel } from '../../../src/scripts/chat/shortcut';

const texts = { mac: '⌘K', other: 'Ctrl K' };

describe('shortcutLabel', () => {
  it('uses the Mac label on macOS', () => {
    expect(shortcutLabel(texts, { platform: 'MacIntel' })).toBe('⌘K');
    expect(shortcutLabel(texts, { userAgentData: { platform: 'macOS' }, platform: 'x' })).toBe('⌘K');
  });
  it('uses the other label elsewhere', () => {
    expect(shortcutLabel(texts, { platform: 'Win32' })).toBe('Ctrl K');
    expect(shortcutLabel(texts, { userAgentData: { platform: 'Linux' } })).toBe('Ctrl K');
    expect(isApplePlatform({})).toBe(false);
  });
});

describe('isShortcutKey', () => {
  const ev = (o: object) => ({ key: 'k', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, defaultPrevented: false, ...o });
  it('accepts Ctrl+K and Meta+K', () => {
    expect(isShortcutKey(ev({ ctrlKey: true }))).toBe(true);
    expect(isShortcutKey(ev({ metaKey: true, key: 'K' }))).toBe(true);
  });
  it('ignores IME composition', () => {
    expect(isShortcutKey(ev({ ctrlKey: true, isComposing: true }))).toBe(false);
    expect(isShortcutKey(ev({ ctrlKey: true, keyCode: 229 }))).toBe(false);
  });
  it('handles non-Latin and remapped layouts', () => {
    expect(isShortcutKey(ev({ ctrlKey: true, key: 'л', code: 'KeyK' }))).toBe(true);
    expect(isShortcutKey(ev({ ctrlKey: true, key: 't', code: 'KeyK' }))).toBe(false);
    expect(isShortcutKey(ev({ ctrlKey: true, key: 'k', code: 'KeyV' }))).toBe(true);
  });
  it('rejects other combinations', () => {
    expect(isShortcutKey(ev({}))).toBe(false);
    expect(isShortcutKey(ev({ ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isShortcutKey(ev({ ctrlKey: true, altKey: true }))).toBe(false);
    expect(isShortcutKey(ev({ ctrlKey: true, defaultPrevented: true }))).toBe(false);
    expect(isShortcutKey(ev({ ctrlKey: true, key: 'j' }))).toBe(false);
  });
});
