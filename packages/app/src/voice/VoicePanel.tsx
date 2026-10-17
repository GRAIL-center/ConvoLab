import type { VoiceState } from '@workspace/api/src/voice/contract';
import { Keyboard, Mic, MicOff } from 'lucide-react';
import type { VoiceMode } from './useVoiceMode';

function statusText(state: VoiceState, partnerName: string): string {
  switch (state) {
    case 'connecting':
      return 'Connecting...';
    case 'listening':
      return 'Listening. Go ahead and talk.';
    case 'participant_speaking':
      return 'Listening...';
    case 'partner_thinking':
      return `${partnerName} is thinking...`;
    case 'partner_speaking':
      return `${partnerName} is speaking. Talk any time to interrupt.`;
    case 'muted':
      return `You're muted. ${partnerName} can't hear you.`;
    case 'reconnecting':
      return 'Reconnecting...';
    case 'disconnected':
      return 'Voice is off.';
  }
}

/** Shown before the mic is opened. Must match what actually happens to the audio. */
export const VOICE_DISCLOSURE =
  'Your microphone audio goes to Google Gemini to run the conversation. ConvoLab saves the written transcript, not the audio.';

const quietButton =
  'flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl border border-[#d8d3c8] px-4 text-sm font-medium text-[#4a463f] transition-colors hover:bg-[#eeeae1] disabled:opacity-50 dark:border-[#34312c] dark:text-[#cfcbc2] dark:hover:bg-[#22211d]';
const primaryButton =
  'flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#24221d] px-5 text-sm font-medium text-white transition-colors hover:bg-[#3a362f] dark:bg-[#eeeae1] dark:text-[#151513] dark:hover:bg-white';

/**
 * Replaces the text composer while voice is on. Deliberately plain: the
 * indicators say what is happening and nothing more, so they cannot become a
 * difference between conditions.
 */
export function VoicePanel({
  voice,
  partnerName,
  onClose,
  compact = false,
}: {
  voice: VoiceMode;
  partnerName: string;
  /** Back to typing. */
  onClose: () => void;
  /** Phone layout: tighter, stacked. */
  compact?: boolean;
}) {
  if (!voice.active) {
    // Kept short: on desktop this sits in the fixed-height dock beside the
    // rails. The data-handling disclosure is in the hint line under it there,
    // and inline here on phones (`compact`), where there is no hint line.
    const failed = voice.error;
    return (
      <div
        className={`flex rounded-[22px] border border-[#d8d3c8] bg-[#f6f4ee] p-3 dark:border-[#34312c] dark:bg-[#1b1a17] ${
          compact ? 'flex-col gap-3' : 'items-center gap-3'
        }`}
      >
        <div className="min-w-0 flex-1 px-1">
          <p
            role={failed ? 'alert' : undefined}
            className="text-sm leading-snug text-[#4a463f] dark:text-[#cfcbc2]"
          >
            {failed ? failed.message : `Talk with ${partnerName} out loud.`}
          </p>
          {compact && !failed && (
            <p className="mt-1 text-xs leading-snug text-[#77736b] dark:text-[#8f8a82]">
              {VOICE_DISCLOSURE}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`${quietButton} ${compact ? 'flex-1' : ''}`}
          >
            {failed ? 'Type instead' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={voice.start}
            className={`${primaryButton} ${compact ? 'flex-1' : ''}`}
          >
            <Mic className="h-4 w-4" aria-hidden="true" />
            {failed ? 'Try again' : 'Start talking'}
          </button>
        </div>
      </div>
    );
  }

  const muted = voice.state === 'muted';
  const live = voice.state !== 'connecting' && voice.state !== 'reconnecting';
  return (
    <div className="flex items-center gap-3 rounded-[22px] border border-[#d8d3c8] bg-[#f6f4ee] p-3 dark:border-[#34312c] dark:bg-[#1b1a17]">
      <div className="flex min-w-0 flex-1 items-center gap-3 px-1">
        {/* Input level: a functional check that the mic is picking you up. */}
        <div
          className="flex h-8 w-1.5 shrink-0 flex-col justify-end overflow-hidden rounded-full bg-[#e0ddd4] dark:bg-[#2d2b27]"
          aria-hidden="true"
        >
          <div
            className="w-full rounded-full bg-[#77736b] transition-[height] duration-100 dark:bg-[#aaa59b]"
            style={{ height: `${Math.round((muted ? 0 : voice.level) * 100)}%` }}
          />
        </div>
        <output
          aria-live="polite"
          className="min-w-0 truncate text-sm text-[#4a463f] dark:text-[#cfcbc2]"
        >
          {statusText(voice.state, partnerName)}
        </output>
      </div>
      <button
        type="button"
        onClick={voice.toggleMute}
        disabled={!live}
        aria-pressed={muted}
        className={quietButton}
        aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
      >
        {muted ? (
          <MicOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Mic className="h-4 w-4" aria-hidden="true" />
        )}
        {!compact && (muted ? 'Unmute' : 'Mute')}
      </button>
      <button
        type="button"
        onClick={() => {
          voice.stop();
          onClose();
        }}
        className={quietButton}
        aria-label="Stop voice and type instead"
      >
        <Keyboard className="h-4 w-4" aria-hidden="true" />
        {!compact && 'Type instead'}
      </button>
    </div>
  );
}

/** Mic button that sits beside the send button and opens voice mode. */
export function VoiceStartButton({
  onClick,
  disabled,
  size = 'md',
}: {
  onClick: () => void;
  disabled?: boolean;
  size?: 'md' | 'lg';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Talk instead of typing"
      title="Talk instead of typing"
      className={`flex shrink-0 items-center justify-center rounded-2xl border border-[#d8d3c8] text-[#4a463f] transition-colors hover:bg-[#eeeae1] disabled:opacity-50 dark:border-[#34312c] dark:text-[#cfcbc2] dark:hover:bg-[#22211d] ${
        size === 'lg' ? 'h-12 w-12' : 'h-11 w-11'
      }`}
    >
      <Mic className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
