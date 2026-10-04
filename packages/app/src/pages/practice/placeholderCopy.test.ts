import { describe, expect, it } from 'vitest';
import { bioPlainText } from './bioText';
import { placeholderCopy } from './placeholderCopy';

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
  return out;
}

// Built from parts so a repo-wide grep for the marker stays empty.
const MARKER = ['PLACE', 'HOLDER'].join('');

describe('placeholderCopy', () => {
  const strings = collectStrings(placeholderCopy);

  it('has strings to check', () => {
    expect(strings.length).toBeGreaterThan(0);
  });

  it('contains no placeholder text', () => {
    expect(strings.filter((s) => s.includes(MARKER))).toEqual([]);
  });

  it('contains no em or en dashes', () => {
    expect(strings.filter((s) => /[–—]/.test(s))).toEqual([]);
  });

  it('uses a fas.harvard.edu contact email', () => {
    expect(placeholderCopy.contactEmail.endsWith('@fas.harvard.edu')).toBe(true);
  });

  it('lists ten team members with initials, name and role', () => {
    expect(placeholderCopy.team).toHaveLength(10);
    for (const member of placeholderCopy.team) {
      expect(member.initials).toMatch(/^[A-Z]{2}$/);
      expect(member.name.trim()).not.toBe('');
      expect(member.role.trim()).not.toBe('');
    }
  });

  it('keeps any team bio to 80 words and any bio link to https', () => {
    for (const member of placeholderCopy.team) {
      if (member.bio !== undefined) {
        const words = bioPlainText(member.bio).trim().split(/\s+/).filter(Boolean);
        expect(words.length, member.name).toBeGreaterThan(0);
        expect(words.length, member.name).toBeLessThanOrEqual(80);
      }
      // Every markdown-style link inside a bio must be a well-formed https link;
      // anything else would render as visible brackets on the live page.
      for (const target of (member.bio ?? '').matchAll(/\]\(([^)]*)\)/g)) {
        expect(target[1], member.name).toMatch(/^https:\/\/\S+$/);
      }
      if (member.link) {
        expect(member.link.url, member.name).toMatch(/^https:\/\//);
        expect(member.link.label.trim(), member.name).not.toBe('');
      }
    }
  });

  it('renders bio links in place and leaves non-https links as text', async () => {
    const { renderBio } = await import('./bioText');
    const parts = renderBio('founder of [a](https://a.example) and [b](http://b.example).', 'x');
    const anchors = parts.filter((p) => typeof p === 'object');
    expect(anchors).toHaveLength(1);
    expect(parts.join('')).toContain('[b](http://b.example)');
    expect(bioPlainText('founder of [renable.com](https://renable.com).')).toBe(
      'founder of renable.com.'
    );
  });
});
