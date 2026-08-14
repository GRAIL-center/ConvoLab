import type { LappScore } from '../../hooks/useConversationSocket';

interface LappMetricsPanelProps {
  lappScores: Map<string, LappScore>;
  variant?: 'full' | 'explanation';
}

type Tone = 'constructive' | 'warm' | 'neutral' | 'tense';

// Compute per-dimension averages across all scored exchanges
function computeAverages(scores: Map<string, LappScore>) {
  const entries = [...scores.values()];
  if (entries.length === 0) return { l: 0, a: 0, p: 0, pe: 0 };

  let lSum = 0,
    aSum = 0,
    pSum = 0,
    peSum = 0;
  let lCount = 0,
    aCount = 0,
    pCount = 0,
    peCount = 0;

  for (const entry of entries) {
    const { l, a, p, pe } = entry.scores;
    if (l > 0) {
      lSum += l;
      lCount++;
    }
    if (a > 0) {
      aSum += a;
      aCount++;
    }
    if (p > 0) {
      pSum += p;
      pCount++;
    }
    if (pe > 0) {
      peSum += pe;
      peCount++;
    }
  }

  return {
    l: lCount > 0 ? lSum / lCount : 0,
    a: aCount > 0 ? aSum / aCount : 0,
    p: pCount > 0 ? pSum / pCount : 0,
    pe: peCount > 0 ? peSum / peCount : 0,
  };
}

// 0–5 score → 0–100 display percentage (score 0 = 0%, score 5 = 100%)
function scoreToPercent(score: number): number {
  return Math.round((score / 5) * 100);
}

function getCompositeStatus(avg: { l: number; a: number; p: number; pe: number }) {
  const scored = [avg.l, avg.a, avg.p, avg.pe].filter((v) => v > 0);
  if (scored.length === 0)
    return {
      label: 'Just starting',
      color: 'text-[#6B6B6B] dark:text-[#858585]',
    };
  const composite = scored.reduce((a, b) => a + b, 0) / scored.length;
  if (composite >= 4) return { label: 'Going well', color: 'text-[#16a34a] dark:text-[#4ade80]' };
  if (composite >= 2.5)
    return {
      label: 'Some friction',
      color: 'text-[#ca8a04] dark:text-[#facc15]',
    };
  return {
    label: 'Under pressure',
    color: 'text-[#ea580c] dark:text-[#fb923c]',
  };
}

function getMostRecentTone(scores: Map<string, LappScore>): Tone | null {
  const entries = [...scores.values()];
  if (entries.length === 0) return null;
  return entries[entries.length - 1].tone;
}

const TONE_COLORS: Record<Tone, { bg: string; text: string; dot: string }> = {
  constructive: {
    bg: 'bg-[rgba(220,252,231,0.8)] dark:bg-[rgba(40,100,60,0.4)]',
    text: 'text-[#166534] dark:text-[#4ade80]',
    dot: 'bg-[#16a34a]',
  },
  warm: {
    bg: 'bg-[rgba(212,232,229,0.6)] dark:bg-[rgba(212,232,229,0.15)]',
    text: 'text-[#0f766e] dark:text-[#5eead4]',
    dot: 'bg-[#0d9488]',
  },
  neutral: {
    bg: 'bg-[rgba(229,231,235,0.8)] dark:bg-[rgba(60,60,60,0.4)]',
    text: 'text-[#4B5563] dark:text-[#9CA3AF]',
    dot: 'bg-[#9CA3AF]',
  },
  tense: {
    bg: 'bg-[rgba(255,237,213,0.8)] dark:bg-[rgba(120,50,10,0.4)]',
    text: 'text-[#9a3412] dark:text-[#fb923c]',
    dot: 'bg-[#ea580c]',
  },
};

const TONE_LABELS: Record<Tone, string> = {
  constructive: 'Constructive',
  warm: 'Warm',
  neutral: 'Neutral',
  tense: 'Tense',
};

