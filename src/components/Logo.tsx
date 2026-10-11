/**
 * Keyra mark: a key whose bow is a renewal arrow — the vault and the subscriptions
 * it tracks. Same geometry as the app icon (app-icon.svg), drawn in currentColor.
 */
export function LogoMark({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="196 168 660 660" fill="none" className={className} aria-hidden="true">
      <path d="M388,253.5 A158,158 0 1 1 252.6,396.2" stroke="currentColor" strokeWidth="64" strokeLinecap="round" />
      <path d="M304.8,265.2 L384.2,183.4 L403.7,322 Z" fill="currentColor" stroke="currentColor" strokeWidth="18" strokeLinejoin="round" />
      <path d="M521.7,521.7 L790,790 M661.2,661.2 L734.8,587.7 M747.1,747.1 L800.8,693.3" stroke="currentColor" strokeWidth="64" strokeLinecap="round" />
    </svg>
  );
}
