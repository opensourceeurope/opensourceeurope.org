/**
 * Copy buttons on code snippets. A button carries `data-copy-button`, and
 * its snippet is the element named by `data-copy-target` (an id). The label
 * inside `[data-copy-label]` switches to the "Copied" text for two seconds.
 */
const RESET_MS = 2000;

export function initCopyButtons(root: ParentNode = document): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-copy-button]')) {
    const label = button.querySelector<HTMLElement>('[data-copy-label]');
    const status = button.parentElement?.querySelector<HTMLElement>('[data-copy-status]');
    const target = document.getElementById(button.dataset.copyTarget ?? '');
    if (!label || !target) continue;
    const idle = label.textContent ?? '';
    const done = button.dataset.copiedLabel ?? idle;
    let timer: ReturnType<typeof setTimeout> | undefined;

    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(target.textContent ?? '');
      } catch {
        return;
      }
      label.textContent = done;
      if (status) status.textContent = done;
      clearTimeout(timer);
      timer = setTimeout(() => {
        label.textContent = idle;
        if (status) status.textContent = '';
      }, RESET_MS);
    });
  }
}
