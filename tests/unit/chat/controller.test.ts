// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_EVENT } from '../../../src/scripts/consent';
import { mountChat } from '../../../src/scripts/chat/controller';
import type { ChatTexts } from '../../../src/scripts/chat/types';
import { controlledStream, frame } from './sse-helpers';

const texts: ChatTexts = {
  title: 't', intro: 'i', placeholder: 'p', input_label: 'il', send_label: 's', suggestions_label: 'sl',
  suggestions: [], sharing_on: 'Shared', sharing_off: 'Not shared', sharing_settings: 'Change', small_model_note_short: 'ns',
  memory_note: 'm', sources_label: 'Sources', you_label: 'You', assistant_label: 'OSE', loading: 'Loading',
  loading_long: 'Still', error: 'Something failed',
  status_searching_start: 'Searching the docs…', status_searching: 'Searching: {query}…', status_writing: 'Writing…', status_ready: 'Answer ready',
  stop_label: 'Stop', stopped_note: 'Stopped.', followups_label: 'Ask next',
  error_busy: 'Busy now', error_unavailable: 'Down now', error_timeout: 'Too slow', shortcut_mac: '⌘K', shortcut_other: 'Ctrl K', no_js: 'nj', open_label: 'op', close_label: 'cl', resize_label: 'rs',
  how_it_works: { label: 'h', href: '/h/' },
};

