import type { CSSProperties } from 'react';

const LAPP_SCORES = [
  ['Listen', 4],
  ['Acknowledge', 5],
  ['Pivot', 3],
  ['Perspective', 4],
] as const;

/**
 * Coded phone frame showing a sample ConvoLab exchange. All conversation text
 * is illustrative placeholder content, not a real transcript.
 */
export function PhoneMockup({ style }: { style?: CSSProperties }) {
  return (
    <div
      className="relative w-[280px] rounded-[46px] bg-[#1c1b18] p-[10px] shadow-[0_40px_80px_-30px_rgba(23,22,20,0.55),0_18px_36px_-18px_rgba(23,22,20,0.35)] will-change-transform sm:w-[300px] dark:bg-[#2a2824] dark:shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)]"
      style={style}
      aria-hidden="true"
    >
      <div className="relative flex h-[560px] flex-col overflow-hidden rounded-[37px] bg-[#fbf9f4] sm:h-[600px] dark:bg-[#15140f]">
        <div className="flex items-center justify-between px-7 pt-3.5 text-[11px] font-semibold text-[#1a1916] dark:text-[#f2efe7]">
          <span>9:41</span>
          <span className="h-[26px] w-[92px] rounded-full bg-[#1c1b18] dark:bg-black" />
          <span className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-[2px] border border-current" />
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2.5 border-b border-black/[0.06] px-5 pb-3 dark:border-white/[0.06]">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e7ece9] font-[Newsreader,Georgia,serif] text-sm font-medium text-[#3f5c56] dark:bg-[#243330] dark:text-[#b9d4ce]">
            R
          </span>
          <div className="leading-tight">
            <div className="text-[12.5px] font-semibold text-[#1a1916] dark:text-[#f2efe7]">
              Your partner
            </div>
            <div className="text-[10.5px] text-[#8a847a]">Holiday table relative</div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2.5 px-4 pt-4 text-[12px] leading-snug">
          <div className="max-w-[82%] self-start rounded-2xl rounded-bl-md bg-[#efebe3] px-3.5 py-2.5 text-[#2a2824] dark:bg-[#24221d] dark:text-[#e8e4da]">
            Honestly, people who think like you never want to hear the other side.
          </div>
          <div className="max-w-[82%] self-end rounded-2xl rounded-br-md bg-[#328278] px-3.5 py-2.5 text-white dark:bg-[#eeeae1] dark:text-[#151513]">
            That’s fair to push on. What part do you feel gets ignored most?
          </div>
          <div className="max-w-[82%] self-start rounded-2xl rounded-bl-md bg-[#efebe3] px-3.5 py-2.5 text-[#2a2824] dark:bg-[#24221d] dark:text-[#e8e4da]">
            Mostly that folks around here feel talked down to.
          </div>

          <div className="mt-1 rounded-2xl border border-[#86c7c2]/30 bg-[#eef3f1] px-3.5 py-3 dark:border-[#8fb5ae]/25 dark:bg-[#1b2624]">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#4f6f68] dark:text-[#9cc2bb]">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              Coach
            </div>
            <p className="mt-1.5 text-[11.5px] text-[#34463f] dark:text-[#c9ddd8]">
              Nice listening. Try acknowledging the feeling before you share your view.
            </p>
          </div>
        </div>

        <div className="mx-4 mb-3 flex items-center justify-between rounded-2xl bg-[#f1eee7] px-4 py-2.5 dark:bg-[#1e1c18]">
          {LAPP_SCORES.map(([move, score]) => (
            <div key={move} className="flex flex-col items-center gap-1">
              <span className="font-[Newsreader,Georgia,serif] text-[13px] font-medium text-[#2f5a53] dark:text-[#8fb5ae]">
                {move.charAt(0)}
              </span>
              <span className="flex gap-[2px]">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span
                    key={n}
                    className={`h-1 w-1.5 rounded-full ${
                      n <= score ? 'bg-[#86c7c2] dark:bg-[#8fb5ae]' : 'bg-black/10 dark:bg-white/10'
                    }`}
                  />
                ))}
              </span>
            </div>
          ))}
        </div>

        <div className="mx-4 mb-5 flex items-center gap-2 rounded-full border border-black/[0.08] bg-white px-4 py-2.5 text-[11.5px] text-[#9a948a] dark:border-white/[0.08] dark:bg-[#1c1a16]">
          Type your reply…
          <span className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-[#328278] dark:bg-[#eeeae1]">
            <svg
              aria-hidden="true"
              viewBox="0 0 12 12"
              className="h-3 w-3 text-[#f7faf9] dark:text-[#151513]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 10V2M2.5 5.5L6 2l3.5 3.5" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}
