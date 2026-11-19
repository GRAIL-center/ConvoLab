import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { placeholderCopy } from '../pages/practice/placeholderCopy';

// Opens the phone's own share sheet (#249). In the installed app this is the
// native sheet; on a website that supports it (most phones, some desktops)
// it is the browser's sheet. Elsewhere the link is copied instead.

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

export interface ShareLinkOptions {
  title: string;
  text?: string;
  url: string;
}

// What goes with a shared link: the landing page's own name and approved
// headline, so the share sheet adds no wording of its own. Used for both the
// app link and invitation links.
export const SHARE_MESSAGE = {
  title: 'ConvoLab',
  text: placeholderCopy.heroHeadline,
};

// Show a Share button only where a share sheet will actually open.
export function canShare(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

// Closing the sheet without picking anything is not an error. Browsers report
// it as an AbortError; the native plugin rejects with "Share canceled".
function isCancel(err: unknown): boolean {
  if (err instanceof Error) {
    return err.name === 'AbortError' || /cancel/i.test(err.message);
  }
  return false;
}

export async function shareLink({ title, text, url }: ShareLinkOptions): Promise<ShareResult> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({ title, text, url, dialogTitle: title });
      return 'shared';
    }
    if (typeof navigator.share === 'function') {
      await navigator.share({ title, text, url });
      return 'shared';
    }
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch (err) {
    return isCancel(err) ? 'cancelled' : 'failed';
  }
}