function setup(fetchImpl: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  document.body.innerHTML = `<div id="root">
    <div data-chat-transcript></div>
    <form data-chat-form><textarea data-chat-input></textarea>
    <button data-chat-send>Send</button></form>
    <p><span data-chat-sharing-text></span></p></div>`;
  const root = document.getElementById('root') as HTMLElement;
  const handle = mountChat(root, { endpoint: 'https://f.example/chat', texts });
  const input = root.querySelector('[data-chat-input]') as HTMLTextAreaElement;
  const form = root.querySelector('[data-chat-form]') as HTMLFormElement;
  const submit = (): void => {
    input.value = 'question';
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  };
  return { root, handle, input, submit };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('mountChat', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends once while a request is in flight', async () => {
    let resolve!: (r: Response) => void;
    const { submit, handle } = setup(() => new Promise<Response>((r) => (resolve = r)));
    submit();
    submit();
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    resolve(new Response(JSON.stringify({ answer: 'ok', citations: [] })));
    await flush();
    handle.destroy();
  });

  it.each([
    [429, 'busy', 'Busy now'],
    [503, 'unavailable', 'Down now'],
    [504, 'timeout', 'Too slow'],
    [500, 'error', 'Something failed'],
  ])('shows the text for a %i %s error', async (status, code, text) => {
    const { root, submit, handle } = setup(async () => new Response(JSON.stringify({ error: code }), { status }));
    submit();
    await flush();
    await flush();
    expect(root.querySelector('[data-chat-transcript]')?.textContent).toContain(text);
    handle.destroy();
  });

  it('shows the error text and re-enables the input on failure', async () => {
    const { root, input, submit, handle } = setup(() => Promise.reject(new TypeError('down')));
    submit();
    await flush();
    expect(root.querySelector('[data-chat-transcript]')?.textContent).toContain(texts.error);
    expect(input.disabled).toBe(false);
    handle.destroy();
  });

  it('keeps the conversation in memory only', async () => {
    const { root, submit, handle } = setup(async () =>
      new Response(JSON.stringify({ answer: 'Hello', citations: [{ n: 1, url: 'https://a.example/', title: 'A' }] })),
    );
    submit();
    await flush();
    expect(root.querySelector('[data-chat-transcript]')?.textContent).toContain('Hello');
    expect(root.querySelector('a.citation-chip')?.getAttribute('target')).toBe('_blank');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    handle.destroy();
  });
  it('counts an explicit Accept on this page view when localStorage throws', async () => {
    vi.resetModules();
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      const consent = await import('../../../src/scripts/consent');
      expect(consent.readConsent()).toBeNull();
      consent.writeConsent('granted');
      expect(consent.readConsent()).toBe('granted');
      consent.writeConsent('denied');
      expect(consent.readConsent()).toBe('denied');
    } finally {
      spy.mockRestore();
      setSpy.mockRestore();
      vi.resetModules();
    }
  });

  describe('sharing follows the consent banner', () => {
    const okResponse = async () => new Response(JSON.stringify({ answer: 'ok', citations: [] }));
    const sentOptIn = (): unknown => {
      const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
      return JSON.parse(call[1].body as string).analyticsOptIn;
    };
    const send = async (stored: string | null): Promise<unknown> => {
      if (stored !== null) localStorage.setItem('ose-consent', stored);
      const { submit, handle } = setup(okResponse);
      submit();
      await flush();
      handle.destroy();
      return sentOptIn();
    };

    it('sends true only when analytics is granted', async () => {
      expect(await send('{"v":1,"analytics":"granted"}')).toBe(true);
    });
    it('sends false when analytics is denied', async () => {
      expect(await send('{"v":1,"analytics":"denied"}')).toBe(false);
    });
    it('sends false without a stored choice', async () => {
      expect(await send(null)).toBe(false);
    });
    it('sends false for malformed values', async () => {
      expect(await send('{not json')).toBe(false);
    });
    it('sends false for an unknown version or value', async () => {
      expect(await send('{"v":2,"analytics":"granted"}')).toBe(false);
      localStorage.clear();
      vi.unstubAllGlobals();
      expect(await send('{"v":1,"analytics":"yes"}')).toBe(false);
    });
    it('sends false when localStorage throws', async () => {
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      try {
        expect(await send(null)).toBe(false);
      } finally {
        spy.mockRestore();
      }
    });

    it('shows the status line for the choice at mount and after a change', () => {
      const { root, handle } = setup(okResponse);
      const line = root.querySelector('[data-chat-sharing-text]') as HTMLElement;
      expect(line.textContent).toBe(texts.sharing_off);
      localStorage.setItem('ose-consent', '{"v":1,"analytics":"granted"}');
      document.dispatchEvent(new CustomEvent(CONSENT_EVENT));
      expect(line.textContent).toBe(texts.sharing_on);
      localStorage.setItem('ose-consent', '{"v":1,"analytics":"denied"}');
      document.dispatchEvent(new CustomEvent(CONSENT_EVENT));
      expect(line.textContent).toBe(texts.sharing_off);
      handle.destroy();
    });
    it('shows sharing_on at mount when analytics was already granted', () => {
      localStorage.setItem('ose-consent', '{"v":1,"analytics":"granted"}');
      const { root, handle } = setup(okResponse);
      expect(root.querySelector('[data-chat-sharing-text]')?.textContent).toBe(texts.sharing_on);
      handle.destroy();
    });
    it('stops listening after destroy', () => {
      const { root, handle } = setup(okResponse);
      handle.destroy();
      localStorage.setItem('ose-consent', '{"v":1,"analytics":"granted"}');
      document.dispatchEvent(new CustomEvent(CONSENT_EVENT));
      expect(root.querySelector('[data-chat-sharing-text]')?.textContent).toBe(texts.sharing_off);
    });
    it('writes nothing to storage', async () => {
      const set = vi.spyOn(Storage.prototype, 'setItem');
      localStorage.setItem('ose-consent', '{"v":1,"analytics":"granted"}');
      set.mockClear();
      await send(null);
      expect(set).not.toHaveBeenCalled();
      set.mockRestore();
    });
  });

  describe('streaming', () => {
    const streamSetup = () => {
      const s = controlledStream();
      const ctx = setup(async () => s.response);
      // Abort errors the body, as a real fetch does.
      (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (_u: string, init: RequestInit) => {
        init.signal?.addEventListener('abort', () => s.fail(new DOMException('aborted', 'AbortError')));
        return s.response;
      });
      const status = () => ctx.root.querySelector('[data-chat-status]')?.textContent;
      const transcript = ctx.root.querySelector('[data-chat-transcript]') as HTMLElement;
      const button = ctx.root.querySelector('[data-chat-send]') as HTMLButtonElement;
      return { ...ctx, s, status, transcript, button };
    };

    it('shows plain text while streaming and the rendered Markdown on done', async () => {
      const t = streamSetup();
      t.submit();
      await flush();
      t.s.write(frame('status', { kind: 'writing' }) + frame('delta', { text: 'A **bold** [link](https://a.example/) [1]' }));
      await flush();
      const bubble = t.transcript.querySelector('.msg__bubble--streaming') as HTMLElement;
      expect(bubble.textContent).toBe('A **bold** [link](https://a.example/) [1]');
      expect(bubble.querySelector('a, strong')).toBeNull();
      expect(bubble.getAttribute('aria-busy')).toBe('true');
      // The growing text is hidden from screen readers.
      expect(bubble.closest('.msg')?.getAttribute('aria-hidden')).toBe('true');
      t.s.write(frame('done', { answer: 'A **bold** answer [1]', citations: [{ n: 1, url: 'https://a.example/', title: 'A' }], unanswered: false }));
      await flush();
      await flush();
      const md = t.transcript.querySelector('.msg__bubble--md') as HTMLElement;
      // A fresh message replaces the streamed one, so the live region announces it once.
      expect(md).not.toBe(bubble);
      expect(bubble.isConnected).toBe(false);
      expect(md.closest('.msg')?.hasAttribute('aria-hidden')).toBe(false);
      expect(md.querySelector('strong')?.textContent).toBe('bold');
      expect(t.transcript.querySelector('a.citation-chip')).not.toBeNull();
      expect(t.transcript.querySelectorAll('.msg--assistant')).toHaveLength(1);
      t.handle.destroy();
    });

    it('updates the status element and says the answer is ready', async () => {
      const t = streamSetup();
      t.submit();
      await flush();
      expect(t.status()).toBe('Loading');
      t.s.write(frame('status', { kind: 'searching' }));
      await flush();
      expect(t.status()).toBe('Searching the docs…');
      expect(t.transcript.querySelector('.loader__label')?.textContent).toBe('Searching the docs…');
      t.s.write(frame('status', { kind: 'searching', query: 'fees' }));
      await flush();
      expect(t.status()).toBe('Searching: fees…');
      expect(t.transcript.querySelector('.loader__label')?.textContent).toBe('Searching: fees…');
      expect(t.transcript.querySelector('.loader')?.getAttribute('aria-hidden')).toBe('true');
      t.s.write(frame('status', { kind: 'writing' }));
      await flush();
      expect(t.status()).toBe('Writing…');
      t.s.write(frame('done', { answer: 'Done.', citations: [] }));
      await flush();
      await flush();
      expect(t.status()).toBe('Answer ready');
      expect(t.root.querySelector('[data-chat-transcript] [role="status"]')).toBeNull();
      t.handle.destroy();
    });

    it('drops streamed text when a new status follows it', async () => {
      const t = streamSetup();
      t.submit();
      await flush();
      t.s.write(frame('delta', { text: 'Let me check.' }));
      await flush();
      t.s.write(frame('status', { kind: 'searching', query: 'more' }));
      await flush();
      expect(t.transcript.textContent).not.toContain('Let me check.');
      expect(t.transcript.querySelector('.loader')).not.toBeNull();
      t.handle.destroy();
    });

    it('turns the send button into a stop button that keeps the partial text', async () => {
      const t = streamSetup();
      t.submit();
      await flush();
      expect(t.button.getAttribute('aria-label')).toBe('Stop');
      expect(t.button.disabled).toBe(false);
      t.s.write(frame('delta', { text: 'Partial ans' }));
      await flush();
      t.button.click();
      await flush();
      await flush();
      const bubble = t.transcript.querySelector('.msg--assistant .msg__bubble') as HTMLElement;
      expect(bubble.textContent).toBe('Partial ans');
      expect(bubble.getAttribute('aria-busy')).toBe('false');
      expect(bubble.closest('.msg')?.hasAttribute('aria-hidden')).toBe(false);
      expect(t.transcript.querySelector('.msg__note')?.textContent).toBe('Stopped.');
      expect(t.transcript.textContent).not.toContain('Something failed');
      expect(t.button.getAttribute('aria-label')).toBe('s');
      expect(t.button.hasAttribute('data-state')).toBe(false);
      t.handle.destroy();
    });

    it('sends a second question after Stop, with the partial answer in the history', async () => {
      const t = streamSetup();
      t.submit();
      await flush();
      t.s.write(frame('delta', { text: 'Partial' }));
      await flush();
      t.button.click();
      await flush();
      await flush();
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockImplementation(async () => new Response(JSON.stringify({ answer: 'Second answer.', citations: [] })));
      t.submit();
      await flush();
      await flush();
      expect(fetchMock.mock.calls.length).toBe(2);
      const body = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
      expect(body.messages.map((m: { role: string; content: string }) => `${m.role}:${m.content}`)).toEqual([
        'user:question',
        'assistant:Partial',
        'user:question',
      ]);
      expect(t.transcript.textContent).toContain('Second answer.');
      expect(t.button.getAttribute('aria-label')).toBe('s');
      t.handle.destroy();
    });

    it('does not announce the same status text twice', async () => {
      const t = streamSetup();
      const statusEl = t.root.querySelector('[data-chat-status]') as HTMLElement;
      t.submit();
      await flush();
      const seen: string[] = [];
      new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach((n) => seen.push(n.textContent ?? '')))).observe(statusEl, { childList: true });
      t.s.write(frame('status', { kind: 'writing' }));
      await flush();
      t.s.write(frame('status', { kind: 'writing' }));
      await flush();
      expect(seen).toEqual(['Writing…']);
      t.handle.destroy();
    });

    it('follows the stream only when the view is at the end', async () => {
      const t = streamSetup();
      let top = 0;
      Object.defineProperty(t.transcript, 'scrollHeight', { configurable: true, get: () => 1000 });
      Object.defineProperty(t.transcript, 'clientHeight', { configurable: true, get: () => 200 });
      Object.defineProperty(t.transcript, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => (top = v) });
      t.submit();
      await flush();
      expect(top).toBe(1000); // the visitor's question always scrolls into view
      t.s.write(frame('delta', { text: 'One' }));
      await flush();
      expect(top).toBe(1000); // at the end: follows
      top = 100; // the visitor scrolls up to read
      t.s.write(frame('delta', { text: ' two' }));
      await flush();
      expect(top).toBe(100);
      t.handle.destroy();
    });

    it('keeps a literal $& in the query', async () => {
      const t = streamSetup();
      t.submit();
      await flush();
      t.s.write(frame('status', { kind: 'searching', query: 'fees $& more' }));
      await flush();
      expect(t.status()).toBe('Searching: fees $& more…');
      t.handle.destroy();
    });
  });

  it('shows follow-up chips only under the latest answer, and a click fills the input', async () => {
    const replies = [
      { answer: 'First.', citations: [], followups: ['How do I join?', 'What are the fees?'] },
      { answer: 'Second.', citations: [], followups: ['Who runs OSE?'] },
    ];
    const { root, input, submit, handle } = setup(async () => new Response(JSON.stringify(replies.shift())));
    submit();
    await flush();
    await flush();
    let chips = root.querySelectorAll<HTMLButtonElement>('.followups [data-chat-suggestion]');
    expect([...chips].map((c) => c.textContent)).toEqual(['How do I join?', 'What are the fees?']);
    const label = root.querySelector('.followups .chat__suggest-label') as HTMLElement;
    expect(label.textContent).toBe('Ask next');
    expect(root.querySelector('.followups ul')?.getAttribute('aria-labelledby')).toBe(label.id);
    chips[1].click();
    expect(input.value).toBe('What are the fees?');
    expect(document.activeElement).toBe(input);
    submit();
    await flush();
    await flush();
    chips = root.querySelectorAll<HTMLButtonElement>('.followups [data-chat-suggestion]');
    expect(root.querySelectorAll('.followups')).toHaveLength(1);
    expect([...chips].map((c) => c.textContent)).toEqual(['Who runs OSE?']);
    expect(chips[0].closest('.msg')?.textContent).toContain('Second.');
    handle.destroy();
  });

  it('shows no follow-up block without follow-ups', async () => {
    const { root, submit, handle } = setup(async () => new Response(JSON.stringify({ answer: 'A.', citations: [], followups: [] })));
    submit();
    await flush();
    await flush();
    expect(root.querySelector('.followups')).toBeNull();
    handle.destroy();
  });
});
