/**
 * Progressive enhancement for the contact form (ContactForm.astro). Without
 * JavaScript the form posts urlencoded and the function redirects back to a
 * #form-* state. With it, the form posts JSON with fetch and shows the result
 * in place.
 *
 * The function answers 200 `{ ok: true }` (also for dropped spam), 422
 * `{ ok: false, errors }` keyed by field name, or 502 `{ ok: false }`.
 */

// The field names the function reports errors for, in the order the form shows them.
const FIELDS = ['name', 'email', 'interest', 'interest_other', 'message', 'link'] as const;

// A request still open after this long is aborted and reported as an error,
// so the button never stays busy. setTimeout rather than AbortSignal.timeout,
// so tests can move it forward with Playwright's clock.
const TIMEOUT_MS = 15_000;

export function initContactForm(form: HTMLFormElement) {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const status = form.querySelector<HTMLElement>('[data-status]')!;
  const ts = form.querySelector<HTMLInputElement>('input[name="ts"]')!;
  const otherRadio = form.querySelector<HTMLInputElement>('input[name="interest"][data-other]');
  const otherField = form.querySelector<HTMLElement>('[data-other-field]');
  const otherInput = form.querySelector<HTMLInputElement>('input[name="interest_other"]');
  const messages = { sent: form.dataset.msgSent!, invalid: form.dataset.msgInvalid!, error: form.dataset.msgError! };

  ts.value = String(Date.now());

  const syncOther = () => {
    if (!otherRadio || !otherField || !otherInput) return;
    const shown = otherRadio.checked;
    otherField.hidden = !shown;
    otherInput.required = shown;
  };
  syncOther();
  form.addEventListener('change', (event) => {
    if ((event.target as HTMLInputElement).name === 'interest') syncOther();
  });

  const errorFor = (field: string) => form.querySelector<HTMLElement>(`#${field}-error`);
  // The interest error belongs to the group: focus goes to its checked radio.
  const controlFor = (field: string) =>
    field === 'interest'
      ? (form.querySelector<HTMLInputElement>('input[name="interest"]:checked') ??
        form.querySelector<HTMLInputElement>('input[name="interest"]'))
      : form.querySelector<HTMLElement>(`[name="${field}"]`);
  const invalidTarget = (field: string) => (field === 'interest' ? form.querySelector('fieldset') : controlFor(field));

  const clearErrors = () => {
    for (const field of FIELDS) {
      const error = errorFor(field);
      if (error) {
        error.textContent = '';
        error.hidden = true;
      }
      invalidTarget(field)?.removeAttribute('aria-invalid');
    }
  };

  const showErrors = (errors: Record<string, string>) => {
    let first: HTMLElement | null = null;
    for (const field of FIELDS) {
      const text = errors[field];
      const error = errorFor(field);
      if (!text || !error) continue;
      error.textContent = text;
      error.hidden = false;
      invalidTarget(field)?.setAttribute('aria-invalid', 'true');
      first ??= controlFor(field);
    }
    first?.focus();
  };

  const announce = (text: string) => {
    // Clearing first makes a repeated message count as a change for screen readers.
    status.textContent = '';
    requestAnimationFrame(() => (status.textContent = text));
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;

    clearErrors();
    status.textContent = '';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');

    const data: Record<string, string> = {};
    for (const [key, value] of new FormData(form)) if (typeof value === 'string') data[key] = value;

    let outcome: 'sent' | 'invalid' | 'error' = 'error';
    let errors: Record<string, string> = {};
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; errors?: Record<string, string> };
      if (res.ok && body.ok) outcome = 'sent';
      else if (res.status === 422 && body.errors) {
        outcome = 'invalid';
        errors = body.errors;
      }
    } catch {
      // A network failure, a blocked request or the timeout: reported as an error below.
    } finally {
      clearTimeout(timer);
    }

    button.disabled = false;
    button.removeAttribute('aria-busy');

    if (outcome === 'sent') {
      form.reset();
      ts.value = String(Date.now());
      syncOther();
    } else if (outcome === 'invalid') {
      showErrors(errors);
    }
    announce(messages[outcome]);
  });
}
