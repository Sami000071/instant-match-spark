import { Link } from "@tanstack/react-router";

export default function Footer() {
  return (
    <footer className="relative z-10 h-10 border-t border-border/40 bg-background/40 backdrop-blur-sm">
      <div className="mx-auto flex h-10 max-w-3xl flex-row flex-wrap items-center justify-between gap-x-4 gap-y-0 overflow-hidden px-3 text-[10px] text-muted-foreground sm:px-4 sm:text-xs">
        <p className="truncate">
          © {new Date().getFullYear()} blink · anonymous chat · 18+
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0 sm:gap-x-5">
          <Link to="/privacy" className="transition-colors hover:text-[var(--neon-pink)]">
            Privacy Policy
          </Link>
          <Link to="/terms" className="transition-colors hover:text-[var(--neon-pink)]">
            Terms of Service
          </Link>
          <Link to="/contact" className="transition-colors hover:text-[var(--neon-pink)]">
            Contact
          </Link>
          <Link to="/shop" className="transition-colors hover:text-[var(--neon-pink)]">
            Shop
          </Link>
        </nav>
      </div>
    </footer>
  );
}
