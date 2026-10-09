export default function Temple({ size = 32, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 41h38M9 41V27h30v14M6 27h36M15 27V17h18v10M12 17h24L24 6 12 17ZM24 6V2l7 2-7 2M19 41V31h10v10M9 21v6M39 21v6M14 34h1M33 34h1M22 21h4" />
    </svg>
  );
}
