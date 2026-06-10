// Fabriflow mark: bold F + right-pointing flow arrow
export function FabriflowMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* F letterform */}
      <path
        d="M3 2.5h9.5v2.75H5.75v3h6v2.75h-6V17.5H3V2.5Z"
        fill="currentColor"
      />
      {/* Flow arrow → */}
      <path
        d="M14 6.5l3.5 3.5-3.5 3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
