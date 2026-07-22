// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/** ui.ts — small DOM helpers: element builder, modal sheet, toast, number tween. */

type Attrs = Record<string, string | number | boolean | ((e: Event) => void)>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (v === true) node.setAttribute(k, '');
    else if (v === false || v == null) {
      /* skip */
    } else node.setAttribute(k, String(v));
  }
  for (const c of children) node.append(c);
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A centred modal sheet. Returns a close() fn. Uses `hidden` correctly. */
export function openSheet(content: (close: () => void) => Node): () => void {
  const overlay = el('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' });
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  const sheet = el('div', { class: 'sheet' });
  sheet.append(content(close));
  overlay.append(sheet);
  document.body.append(overlay);
  return close;
}

let toastTimer = 0;
export function toast(msg: string): void {
  let t = document.querySelector<HTMLDivElement>('.toast');
  if (!t) {
    t = el('div', { class: 'toast' });
    document.body.append(t);
  }
  t.textContent = msg;
  requestAnimationFrame(() => t!.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t!.classList.remove('show'), 2200);
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** Tween an element's text from one integer to another. */
export function tweenNumber(node: HTMLElement, from: number, to: number, dur = 600): void {
  if (reduced() || dur <= 0) {
    node.textContent = fmt(to);
    return;
  }
  const start = performance.now();
  const step = (t: number) => {
    const p = Math.min(1, (t - start) / dur);
    const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
    node.textContent = fmt(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step);
    else node.textContent = fmt(to);
  };
  requestAnimationFrame(step);
}

/** Try native share, fall back to clipboard, then to a prompt. */
export async function shareOrCopy(title: string, text: string, url: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return 'shared';
    }
  } catch {
    /* user cancelled or unsupported — fall through to copy */
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`.trim());
    return 'copied';
  } catch {
    try {
      window.prompt('Copy this link:', url);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
}
