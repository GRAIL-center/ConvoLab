import { describe, expect, it } from 'vitest';
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
});
