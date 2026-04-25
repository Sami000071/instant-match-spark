import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getClientId, loadProfile, saveProfile, type Profile } from "@/lib/client-id";
import {
  decideFn,
  enforceTimeoutFn,
  joinQueueFn,
  leaveQueueFn,
  leaveSessionFn,
  sendMessageFn,
} from "@/server/matchmaking.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Send, X, Check, LogOut, Zap } from "lucide-react";

type Stage = "home" | "matching" | "deciding" | "chatting" | "ended";

type SessionRow = {
  id: string;
  user_a_client_id: string;
  user_a_nickname: string;
  user_a_interests: string[];
  user_b_client_id: string;
  user_b_nickname: string;
  user_b_interests: string[];
  user_a_decision: "pending" | "accept" | "skip";
  user_b_decision: "pending" | "accept" | "skip";
  status: "deciding" | "chatting" | "ended";
  decide_deadline: string;
  ended_reason: string | null;
  left_by: string | null;
};

type Message = { id: string; sender_client_id: string; content: string; created_at: string };

const SUGGESTED_INTERESTS = [
  "music", "gaming", "movies", "art", "tech",
  "books", "travel", "memes", "anime", "sports",
];

export default function ChatApp() {
  const [stage, setStage] = useState<Stage>("home");
  const [profile, setProfile] = useState<Profile>({ nickname: "", interests: [] });
  const [session, setSession] = useState<SessionRow | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [endedReason, setEndedReason] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const clientIdRef = useRef<string>("");

  const join = useServerFn(joinQueueFn);
  const decide = useServerFn(decideFn);
  const enforce = useServerFn(enforceTimeoutFn);
  const leaveQ = useServerFn(leaveQueueFn);
  const leaveS = useServerFn(leaveSessionFn);
  const sendMsg = useServerFn(sendMessageFn);

  // hydrate client id + profile
  useEffect(() => {
    clientIdRef.current = getClientId();
    const p = loadProfile();
    if (p) setProfile(p);
  }, []);

  // ticking clock for countdown
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(i);
  }, []);

  // realtime: while matching, watch our queue row → if it disappears we got matched.
  // We also watch match_sessions for any new session involving us.
  useEffect(() => {
    if (stage !== "matching") return;
    const cid = clientIdRef.current;
    const channel = supabase
      .channel(`match-watch-${cid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "match_sessions" },
        (payload) => {
          const s = payload.new as SessionRow;
          if (s.user_a_client_id === cid || s.user_b_client_id === cid) {
            setSession(s);
            setStage("deciding");
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [stage]);

  // realtime: subscribe to session updates while deciding/chatting
  useEffect(() => {
    if (!session) return;
    if (stage !== "deciding" && stage !== "chatting") return;
    const channel = supabase
      .channel(`session-${session.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "match_sessions", filter: `id=eq.${session.id}` },
        (payload) => {
          const s = payload.new as SessionRow;
          setSession(s);
          if (s.status === "chatting") setStage("chatting");
          if (s.status === "ended") {
            setEndedReason(reasonText(s, clientIdRef.current));
            setStage("ended");
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `session_id=eq.${session.id}` },
        (payload) => {
          setMessages((m) => [...m, payload.new as Message]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, stage]);

  // when entering chatting, fetch any messages we may have missed
  useEffect(() => {
    if (stage !== "chatting" || !session) return;
    supabase
      .from("messages")
      .select("*")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setMessages(data as Message[]);
      });
  }, [stage, session]);

  // backend timeout enforcement
  useEffect(() => {
    if (stage !== "deciding" || !session) return;
    const deadline = new Date(session.decide_deadline).getTime();
    const ms = Math.max(0, deadline - Date.now()) + 200;
    const t = setTimeout(() => {
      enforce({ data: { sessionId: session.id } }).catch(() => {});
    }, ms);
    return () => clearTimeout(t);
  }, [stage, session, enforce]);

  // on tab close, try to leave gracefully
  useEffect(() => {
    const handler = () => {
      const cid = clientIdRef.current;
      if (stage === "matching") leaveQ({ data: { clientId: cid } }).catch(() => {});
      else if (session && (stage === "deciding" || stage === "chatting")) {
        leaveS({ data: { sessionId: session.id, clientId: cid } }).catch(() => {});
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [stage, session, leaveQ, leaveS]);

  async function startMatching(p: Profile) {
    saveProfile(p);
    setProfile(p);
    setMessages([]);
    setEndedReason(null);
    setStage("matching");
    const res = await join({
      data: {
        clientId: clientIdRef.current,
        nickname: p.nickname,
        interests: p.interests,
      },
    });
    if (res.session) {
      setSession(res.session as SessionRow);
      setStage("deciding");
    }
  }

  async function onDecide(d: "accept" | "skip") {
    if (!session) return;
    const updated = await decide({
      data: { sessionId: session.id, clientId: clientIdRef.current, decision: d },
    });
    setSession(updated as SessionRow);
    if (updated.status === "chatting") setStage("chatting");
    if (updated.status === "ended") {
      setEndedReason(reasonText(updated as SessionRow, clientIdRef.current));
      // immediately rematch
      setTimeout(() => startMatching(profile), 350);
    }
  }

  async function onLeaveChat() {
    if (!session) return;
    await leaveS({ data: { sessionId: session.id, clientId: clientIdRef.current } });
    setStage("home");
    setSession(null);
    setMessages([]);
  }

  async function onCancelMatching() {
    await leaveQ({ data: { clientId: clientIdRef.current } });
    setStage("home");
  }

  async function onSend() {
    if (!session || !draft.trim()) return;
    const content = draft.trim();
    setDraft("");
    await sendMsg({
      data: { sessionId: session.id, clientId: clientIdRef.current, content },
    }).catch(() => setDraft(content));
  }

  // when ended → rematch flow handled in onDecide; if other side ended, also rematch
  useEffect(() => {
    if (stage !== "ended") return;
    const t = setTimeout(() => startMatching(profile), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // ─── render ────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-20" />
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[var(--neon-pink)] opacity-20 blur-3xl animate-blob" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-[var(--neon-cyan)] opacity-20 blur-3xl animate-blob [animation-delay:-6s]" />

      <main className="relative mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-6">
        <Header />
        <div className="flex flex-1 items-center justify-center">
          {stage === "home" && (
            <HomeScreen initial={profile} onStart={startMatching} />
          )}
          {stage === "matching" && (
            <MatchingScreen onCancel={onCancelMatching} />
          )}
          {stage === "deciding" && session && (
            <DecisionScreen
              session={session}
              clientId={clientIdRef.current}
              now={now}
              onDecide={onDecide}
            />
          )}
          {stage === "chatting" && session && (
            <ChatScreen
              session={session}
              clientId={clientIdRef.current}
              messages={messages}
              draft={draft}
              setDraft={setDraft}
              onSend={onSend}
              onLeave={onLeaveChat}
            />
          )}
          {stage === "ended" && (
            <EndedScreen reason={endedReason} />
          )}
        </div>
      </main>
    </div>
  );
}

function reasonText(s: SessionRow, cid: string): string {
  if (s.ended_reason === "left") {
    return s.left_by === cid ? "You left" : "User left";
  }
  if (s.ended_reason === "skipped") {
    return s.left_by === cid ? "You skipped" : "They skipped";
  }
  if (s.ended_reason === "timeout") return "No response in time";
  return "Match ended";
}

// ─── Header ────────────────────────────────────────────────────────────────
function Header() {
  return (
    <header className="mb-6 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--gradient-accent)] glow-pink">
          <Zap className="h-5 w-5 text-background" strokeWidth={3} />
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tight">
            <span className="text-gradient">blink</span>
          </h1>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            mutual match · 5s
          </p>
        </div>
      </div>
      <Badge variant="outline" className="border-[var(--neon-cyan)]/40 text-[var(--neon-cyan)]">
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--neon-cyan)] animate-pulse" />
        live
      </Badge>
    </header>
  );
}

// ─── Home ──────────────────────────────────────────────────────────────────
function HomeScreen({
  initial,
  onStart,
}: {
  initial: Profile;
  onStart: (p: Profile) => void;
}) {
  const [nickname, setNickname] = useState(initial.nickname);
  const [interests, setInterests] = useState<string[]>(initial.interests);

  const valid = nickname.trim().length >= 1 && nickname.trim().length <= 24;

  function toggleInterest(i: string) {
    setInterests((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : prev.length >= 8 ? prev : [...prev, i],
    );
  }

  return (
    <div className="w-full max-w-md animate-fade-up">
      <div className="mb-8 text-center">
        <h2 className="mb-3 text-5xl font-black leading-none tracking-tight md:text-6xl">
          Talk to a <span className="text-gradient">stranger</span>.
        </h2>
        <p className="text-sm text-muted-foreground">
          Both of you have 5 seconds to accept. No swiping, no waiting.
        </p>
      </div>

      <div className="space-y-5 rounded-2xl border border-border bg-[var(--gradient-card)] p-6 shadow-2xl">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your nickname
          </label>
          <Input
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 24))}
            placeholder="ghost42"
            className="h-12 bg-input/60 text-base"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Interests <span className="text-muted-foreground/60">(optional, max 8)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_INTERESTS.map((i) => {
              const on = interests.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleInterest(i)}
                  className={
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-all " +
                    (on
                      ? "border-[var(--neon-pink)] bg-[var(--neon-pink)]/15 text-[var(--neon-pink)] glow-pink"
                      : "border-border bg-secondary text-muted-foreground hover:border-[var(--neon-pink)]/50 hover:text-foreground")
                  }
                >
                  #{i}
                </button>
              );
            })}
          </div>
        </div>

        <Button
          disabled={!valid}
          onClick={() => onStart({ nickname: nickname.trim(), interests })}
          className="h-14 w-full bg-[var(--gradient-accent)] text-base font-bold text-background hover:opacity-90 glow-pink"
        >
          <Sparkles className="mr-2 h-5 w-5" />
          Start Chat
        </Button>
      </div>
    </div>
  );
}

