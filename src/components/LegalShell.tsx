import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export default function LegalShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-20" />
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[var(--neon-pink)] opacity-20 blur-3xl animate-blob" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-[var(--neon-cyan)] opacity-20 blur-3xl animate-blob [animation-delay:-6s]" />
      <main className="relative mx-auto max-w-3xl px-4 py-10">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-[var(--neon-pink)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back home
        </Link>
        <header className="mb-10">
          <h1 className="text-4xl font-black leading-tight tracking-tight md:text-5xl">
            <span className="text-gradient">{title}</span>
          </h1>
          {subtitle && (
            <p className="mt-3 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </header>
        <article className="space-y-8 rounded-2xl border border-border bg-[var(--gradient-card)] p-6 text-sm leading-relaxed text-foreground/90 shadow-2xl md:p-10">
          {children}
        </article>
      </main>
    </div>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
