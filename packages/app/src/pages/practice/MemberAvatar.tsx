import { useState } from 'react';
import type { TeamMember } from './placeholderCopy';
import { serif } from './ui';

const SIZES = {
  sm: { box: 'h-9 w-9', text: 'text-[0.85rem]', px: 36 },
  lg: { box: 'h-14 w-14', text: 'text-[1.25rem]', px: 56 },
} as const;

/**
 * A team member's headshot, or their initials when there is no photo.
 *
 * The name is always printed next to the avatar, so the image is decorative
 * (empty alt). If a photo fails to load, the initials come back rather than a
 * broken-image icon.
 */
export function MemberAvatar({ member, size }: { member: TeamMember; size: keyof typeof SIZES }) {
  const [failed, setFailed] = useState(false);
  const s = SIZES[size];

  if (member.photo && !failed) {
    return (
      <img
        src={member.photo}
        alt=""
        width={s.px}
        height={s.px}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${s.box} shrink-0 rounded-full object-cover`}
      />
    );
  }

  return (
    <span
      className={`${serif} flex ${s.box} shrink-0 items-center justify-center rounded-full bg-[#e7ece9] ${s.text} font-medium text-[#3f5c56] dark:bg-[#243330] dark:text-[#b9d4ce]`}
      aria-hidden="true"
    >
      {member.initials}
    </span>
  );
}
