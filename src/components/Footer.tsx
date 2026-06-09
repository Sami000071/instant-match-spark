import { Link } from "@tanstack/react-router";

export default function Footer() {
  return (
    <footer className="relative z-10 mt-12 border-t border-border/40 bg-background/40 backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row">
        <p className="text-center sm:text-left">
          © {new Date().getFullYear()} blink · anonymous chat · 18+
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
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
