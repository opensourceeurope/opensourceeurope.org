/*
 * Chat controller. mountChat(root, { endpoint, texts }) looks up these
 * elements INSIDE root. The markup must provide them:
 *
 *   [data-chat-transcript]   container for messages (give it aria-live="polite")
 *   [data-chat-form]         the <form>; submit sends
 *   [data-chat-input]        the <textarea>; Enter sends, Shift+Enter = newline
 *   [data-chat-send]         the submit button. While an answer streams it is a
 *                            stop button (aria-label stop_label, data-state="stop")
 *   [data-chat-status]       optional visually hidden role="status" element for
 *                            short announcements (created when missing)
 *   [data-chat-sharing-text] optional element; shows sharing_on or sharing_off
 *                            to match the consent banner choice
 *   [data-chat-suggestion]   optional buttons; click puts the button's
 *                            data-chat-suggestion value (or its text) in the
 *                            input and focuses it. The follow-up chips under
 *                            the latest answer use the same attribute
 *   [data-chat-empty]        optional element removed on the first message
 *
 * Generated classes: msg, msg--user|assistant, msg__role, msg__bubble,
 * msg__bubble--md, msg__bubble--error, msg__bubble--streaming, msg__note,
 * citations, citations__label, followups (with chat__suggest-label,
 * chat__suggestions and chat__chip inside),
 * citations__row, citation-chip, citation-chip__n, citation-chip__label,
 * loader, loader__bubble, loader__dots, loader__label.
 *
 * Streaming: status events show in the loader bubble; answer text shows as
 * plain text (textContent) in a bubble with aria-busy="true" and is replaced
 * by the rendered Markdown on done. The transcript is not announced token by
 * token: the status element says what happens and "Answer ready" at the end.
 * All text comes from opts.texts. Nothing is persisted. Whether a question is
 * shared follows the consent banner (readConsent), read on every send.
 *
 * Summary: with analytics consent, the turns asked while it was granted are
 * kept until the visitor leaves. summarize() sends them once to the chat
 * function, which logs a summary without personal data. The panel calls it
 * when it closes; the controller calls it when the page is hidden or left.
 * Turns asked without consent are never sent, and a withdrawn consent drops
 * the turns that wait.
 */
import { streamChat, sendSummary, ChatError, type ChatStatus } from './client';
import { renderMarkdown } from './markdown';
import { CONSENT_EVENT, readConsent } from '../consent';
import type { ChatMessage, ChatTexts, Citation } from './types';

const LONG_WAIT_MS = 1400;

