interface AsideButtonProps {
  onClick: () => void;
  disabled: boolean;
}

export function AsideButton({ onClick, disabled }: AsideButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center h-10 w-10 rounded-full bg-amber-500 text-white shadow-lg hover:bg-amber-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      title="Ask Coach"
      aria-label="Ask Coach a question"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
        />
      </svg>
    </button>
  );
}
