import { createFileRoute } from "@tanstack/react-router";
import LegalShell from "@/components/LegalShell";
import { Mail } from "lucide-react";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — blink" },
      { name: "description", content: "Get in touch with the blink team." },
      { property: "og:title", content: "Contact — blink" },
      { property: "og:description", content: "Get in touch with the blink team." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <LegalShell
      title="Contact"
      subtitle="Questions, feedback, or a safety concern? We’d love to hear from you."
    >
      <p>
        The fastest way to reach us is by email. We typically respond within a
        couple of business days.
      </p>
      <a
        href="mailto:supportblinkapp@gmail.com"
        className="inline-flex items-center gap-3 rounded-xl border border-[var(--neon-pink)]/40 bg-[var(--neon-pink)]/10 px-5 py-4 text-base font-bold text-[var(--neon-pink)] transition-colors hover:bg-[var(--neon-pink)]/20"
      >
        <Mail className="h-5 w-5" />
        supportblinkapp@gmail.com
      </a>
      <p className="text-xs text-muted-foreground">
        For urgent safety issues, please also use the in-app Report button so we
        can act on the conversation immediately.
      </p>
    </LegalShell>
  );
}
