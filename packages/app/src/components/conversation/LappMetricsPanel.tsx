import type { LappScore } from '../../hooks/useConversationSocket';

interface LappMetricsPanelProps {
  lappScores: Map<number, LappScore>;
}

type Tone = 'constructive' | 'warm' | 'neutral' | 'tense';

// Compute per-dimension averages across all scored exchanges
function computeAverages(scores: Map<number, LappScore>) {
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
    return { label: 'Just starting', color: 'text-[#6B6B6B] dark:text-[#858585]' };
  const composite = scored.reduce((a, b) => a + b, 0) / scored.length;
  if (composite >= 4) return { label: 'Going well', color: 'text-[#16a34a] dark:text-[#4ade80]' };
  if (composite >= 2.5)
    return { label: 'Some friction', color: 'text-[#ca8a04] dark:text-[#facc15]' };
  return { label: 'Under pressure', color: 'text-[#ea580c] dark:text-[#fb923c]' };
}

function getMostRecentTone(scores: Map<number, LappScore>): Tone | null {
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
    <svg viewBox="0 0 104 104" className="w-full h-full" role="img" aria-labelledby="lapp-radar-title">
      <title id="lapp-radar-title">LAPP skill radar</title>
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

function SkillBar({ label, score }: { label: string; score: number }) {
  const pct = scoreToPercent(score);
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between items-center">
        <span className="text-[11px] text-[#4A4A4A] dark:text-[#A0A0A0]">{label}</span>
        <span className="text-[11px] font-medium text-[#4A4A4A] dark:text-[#A0A0A0]">{pct}%</span>
      </div>
      <div className="h-1 rounded-full bg-[rgba(200,220,215,0.4)] dark:bg-[rgba(255,255,255,0.07)]">
        <div
          className="h-1 rounded-full bg-[rgba(100,180,175,0.8)] dark:bg-[rgba(134,199,194,0.7)] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function LappMetricsPanel({ lappScores }: LappMetricsPanelProps) {
  const avg = computeAverages(lappScores);
  const status = getCompositeStatus(avg);
  const recentTone = getMostRecentTone(lappScores);
  const toneStyle = recentTone ? TONE_COLORS[recentTone] : null;

  return (
    <div
      className="flex flex-col h-full overflow-y-auto py-4 px-3 space-y-4
                    text-[#1A1A1A] dark:text-[#EBEBEB]"
    >
      {/* Header */}
      <div className="px-1">
        <div className="flex items-center gap-2 mb-0.5">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center
                          bg-[rgba(134,199,194,0.4)] dark:bg-[rgba(134,199,194,0.2)]"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-3.5 h-3.5 text-[rgba(50,130,120,1)] dark:text-[rgba(134,199,194,0.9)]"
              aria-hidden="true"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-sm font-semibold">LAPP Metrics</span>
        </div>
        <p className="text-[11px] text-[#6B6B6B] dark:text-[#858585] pl-8">Live session</p>
      </div>

      <div className="border-t border-[rgba(200,220,210,0.4)] dark:border-[rgba(255,255,255,0.06)]" />

      {/* Conversation Health */}
      <div className="px-1 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6B6B6B] dark:text-[#858585]">
          Conversation Health
        </p>
        <div className="flex flex-col items-center gap-2 py-2">
          {/* Health orb */}
          <div
            className={`w-10 h-10 rounded-full border-2 flex items-center justify-center
            ${
              lappScores.size === 0
                ? 'border-[rgba(200,220,215,0.6)] bg-[rgba(240,240,240,0.6)] dark:bg-[rgba(60,60,60,0.4)]'
                : status.label === 'Going well'
                  ? 'border-[rgba(34,197,94,0.7)] bg-[rgba(220,252,231,0.5)] dark:bg-[rgba(40,100,60,0.3)]'
                  : status.label === 'Some friction'
                    ? 'border-[rgba(234,179,8,0.7)] bg-[rgba(254,249,195,0.5)] dark:bg-[rgba(100,80,10,0.3)]'
                    : 'border-[rgba(234,88,12,0.7)] bg-[rgba(255,237,213,0.5)] dark:bg-[rgba(120,40,10,0.3)]'
            }`}
          >
            <div
              className={`w-3 h-3 rounded-full
              ${
                lappScores.size === 0
                  ? 'bg-[rgba(200,200,200,0.8)]'
                  : status.label === 'Going well'
                    ? 'bg-[#16a34a]'
                    : status.label === 'Some friction'
                      ? 'bg-[#ca8a04]'
                      : 'bg-[#ea580c]'
              }`}
            />
          </div>
          <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
          {toneStyle && recentTone && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${toneStyle.bg} ${toneStyle.text}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${toneStyle.dot}`} />
              {TONE_LABELS[recentTone]}
            </span>
          )}
        </div>
      </div>

      <div className="border-t border-[rgba(200,220,210,0.4)] dark:border-[rgba(255,255,255,0.06)]" />

      {/* Skill Balance */}
      <div className="px-1 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6B6B6B] dark:text-[#858585]">
          Skill Balance
        </p>
        <div className="space-y-2">
          <SkillBar label="Listen" score={avg.l} />
          <SkillBar label="Acknowledge" score={avg.a} />
          <SkillBar label="Pivot" score={avg.p} />
          <SkillBar label="Perspective" score={avg.pe} />
        </div>
      </div>

      <div className="border-t border-[rgba(200,220,210,0.4)] dark:border-[rgba(255,255,255,0.06)]" />

      {/* LAPP Radar */}
      <div className="px-1 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6B6B6B] dark:text-[#858585]">
          LAPP Radar
        </p>
        <div className="w-full aspect-square max-w-[140px] mx-auto">
          <LappRadar l={avg.l} a={avg.a} p={avg.p} pe={avg.pe} />
        </div>
      </div>

      <div className="border-t border-[rgba(200,220,210,0.4)] dark:border-[rgba(255,255,255,0.06)]" />

      {/* Message Tone Key */}
      <div className="px-1 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6B6B6B] dark:text-[#858585]">
          Message Tone Key
        </p>
        <div className="space-y-1.5">
          {(['constructive', 'warm', 'neutral', 'tense'] as Tone[]).map((tone) => (
            <div key={tone} className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-sm flex-shrink-0 ${TONE_COLORS[tone].dot}`} />
              <span className="text-[11px] text-[#4A4A4A] dark:text-[#A0A0A0]">
                {TONE_LABELS[tone]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-[rgba(200,220,210,0.4)] dark:border-[rgba(255,255,255,0.06)]" />

      {/* Phrase Markers */}
      <div className="px-1 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6B6B6B] dark:text-[#858585]">
          Phrase Markers
        </p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 bg-[#0d9488] flex-shrink-0 rounded-full" />
            <span className="text-[11px] text-[#4A4A4A] dark:text-[#A0A0A0]">Strong move</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 bg-[#ea580c] flex-shrink-0 rounded-full" />
            <span className="text-[11px] text-[#4A4A4A] dark:text-[#A0A0A0]">Opportunity</span>
          </div>
        </div>
      </div>
    </div>
  );
}
