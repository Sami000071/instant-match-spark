import { createFileRoute } from "@tanstack/react-router";
import LegalShell, { Section } from "@/components/LegalShell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — blink" },
      { name: "description", content: "The rules for using blink." },
      { property: "og:title", content: "Terms of Service — blink" },
      { property: "og:description", content: "The rules for using blink." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalShell title="Terms of Service" subtitle="Last updated: November 2025">
      <p>
        By using blink you agree to these terms. blink is a real-time
        anonymous chat platform for adults (18+).
      </p>

      <Section title="Use of the Service">
        <p>
          You must be at least 18 years old to use blink. You agree to use the
          platform only for lawful, respectful conversation.
        </p>
      </Section>

      <Section title="Moderation">
        <p>
          We may review reports, monitor for abuse, and take action against
          accounts that violate these terms — including warnings, temporary
          restrictions, and permanent bans. Coin purchases are non-refundable
          if the account is banned for violating the rules.
        </p>
      </Section>

      <Section title="No Guarantee">
        <p>
          blink is provided “as is.” We don’t guarantee that you will match,
          that conversations will be safe, or that the service will be
          uninterrupted. Use your own judgment when talking to strangers.
        </p>
      </Section>

      <Section title="User Responsibility">
        <p>
          You are responsible for the content you send. You must not harass,
          threaten, spam, defraud, or abuse other users. You must not share
          sexually explicit content involving minors, illegal content, or
          content that violates someone else’s rights. Users who violate these
          rules may be banned or restricted.
        </p>
      </Section>

      <Section title="Privacy">
        <p>
          Our handling of your data is described in the{" "}
          <a className="text-[var(--neon-pink)] underline" href="/privacy">
            Privacy Policy
          </a>
          .
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may update these terms. Continued use of blink after a change
          means you accept the new terms.
        </p>
      </Section>
    </LegalShell>
  );
}
