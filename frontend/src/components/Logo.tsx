interface LogoProps { size?: number; withText?: boolean; className?: string }

/** Official Mess Management Community Dining Emblem — preserves aspect ratio. */
export default function Logo({ size = 40, withText = false, className = '' }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img
        src="/img/logo.png"
        alt="Mess Management"
        width={size}
        height={Math.round(size * 0.667)}
        className="object-contain select-none"
        draggable={false}
      />
      {withText && (
        <span className="leading-tight">
          <span className="block font-extrabold tracking-tight text-slate-900 dark:text-white text-lg">Mess</span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--ui-accent,#D4AF37)' }}>Management</span>
        </span>
      )}
    </span>
  );
}
