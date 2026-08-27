import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Flag, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  isAdminFn,
  listReportsFn,
  getReportTranscriptFn,
  type ReportRow,
  type TranscriptMessage,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/reports")({
  head: () => ({
    meta: [
      { title: "Reports — blink admin" },
      { name: "description", content: "Moderation console for reviewing blink user reports and chat transcripts." },
      { property: "og:title", content: "Reports — blink admin" },
      { property: "og:description", content: "Moderation console for reviewing blink user reports and chat transcripts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminReportsPage,
});

function fmt(iso: string) {
  return new Date(iso).toLocaleString();
}

function MessageBody({ content }: { content: string }) {
  if (content.startsWith("image:")) {
    return (
      <img
        src={content.slice(6)}
        alt="Reported chat attachment"
        className="mt-1 max-h-52 rounded-lg border border-white/10"
        loading="lazy"
      />
    );
  }
  if (content.startsWith("voice:")) {
    return <audio className="mt-1 w-full" controls src={content.slice(6)} />;
  }
  return <p className="whitespace-pre-wrap break-words text-sm">{content}</p>;
}

function AdminReportsPage() {
  const checkAdmin = useServerFn(isAdminFn);
  const listReports = useServerFn(listReportsFn);
  const getTranscript = useServerFn(getReportTranscriptFn);

  const [state, setState] = useState<"loading" | "denied" | "ready">("loading");
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await checkAdmin({});
        if (!res.admin) return setState("denied");
        setReports(await listReports({}));
        setState("ready");
      } catch {
        setState("denied");
      }
    })();
  }, []);

  async function toggle(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setLoadingChat(true);
    try {
      setTranscript(await getTranscript({ data: { reportId: id } }));
    } finally {
      setLoadingChat(false);
    }
  }

  return (
    <main className="min-h-[100dvh] w-full overflow-x-hidden bg-background px-4 py-6 text-foreground">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/" aria-label="Back home">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ShieldAlert className="h-6 w-6 text-[var(--neon-pink)]" /> Reports
          </h1>
        </div>

        {state === "loading" && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking access…
          </div>
        )}

        {state === "denied" && (
          <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-muted-foreground">
            You need an admin account to view reports. Sign in with your admin account and try again.
          </p>
        )}

        {state === "ready" && reports.length === 0 && (
          <p className="text-sm text-muted-foreground">No reports yet.</p>
        )}

        {state === "ready" && (
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold">
                      <Flag className="h-4 w-4 text-[var(--neon-pink)]" />
                      {r.reported?.nickname || "Unknown user"}
                      <span className="text-xs font-normal text-muted-foreground">
                        {[r.reported?.age, r.reported?.country].filter(Boolean).join(" · ")}
                      </span>
                    </p>
                    <p className="mt-1 text-sm">
                      <span className="text-muted-foreground">Reason: </span>
                      {r.reason || "—"}
                    </p>
                    {r.details && (
                      <p className="mt-1 text-sm text-muted-foreground break-words">{r.details}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Reported by {r.reporter?.nickname || "Unknown"} · {fmt(r.created_at)}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => toggle(r.id)}>
                    {openId === r.id ? "Hide chat" : "View chat"}
                  </Button>
                </div>

                {openId === r.id && (
                  <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-white/10 bg-background/60 p-3">
                    {loadingChat ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading transcript…
                      </div>
                    ) : transcript.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No messages in this chat.</p>
                    ) : (
                      <ul className="space-y-2">
                        {transcript.map((m) => (
                          <li
                            key={m.id}
                            className={`rounded-lg p-2 ${m.isReported ? "bg-[var(--neon-pink)]/15" : "bg-white/5"}`}
                          >
                            <p className="text-xs text-muted-foreground">
                              {m.senderNickname}
                              {m.isReported ? " (reported)" : ""} · {fmt(m.created_at)}
                            </p>
                            <MessageBody content={m.content} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
