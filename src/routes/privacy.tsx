import { createFileRoute } from "@tanstack/react-router";
import LegalShell, { Section } from "@/components/LegalShell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — blink" },
      { name: "description", content: "How blink collects, uses, and protects information." },
      { property: "og:title", content: "Privacy Policy — blink" },
      { property: "og:description", content: "How blink collects, uses, and protects information." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      subtitle="Last updated: November 2025"
    >
      <p>
        blink is an anonymous, real-time 1-on-1 chat platform. We try to collect
        as little as possible while still keeping the platform safe.
      </p>

      <Section title="Information We Collect">
        <p>
          When you use blink we may collect: a temporary session identifier used
          to route messages, the nickname / age / country / avatar you provide,
          the contents of public chat messages while a session is active, and
          basic device metadata (IP address, browser version) for abuse
          prevention.
        </p>
      </Section>

      <Section title="How We Use Information">
        <p>
          We use this information to operate the matchmaking and chat features,
          to improve the product, to enforce our Terms of Service, and to
          investigate reports of abuse.
        </p>
      </Section>

      <Section title="User Safety">
        <p>
          Reports, blocks, and moderation data may be retained even after a chat
          ends so we can keep abusive users off the platform. Never share
          personal information (real name, address, phone number, social media,
          payment details) with strangers on blink.
        </p>
      </Section>

      <Section title="Cookies and Local Storage">
        <p>
          We use local storage on your device to remember your session, your
          coin balance cache, and basic profile preferences. We do not use
          third-party advertising cookies.
        </p>
      </Section>

      <Section title="Third-Party Services">
        <p>
          Authentication and database hosting are provided by trusted
          infrastructure partners. We may show rewarded video ads from a
          third-party ad network when you choose to watch one for coins.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may update this policy from time to time. Material changes will be
          announced in the app.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions? Reach us at{" "}
          <a className="text-[var(--neon-pink)] underline" href="mailto:support@blink.app">
            support@blink.app
          </a>
          .
        </p>
      </Section>
    </LegalShell>
  );
}