// LAPP Radar (SVG diamond chart)
function LappRadar({ l, a, p, pe }: { l: number; a: number; p: number; pe: number }) {
  const cx = 52;
  const cy = 52;
  const maxR = 30;

  // Convert scores (0–5) to coordinates
  const lPt = { x: cx, y: cy - (l / 5) * maxR }; // top
  const aPt = { x: cx + (a / 5) * maxR, y: cy }; // right
  const pPt = { x: cx, y: cy + (p / 5) * maxR }; // bottom
  const pePt = { x: cx - (pe / 5) * maxR, y: cy }; // left

  const hasAny = l > 0 || a > 0 || p > 0 || pe > 0;
  const polyPoints = `${lPt.x},${lPt.y} ${aPt.x},${aPt.y} ${pPt.x},${pPt.y} ${pePt.x},${pePt.y}`;

  // Grid rings at scores 1, 2, 3, 4, 5
  const gridRings = [1, 2, 3, 4, 5].map((s) => {
    const r = (s / 5) * maxR;
    return `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
  });

  return (
    <svg
      viewBox="-18 0 140 104"
      className="w-full h-full"
      role="img"
      aria-labelledby="lapp-radar-title"
    >
      <title id="lapp-radar-title">
        {`LAPP skill radar. Listen ${scoreToPercent(l)}%. Acknowledge ${scoreToPercent(a)}%. Pivot ${scoreToPercent(p)}%. Perspective ${scoreToPercent(pe)}%.`}
      </title>
      {/* Grid diamonds */}
      {gridRings.map((pts) => (
        <polygon
          key={pts}
          points={pts}
          fill="none"
          stroke="rgba(180,200,195,0.4)"
          strokeWidth="0.6"
        />
      ))}

      {/* Axis lines */}
      <line
        x1={cx}
        y1={cy}
        x2={cx}
        y2={cy - maxR}
        stroke="rgba(180,200,195,0.5)"
        strokeWidth="0.6"
      />
      <line
        x1={cx}
        y1={cy}
        x2={cx + maxR}
        y2={cy}
        stroke="rgba(180,200,195,0.5)"
        strokeWidth="0.6"
      />
      <line
        x1={cx}
        y1={cy}
        x2={cx}
        y2={cy + maxR}
        stroke="rgba(180,200,195,0.5)"
        strokeWidth="0.6"
      />
      <line
        x1={cx}
        y1={cy}
        x2={cx - maxR}
        y2={cy}
        stroke="rgba(180,200,195,0.5)"
        strokeWidth="0.6"
      />

      {/* Score polygon */}
      {hasAny && (
        <polygon
          points={polyPoints}
          fill="rgba(134,199,194,0.35)"
          stroke="rgba(100,180,175,0.9)"
          strokeWidth="1.2"
        />
      )}

      {/* Center dot */}
      <circle cx={cx} cy={cy} r="1.5" fill="rgba(100,180,175,0.7)" />

      {/* Axis labels */}
      <text
        x={cx}
        y={cy - maxR - 5}
        textAnchor="middle"
        fontSize="7"
        fill="currentColor"
        className="text-[#6B6B6B] dark:text-[#858585]"
      >
        Listen
      </text>
      <text
        x={cx + maxR + 4}
        y={cy + 2.5}
        textAnchor="start"
        fontSize="7"
        fill="currentColor"
        className="text-[#6B6B6B] dark:text-[#858585]"
      >
        Ack.
      </text>
      <text
        x={cx}
        y={cy + maxR + 9}
        textAnchor="middle"
        fontSize="7"
        fill="currentColor"
        className="text-[#6B6B6B] dark:text-[#858585]"
      >
        Pivot
      </text>
      <text
        x={cx - maxR - 4}
        y={cy + 2.5}
        textAnchor="end"
        fontSize="7"
        fill="currentColor"
        className="text-[#6B6B6B] dark:text-[#858585]"
      >
        Persp.
      </text>
    </svg>
  );
}

const LAPP_ITEMS = [
  {
    letter: 'L',
    label: 'Listen',
    desc: 'Understand what actually matters to them - not to reload your rebuttal.',
  },
  {
    letter: 'A',
    label: 'Acknowledge',
    desc: 'Name something real you can validate before you push back.',
  },
  {
    letter: 'P',
    label: 'Pivot',
    desc: "Signal the turn - you'd like to share your own view now.",
  },
  {
    letter: 'P',
    label: 'Perspective',
    desc: 'Share your side in "I" statements, not accusations.',
  },
];

function LappExplanation() {
  return (
    <div className="space-y-2 px-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#77736b] dark:text-[#8c8880]">
        What LAPP Means
      </p>
      <div className="space-y-2.5">
        {LAPP_ITEMS.map((item, index) => (
          <div key={`${item.letter}-${index}`} className="grid grid-cols-[24px_1fr] gap-3">
            <div className="pt-0.5 font-serif text-base text-[#6e6a62] dark:text-[#9a968e]">
              {item.letter}
              <div className="mt-1 h-px w-6 bg-[#d8d4ca] dark:bg-[#3a3834]" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#282722] dark:text-[#dedbd4]">
                {item.label}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-[#6b675f] dark:text-[#9d9890]">
                {item.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LappMetricsPanel({ lappScores, variant = 'full' }: LappMetricsPanelProps) {
  const avg = computeAverages(lappScores);
  const status = getCompositeStatus(avg);
  const recentTone = getMostRecentTone(lappScores);

  if (variant === 'explanation') {
    return (
    <div className="flex h-full flex-col overflow-y-auto px-7 py-7 text-[#1A1A1A] dark:text-[#EBEBEB]">
        <LappExplanation />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden px-6 py-5 text-[#1A1A1A] dark:text-[#EBEBEB]">
      <div className="space-y-3.5">
        <div className="px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#77736b] dark:text-[#8c8880]">
            Conversation Health
          </p>
          <div className="mt-4 flex items-center gap-4">
            <div
              className={`h-14 w-14 rounded-full border-2 shadow-[0_0_28px_rgba(120,140,130,0.18)] ${
                lappScores.size === 0
                  ? 'border-[#8f948e] bg-[radial-gradient(circle_at_35%_28%,#f2efe7_0,#a5a7a0_30%,#54564f_68%,#24241f_100%)]'
                  : status.label === 'Going well'
                    ? 'border-[#60c990] bg-[radial-gradient(circle_at_35%_28%,#f2efe7_0,#75d79d_28%,#2c8b5d_62%,#123a2a_100%)]'
                    : status.label === 'Some friction'
                      ? 'border-[#f0ad5d] bg-[radial-gradient(circle_at_35%_28%,#f2efe7_0,#f0ad5d_32%,#855a24_70%,#2c2114_100%)]'
                      : 'border-[#f97316] bg-[radial-gradient(circle_at_35%_28%,#f2efe7_0,#fb923c_32%,#9a3412_70%,#30170c_100%)]'
              }`}
            />
            <div>
              <p className="font-serif text-2xl text-[#282722] dark:text-[#dedbd4]">
                {recentTone ? TONE_LABELS[recentTone] : status.label}
              </p>
              <p className="mt-0.5 text-sm text-[#6b675f] dark:text-[#9d9890]">
                {lappScores.size === 0 ? 'tone appears after your first reply' : status.label}
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            {(['constructive', 'warm', 'neutral', 'tense'] as Tone[]).map((tone) => (
              <div
                key={tone}
                className={`flex items-center justify-between rounded-lg px-3 py-1 text-sm ${
                  recentTone === tone
                    ? 'border border-[#d8d3c8] bg-[#f6f4ee] dark:border-[#34312c] dark:bg-[#1b1a17]'
                    : ''
                }`}
              >
                <span className="flex items-center gap-2 text-[#6b675f] dark:text-[#9d9890]">
                  <span className={`h-2 w-2 rounded-full ${TONE_COLORS[tone].dot}`} />
                  {TONE_LABELS[tone]}
                </span>
                {recentTone === tone && (
                  <span className="text-[10px] uppercase tracking-widest text-[#8c877d]">Now</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-[#d8d3c8] dark:border-[#34312c]" />

        <div className="px-1">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#77736b] dark:text-[#8c8880]">
              Skills In Play
            </p>
            <span className="text-xs text-[#77736b] dark:text-[#8c8880]">
              {lappScores.size === 0 ? 'no data yet' : `${lappScores.size} turns`}
            </span>
          </div>
          <div
            className="relative mx-auto h-28 w-36"
            title={`Listen ${scoreToPercent(avg.l)}%. Acknowledge ${scoreToPercent(avg.a)}%. Pivot ${scoreToPercent(avg.p)}%. Perspective ${scoreToPercent(avg.pe)}%.`}
          >
            <LappRadar l={avg.l} a={avg.a} p={avg.p} pe={avg.pe} />
          </div>
        </div>

        <div className="border-t border-[#d8d3c8] dark:border-[#34312c]" />

        <LappExplanation />
      </div>
    </div>
  );
}
