import { createFileRoute } from "@tanstack/react-router";
import ChatApp from "@/components/ChatApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "blink — talk to a stranger in 5 seconds" },
      {
        name: "description",
        content:
          "Anonymous 1-on-1 chat with mutual 5-second matching. No accounts, no waiting — instant conversations.",
      },
      { property: "og:title", content: "blink — talk to a stranger in 5 seconds" },
      {
        property: "og:description",
        content:
          "Anonymous 1-on-1 chat with mutual 5-second matching. No accounts, no waiting.",
      },
    ],
  }),
  component: ChatApp,
});
