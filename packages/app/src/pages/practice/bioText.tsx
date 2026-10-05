import type { ReactNode } from 'react';

/** `[label](https://...)` inside a bio. Anything else is left as plain text. */
const LINK = /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g;

/**
 * Bios are plain strings so they can be pasted in as written. A person who
 * names their own projects ("founder of renable.com and verke.co") can have
 * those names linked in place with markdown-style links. Only https targets
 * become links; a non-https or malformed link stays visible as text, so a typo
 * shows up on the page instead of silently becoming a dead or unsafe anchor.
 */
export function renderBio(text: string, linkClassName: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const [whole, label, url] = match;
    const at = match.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    parts.push(
      <a
        key={`${at}-${url}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
      >
        {label}
      </a>
    );
    last = at + whole.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** The bio as a reader sees it, links reduced to their labels. Used for word counts. */
export function bioPlainText(text: string): string {
  return text.replace(LINK, '$1');
}
