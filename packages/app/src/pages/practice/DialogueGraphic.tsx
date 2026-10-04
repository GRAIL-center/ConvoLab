/**
 * Abstract dialogue art for the hero: two speech forms on either side of a
 * wavering horizon. Colors come from currentColor so both themes work.
 */
export function DialogueGraphic({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1200 720"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="practiceSplit"
          x1="0"
          y1="360"
          x2="1200"
          y2="360"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.06" />
          <stop offset="48%" stopColor="currentColor" stopOpacity="0.015" />
          <stop offset="52%" stopColor="currentColor" stopOpacity="0.015" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.07" />
        </linearGradient>
      </defs>

      <rect width="1200" height="720" fill="url(#practiceSplit)" />

      <path
        d="M-20 420 C240 360, 420 480, 600 420 C780 360, 960 480, 1220 420"
        stroke="currentColor"
        strokeOpacity="0.1"
        strokeWidth="1.5"
      />
      <path
        d="M-20 450 C240 390, 420 510, 600 450 C780 390, 960 510, 1220 450"
        stroke="currentColor"
        strokeOpacity="0.05"
        strokeWidth="1"
      />

      <g className="motion-safe:animate-[practiceDrift_12s_ease-in-out_infinite]">
        <path
          d="M40 150 C40 100, 90 70, 160 70 H270 C340 70, 390 120, 390 180 C390 240, 340 290, 270 290 H150 L80 360 L96 290 C60 272, 40 230, 40 180 Z"
          fill="currentColor"
          fillOpacity="0.045"
          stroke="currentColor"
          strokeOpacity="0.16"
          strokeWidth="1.5"
        />
        <circle cx="150" cy="180" r="5" fill="#86c7c2" fillOpacity="0.5" />
        <circle cx="185" cy="180" r="5" fill="#86c7c2" fillOpacity="0.32" />
        <circle cx="220" cy="180" r="5" fill="#86c7c2" fillOpacity="0.18" />
      </g>

      <g className="motion-safe:animate-[practiceDrift_14s_ease-in-out_infinite_reverse]">
        <path
          d="M1170 520 C1170 470, 1120 440, 1050 440 H940 C870 440, 820 490, 820 550 C820 610, 870 660, 940 660 H1060 L1130 730 L1114 660 C1150 642, 1170 600, 1170 550 Z"
          fill="currentColor"
          fillOpacity="0.04"
          stroke="currentColor"
          strokeOpacity="0.14"
          strokeWidth="1.5"
        />
        <circle cx="960" cy="550" r="5" fill="#8fb5ae" fillOpacity="0.42" />
        <circle cx="995" cy="550" r="5" fill="#8fb5ae" fillOpacity="0.28" />
        <circle cx="1030" cy="550" r="5" fill="#8fb5ae" fillOpacity="0.16" />
      </g>
    </svg>
  );
}