// ─── Matching ──────────────────────────────────────────────────────────────
function MatchingScreen({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="flex flex-col items-center gap-8 animate-fade-up">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-[var(--neon-pink)] opacity-30 blur-2xl animate-pulse" />
        <div className="relative flex h-32 w-32 items-center justify-center rounded-full border-2 border-[var(--neon-pink)] bg-card animate-pulse-glow">
          <div className="absolute inset-2 rounded-full border border-dashed border-[var(--neon-cyan)]/40 animate-spin [animation-duration:6s]" />
          <Sparkles className="h-10 w-10 text-[var(--neon-pink)]" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold">Looking for someone…</p>
        <p className="mt-1 text-sm text-muted-foreground">Hold tight, this is usually quick.</p>
      </div>
      <Button variant="ghost" onClick={onCancel} className="text-muted-foreground">
        Cancel
      </Button>
    </div>
  );
}

// ─── Decision ──────────────────────────────────────────────────────────────
function DecisionScreen({
  session,
  clientId,
  now,
  onDecide,
}: {
  session: SessionRow;
  clientId: string;
  now: number;
  onDecide: (d: "accept" | "skip") => void;
}) {
  const isA = session.user_a_client_id === clientId;
  const myDecision = isA ? session.user_a_decision : session.user_b_decision;
  const otherNick = isA ? session.user_b_nickname : session.user_a_nickname;
  const otherInterests = isA ? session.user_b_interests : session.user_a_interests;

  const remaining = Math.max(
    0,
    Math.ceil((new Date(session.decide_deadline).getTime() - now) / 1000),
  );
  const fraction = Math.max(
    0,
    Math.min(
      1,
      (new Date(session.decide_deadline).getTime() - now) / 5000,
    ),
  );

  const accepted = myDecision === "accept";

  return (
    <div className="w-full max-w-md animate-fade-up">
      <div className="overflow-hidden rounded-2xl border border-border bg-[var(--gradient-card)] shadow-2xl">
        <div className="relative h-1 w-full bg-secondary">
          <div
            className="h-full bg-[var(--gradient-accent)] transition-[width] duration-200 ease-linear"
            style={{ width: `${fraction * 100}%` }}
          />
        </div>

        <div className="flex flex-col items-center gap-4 px-6 pb-2 pt-8">
          <Avatar nickname={otherNick} />
          <div className="text-center">
            <h3 className="text-2xl font-black tracking-tight">{otherNick}</h3>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              wants to chat
            </p>
          </div>

          {otherInterests.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {otherInterests.map((i) => (
                <span
                  key={i}
                  className="rounded-full border border-[var(--neon-cyan)]/40 bg-[var(--neon-cyan)]/10 px-2.5 py-1 text-xs text-[var(--neon-cyan)]"
                >
                  #{i}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 pt-6 text-center">
          <div className="text-7xl font-black tabular-nums text-gradient">
            {remaining}
          </div>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {accepted ? "waiting for them…" : "decide fast"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 p-6">
          <Button
            variant="outline"
            onClick={() => onDecide("skip")}
            className="h-14 border-border bg-secondary/60 text-base font-bold hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="mr-2 h-5 w-5" />
            Skip
          </Button>
          <Button
            disabled={accepted}
            onClick={() => onDecide("accept")}
            className="h-14 bg-[var(--gradient-accent)] text-base font-bold text-background hover:opacity-90 glow-pink disabled:opacity-60"
          >
            <Check className="mr-2 h-5 w-5" />
            {accepted ? "Accepted" : "Accept"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Chat ──────────────────────────────────────────────────────────────────
function ChatScreen({
  session,
  clientId,
  messages,
  draft,
  setDraft,
  onSend,
  onLeave,
}: {
  session: SessionRow;
  clientId: string;
  messages: Message[];
  draft: string;
  setDraft: (s: string) => void;
  onSend: () => void;
  onLeave: () => void;
}) {
  const otherNick =
    session.user_a_client_id === clientId
      ? session.user_b_nickname
      : session.user_a_nickname;

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex h-[80vh] w-full max-w-md animate-fade-up flex-col overflow-hidden rounded-2xl border border-border bg-[var(--gradient-card)] shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar nickname={otherNick} small />
          <div>
            <p className="text-sm font-bold leading-tight">{otherNick}</p>
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--neon-lime)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--neon-lime)]" />
              connected
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onLeave}
          className="text-muted-foreground hover:text-destructive"
        >
          <LogOut className="mr-1 h-4 w-4" />
          Leave
        </Button>
      </div>

      <ScrollArea className="flex-1" viewportRef={scrollRef}>
        <div className="flex flex-col gap-2 p-4">
          {messages.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              You are now connected. Say hi 👋
            </p>
          )}
          {messages.map((m) => {
            const mine = m.sender_client_id === clientId;
            return (
              <div
                key={m.id}
                className={
                  "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-snug " +
                  (mine
                    ? "ml-auto rounded-br-sm bg-[var(--gradient-accent)] text-background"
                    : "mr-auto rounded-bl-sm bg-secondary text-foreground")
                }
              >
                {m.content}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="flex items-center gap-2 border-t border-border p-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Type a message…"
          maxLength={1000}
          className="h-11 bg-input/60"
        />
        <Button
          onClick={onSend}
          disabled={!draft.trim()}
          className="h-11 bg-[var(--gradient-accent)] text-background hover:opacity-90"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Ended ─────────────────────────────────────────────────────────────────
function EndedScreen({ reason }: { reason: string | null }) {
  return (
    <div className="flex flex-col items-center gap-3 animate-fade-up">
      <div className="text-3xl font-black tracking-tight">{reason ?? "Match ended"}</div>
      <p className="text-sm text-muted-foreground">Finding another…</p>
    </div>
  );
}

// ─── Avatar ────────────────────────────────────────────────────────────────
function Avatar({ nickname, small }: { nickname: string; small?: boolean }) {
  // deterministic gradient from nickname hash
  let h = 0;
  for (let i = 0; i < nickname.length; i++) h = (h * 31 + nickname.charCodeAt(i)) >>> 0;
  const hue1 = h % 360;
  const hue2 = (hue1 + 60) % 360;
  const initials = nickname.slice(0, 2).toUpperCase();
  const size = small ? "h-10 w-10 text-xs" : "h-20 w-20 text-2xl";
  return (
    <div
      className={`flex ${size} items-center justify-center rounded-full font-black text-background shadow-lg ring-2 ring-[var(--neon-pink)]/30`}
      style={{
        background: `linear-gradient(135deg, oklch(0.75 0.22 ${hue1}), oklch(0.7 0.22 ${hue2}))`,
      }}
    >
      {initials}
    </div>
  );
}