function el(tag: string, className?: string, text?: string): HTMLElement {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

function need<T extends Element>(root: HTMLElement, sel: string): T {
  const found = root.querySelector<T>(sel);
  if (!found) throw new Error(`mountChat: missing ${sel}`);
  return found;
}

export function mountChat(
  root: HTMLElement,
  opts: { endpoint: string; texts: ChatTexts },
): { destroy(): void; summarize(): void } {
  const { endpoint, texts } = opts;
  const transcript = need<HTMLElement>(root, '[data-chat-transcript]');
  const form = need<HTMLFormElement>(root, '[data-chat-form]');
  const input = need<HTMLTextAreaElement>(root, '[data-chat-input]');
  const sendBtn = need<HTMLButtonElement>(root, '[data-chat-send]');
  const sharingText = root.querySelector<HTMLElement>('[data-chat-sharing-text]');
  // The hidden spam trap. People never see it, so only a bot fills it in.
  const honeypot = root.querySelector<HTMLInputElement>('[data-chat-honeypot]');
  let statusEl = root.querySelector<HTMLElement>('[data-chat-status]');
  if (!statusEl) {
    statusEl = el('p', 'visually-hidden');
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('data-chat-status', '');
    root.appendChild(statusEl);
  }
  // Says the text once: the same text twice in a row is not announced again.
  const announce = (text: string): void => {
    if (statusEl!.textContent !== text) statusEl!.textContent = text;
  };
  const sendLabel = sendBtn.getAttribute('aria-label') ?? texts.send_label;
  let abortController: AbortController | undefined;

  const conversation: ChatMessage[] = [];
  // Turns asked with analytics consent that are not summarised yet.
  let unsummarised: ChatMessage[] = [];
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cleanups: Array<() => void> = [];

  const listen = <E extends Event>(target: EventTarget, type: string, fn: (e: E) => void): void => {
    target.addEventListener(type, fn as EventListener);
    cleanups.push(() => target.removeEventListener(type, fn as EventListener));
  };

  // True only after "Accept analytics" in the consent banner. Anything else means no.
  const sharing = (): boolean => readConsent() === 'granted';
  const showSharing = (): void => {
    if (sharingText) sharingText.textContent = sharing() ? texts.sharing_on : texts.sharing_off;
    if (!sharing()) unsummarised = [];
  };
  showSharing();
  listen<Event>(document, CONSENT_EVENT, showSharing);

  const summarize = (): void => {
    const turns = unsummarised;
    unsummarised = [];
    if (!turns.length || !sharing()) return;
    sendSummary(endpoint, turns);
  };
  listen<Event>(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') summarize();
  });
  listen<Event>(window, 'pagehide', summarize);

  const scrollToEnd = (): void => {
    transcript.scrollTop = transcript.scrollHeight;
  };
  // Within this many pixels of the end, the view follows new content. A
  // visitor who scrolled up to read is left where they are.
  const NEAR_END_PX = 48;
  const nearEnd = (): boolean => transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight <= NEAR_END_PX;
  const follow = (change: () => void): void => {
    const atEnd = nearEnd();
    change();
    if (atEnd) scrollToEnd();
  };

  const autosize = (): void => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  };

  const citesByNumber = (citations: Citation[]): Record<string, Citation> => {
    const map: Record<string, Citation> = {};
    for (const c of citations) if (c.n != null) map[String(c.n)] = c;
    return map;
  };

  const renderMessage = (role: 'user' | 'assistant', content: string, cites?: Record<string, Citation>): HTMLElement => {
    const wrap = el('div', `msg msg--${role}`);
    wrap.appendChild(el('span', 'msg__role', role === 'user' ? texts.you_label : texts.assistant_label));
    let bubble: HTMLElement;
    if (role === 'assistant') {
      bubble = el('div', 'msg__bubble msg__bubble--md');
      // renderMarkdown escapes all HTML before formatting.
      bubble.innerHTML = renderMarkdown(content, cites ?? {});
    } else {
      bubble = el('div', 'msg__bubble', content);
    }
    wrap.appendChild(bubble);
    // The visitor's own question always scrolls into view; an answer only
    // when the view was at the end.
    if (role === 'user') {
      transcript.appendChild(wrap);
      scrollToEnd();
    } else {
      follow(() => transcript.appendChild(wrap));
    }
    return wrap;
  };

  const renderCitations = (parent: HTMLElement, citations: Citation[]): void => {
    if (!citations.length) return;
    const box = el('div', 'citations');
    box.appendChild(el('span', 'citations__label', texts.sources_label));
    const row = el('div', 'citations__row');
    citations.forEach((c, i) => {
      const chip = el('a', 'citation-chip') as HTMLAnchorElement;
      chip.appendChild(el('span', 'citation-chip__n', String(c.n ?? i + 1)));
      chip.appendChild(el('span', 'citation-chip__label', c.title || c.source_name || c.url));
      if (c.title && c.source_name) chip.title = c.source_name;
      chip.href = c.url;
      chip.target = '_blank';
      chip.rel = 'noopener noreferrer';
      row.appendChild(chip);
    });
    box.appendChild(row);
    follow(() => parent.appendChild(box));
  };

  let followupCount = 0;
  // Only the latest answer has follow-up chips: older ones are removed.
  const clearFollowups = (): void => {
    transcript.querySelectorAll('.followups').forEach((n) => n.remove());
  };
  const renderFollowups = (parent: HTMLElement, followups: string[]): void => {
    clearFollowups();
    if (!followups.length) return;
    const id = `${root.id || 'chat'}-followups-${++followupCount}`;
    const box = el('div', 'followups');
    const label = el('p', 'chat__suggest-label', texts.followups_label);
    label.id = id;
    const list = el('ul', 'chat__suggestions');
    list.setAttribute('aria-labelledby', id);
    for (const q of followups) {
      const item = el('li');
      const chip = el('button', 'chat__chip', q) as HTMLButtonElement;
      chip.type = 'button';
      chip.setAttribute('data-chat-suggestion', q);
      item.appendChild(chip);
      list.appendChild(item);
    }
    box.appendChild(label);
    box.appendChild(list);
    follow(() => parent.appendChild(box));
  };

  const errorText = (err: unknown): string => {
    const code = err instanceof ChatError ? err.code : undefined;
    if (code === 'busy') return texts.error_busy;
    if (code === 'unavailable') return texts.error_unavailable;
    if (code === 'timeout') return texts.error_timeout;
    return texts.error;
  };

  const renderError = (err: unknown): void => {
    const wrap = el('div', 'msg msg--assistant');
    wrap.appendChild(el('span', 'msg__role', texts.assistant_label));
    wrap.appendChild(el('div', 'msg__bubble msg__bubble--error', errorText(err)));
    follow(() => transcript.appendChild(wrap));
  };

  // The loader is hidden from screen readers: the status element says the same.
  const showLoader = (): { done(): void; set(text: string): void; keep(): void } => {
    const loader = el('div', 'loader');
    loader.setAttribute('aria-hidden', 'true');
    const bubble = el('div', 'loader__bubble');
    const dots = el('span', 'loader__dots');
    for (let i = 0; i < 3; i++) dots.appendChild(el('span'));
    const label = el('span', 'loader__label', texts.loading);
    bubble.appendChild(dots);
    bubble.appendChild(label);
    loader.appendChild(bubble);
    follow(() => transcript.appendChild(loader));
    timer = setTimeout(() => {
      label.textContent = texts.loading_long;
    }, LONG_WAIT_MS);
    const stopTimer = (): void => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };
    return {
      done() {
        stopTimer();
        loader.remove();
      },
      set(text: string) {
        stopTimer();
        label.textContent = text;
      },
      // A streamed reply reports its own progress: no long-wait text.
      keep() {
        stopTimer();
      },
    };
  };

  // A function replacement, so "$&" or "$1" in a query stays literal.
  const statusText = (s: ChatStatus): string => {
    if (s.kind === 'writing') return texts.status_writing;
    return s.query ? texts.status_searching.replace('{query}', () => s.query) : texts.status_searching_start;
  };

  // The send button doubles as the stop button while an answer is on its way.
  const setStopMode = (on: boolean): void => {
    sendBtn.setAttribute('aria-label', on ? texts.stop_label : sendLabel);
    if (on) sendBtn.setAttribute('data-state', 'stop');
    else sendBtn.removeAttribute('data-state');
  };

  const send = async (): Promise<void> => {
    if (inFlight) return;
    const question = input.value.trim();
    if (!question) return;
    inFlight = true;

    root.querySelector('[data-chat-empty]')?.remove();
    clearFollowups();
    renderMessage('user', question);
    conversation.push({ role: 'user', content: question });
    input.value = '';
    autosize();
    setStopMode(true);
    announce(texts.loading);
    let loader: ReturnType<typeof showLoader> | undefined = showLoader();
    // The message that shows the streamed text, created on the first piece.
    let streaming: { wrap: HTMLElement; bubble: HTMLElement } | undefined;
    let partial = '';
    const controller = new AbortController();
    abortController = controller;
    // Whether this question went out with analytics consent.
    let sharedTurn = false;

    const dropStreamed = (): void => {
      streaming?.wrap.remove();
      streaming = undefined;
      partial = '';
    };

    try {
      sharedTurn = sharing();
      const reply = await streamChat(endpoint, conversation.slice(), sharedTurn, {
        signal: controller.signal,
        website: honeypot?.value.trim() || undefined,
        onStream: () => loader?.keep(),
        onStatus: (status) => {
          // A new status means the text so far was not the answer.
          dropStreamed();
          loader ??= showLoader();
          loader.set(statusText(status));
          announce(statusText(status));
        },
        onDelta: (text) => {
          if (!streaming) {
            loader?.done();
            loader = undefined;
            const wrap = el('div', 'msg msg--assistant');
            // Hidden from screen readers while it grows: the live region
            // announces the finished answer once, as a new message.
            wrap.setAttribute('aria-hidden', 'true');
            wrap.appendChild(el('span', 'msg__role', texts.assistant_label));
            const bubble = el('div', 'msg__bubble msg__bubble--streaming');
            bubble.setAttribute('aria-busy', 'true');
            wrap.appendChild(bubble);
            follow(() => transcript.appendChild(wrap));
            streaming = { wrap, bubble };
          }
          partial += text;
          // Plain text only while streaming: no Markdown, no links.
          const { bubble } = streaming;
          follow(() => {
            bubble.textContent = partial;
          });
        },
      });
      loader?.done();
      // The streamed text makes way for a new message with the final answer,
      // which the transcript's live region announces once.
      streaming?.wrap.remove();
      streaming = undefined;
      const wrap = renderMessage('assistant', reply.answer, citesByNumber(reply.citations));
      renderCitations(wrap, reply.citations);
      renderFollowups(wrap, reply.followups);
      conversation.push({ role: 'assistant', content: reply.answer });
      if (sharedTurn) unsummarised.push({ role: 'user', content: question }, { role: 'assistant', content: reply.answer });
      announce(texts.status_ready);
    } catch (err) {
      loader?.done();
      if (err instanceof ChatError && err.code === 'aborted') {
        // Stopped by the visitor: keep what arrived, with a short note.
        let wrap = streaming?.wrap;
        if (streaming) {
          streaming.wrap.removeAttribute('aria-hidden');
          streaming.bubble.setAttribute('aria-busy', 'false');
          conversation.push({ role: 'assistant', content: partial });
          if (sharedTurn) unsummarised.push({ role: 'user', content: question }, { role: 'assistant', content: partial });
        } else {
          wrap = el('div', 'msg msg--assistant');
          wrap.appendChild(el('span', 'msg__role', texts.assistant_label));
          transcript.appendChild(wrap);
        }
        const note = el('p', 'msg__note', texts.stopped_note);
        follow(() => wrap!.appendChild(note));
        announce(texts.stopped_note);
      } else {
        dropStreamed();
        announce('');
        if (!(err instanceof ChatError)) console.error(err);
        renderError(err);
      }
    } finally {
      inFlight = false;
      abortController = undefined;
      setStopMode(false);
      sendBtn.disabled = false;
      input.disabled = false;
      input.focus();
    }
  };

  // A click on the button while an answer is on its way stops it.
  listen<MouseEvent>(sendBtn, 'click', (e) => {
    if (!inFlight) return;
    e.preventDefault();
    abortController?.abort();
  });
  listen<Event>(form, 'submit', (e) => {
    e.preventDefault();
    void send();
  });
  listen<KeyboardEvent>(input, 'keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void send();
    }
  });
  listen<Event>(input, 'input', autosize);
  // One listener for the example questions and the follow-up chips, which
  // are added later.
  listen<MouseEvent>(root, 'click', (e) => {
    const btn = (e.target as Element | null)?.closest<HTMLElement>('[data-chat-suggestion]');
    if (!btn || !root.contains(btn)) return;
    input.value = btn.getAttribute('data-chat-suggestion') || btn.textContent || '';
    autosize();
    input.focus();
  });

  return {
    summarize,
    destroy() {
      if (timer) clearTimeout(timer);
      abortController?.abort();
      cleanups.forEach((fn) => fn());
    },
  };
}
