import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_PROFILE,
  getClientId,
  loadProfile,
  saveProfile,
  type Profile,
} from "@/lib/client-id";
import { addBlocked } from "@/lib/blocks";
import { COUNTRIES, findCountry } from "@/lib/countries";
import {
  blockPartnerFn,
  createAvatarUploadUrlFn,
  decideFn,
  enforceTimeoutFn,
  findActiveSessionFn,
  joinQueueFn,
  leaveQueueFn,
  leaveSessionFn,
  reportPartnerFn,
  sendMessageFn,
} from "@/server/matchmaking.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  Sparkles,
  Send,
  X,
  Check,
  LogOut,
  Zap,
  Flag,
  Ban,
  SkipForward,
  Camera,
  Loader2,
  Smile,
} from "lucide-react";

type Stage = "home" | "matching" | "deciding" | "chatting" | "ended";

type SessionRow = {
  id: string;
  user_a_client_id: string;
  user_a_nickname: string;
  user_a_country: string;
  user_a_gender: string;
  user_a_avatar_url: string;
  user_b_client_id: string;
  user_b_nickname: string;
  user_b_country: string;
  user_b_gender: string;
  user_b_avatar_url: string;
  user_a_decision: "pending" | "accept" | "skip";
  user_b_decision: "pending" | "accept" | "skip";
  status: "deciding" | "chatting" | "ended";
  decide_deadline: string;
  ended_reason: string | null;
  left_by: string | null;
};

type Message = { id: string; sender_client_id: string; content: string; created_at: string };

const REPORT_REASONS = [
  "Harassment or hate",
  "Sexual content",
  "Spam or scam",
  "Underage user",
  "Threats or violence",
  "Other",
];

const CHAT_EMOJIS = ["😀", "😂", "😍", "😎", "😭", "😡", "👍", "👎", "❤️", "🔥", "✨", "🎉", "👋", "🙏"];

export default function ChatApp() {
  const [stage, setStage] = useState<Stage>("home");
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [endedReason, setEndedReason] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const clientIdRef = useRef<string>("");
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const rematchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const join = useServerFn(joinQueueFn);
  const decide = useServerFn(decideFn);
  const enforce = useServerFn(enforceTimeoutFn);
  const leaveQ = useServerFn(leaveQueueFn);
  const leaveS = useServerFn(leaveSessionFn);
  const sendMsg = useServerFn(sendMessageFn);
  const findActive = useServerFn(findActiveSessionFn);
  const reportFn = useServerFn(reportPartnerFn);
  const blockFn = useServerFn(blockPartnerFn);

  // hydrate client id + profile, then attempt reconnect
  useEffect(() => {
    clientIdRef.current = getClientId();
    const p = loadProfile();
    if (p) setProfile(p);
    // Reconnect to active session if any
    findActive({ data: { clientId: clientIdRef.current } })
      .then(({ session: s }) => {
        if (!s) return;
        setSession(s as SessionRow);
        setStage(s.status === "chatting" ? "chatting" : "deciding");
      })
      .catch(() => {});
  }, [findActive]);

  // ticking clock for countdown
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(i);
  }, []);

  // realtime: while matching, watch for any new session involving us.
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

  // If only two people are online and both re-queue at the same time, keep
  // retrying with a small jitter so normal skips/timeouts can rematch forever.
  useEffect(() => {
    if (stage !== "matching") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await join({
          data: { clientId: clientIdRef.current, profile },
        });
        if (cancelled) return;
        if (res.session) {
          setSession(res.session as SessionRow);
          setStage(res.session.status === "chatting" ? "chatting" : "deciding");
          return;
        }
      } catch {
        // keep waiting
      }
      timer = setTimeout(poll, 900 + Math.random() * 700);
    };

    timer = setTimeout(poll, 900 + Math.random() * 700);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [stage, profile, join]);

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

  // realtime presence + typing channel (broadcast)
  useEffect(() => {
    if (stage !== "chatting" || !session) return;
    const cid = clientIdRef.current;
    const ch = supabase.channel(`typing-${session.id}`, {
      config: { broadcast: { self: false } },
    });
    let typingTimer: ReturnType<typeof setTimeout> | null = null;
    ch.on("broadcast", { event: "typing" }, (msg) => {
      const from = (msg.payload as { from?: string })?.from;
      if (!from || from === cid) return;
      setPartnerTyping(true);
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(() => setPartnerTyping(false), 2500);
    });
    ch.subscribe();
    typingChannelRef.current = ch;
    return () => {
      if (typingTimer) clearTimeout(typingTimer);
      supabase.removeChannel(ch);
      typingChannelRef.current = null;
      setPartnerTyping(false);
    };
  }, [stage, session]);

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

  // on tab close, try to leave gracefully — but NOT during chatting/deciding,
  // so refreshing reconnects to the same session.
  useEffect(() => {
    const handler = () => {
      const cid = clientIdRef.current;
      if (stage === "matching") leaveQ({ data: { clientId: cid } }).catch(() => {});
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [stage, leaveQ]);

  async function startMatching(p: Profile) {
    saveProfile(p);
    setProfile(p);
    setMessages([]);
    setEndedReason(null);
    setPartnerTyping(false);
    setStage("matching");
    const res = await join({
      data: {
        clientId: clientIdRef.current,
        profile: p,
      },
    });
    if (res.session) {
      setSession(res.session as SessionRow);
      setStage(res.session.status === "chatting" ? "chatting" : "deciding");
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

  async function onSkipNext() {
    if (!session) return;
    await leaveS({ data: { sessionId: session.id, clientId: clientIdRef.current } });
    setSession(null);
    setMessages([]);
    startMatching(profile);
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

  function onTyping() {
    const ch = typingChannelRef.current;
    if (!ch) return;
    const t = Date.now();
    if (t - lastTypingSentRef.current < 1200) return;
    lastTypingSentRef.current = t;
    ch.send({
      type: "broadcast",
      event: "typing",
      payload: { from: clientIdRef.current },
    });
  }

  async function onBlock() {
    if (!session) return;
    const { blockedClientId } = await blockFn({
      data: { sessionId: session.id, clientId: clientIdRef.current },
    });
    addBlocked(blockedClientId);
    await leaveS({ data: { sessionId: session.id, clientId: clientIdRef.current } });
    setStage("home");
    setSession(null);
    setMessages([]);
  }

  async function onSubmitReport(reason: string, details: string, alsoBlock: boolean) {
    if (!session) return;
    const otherId =
      session.user_a_client_id === clientIdRef.current
        ? session.user_b_client_id
        : session.user_a_client_id;
    await reportFn({
      data: {
        sessionId: session.id,
        clientId: clientIdRef.current,
        reason,
        details,
        alsoBlock,
      },
    });
    if (alsoBlock) addBlocked(otherId);
    setReportOpen(false);
    await leaveS({ data: { sessionId: session.id, clientId: clientIdRef.current } });
    setStage("home");
    setSession(null);
    setMessages([]);
  }

  // when ended → auto-rematch
  useEffect(() => {
    if (stage !== "ended") return;
    const t = setTimeout(() => startMatching(profile), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

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
              onTyping={onTyping}
              onLeave={onLeaveChat}
              onSkipNext={onSkipNext}
              onReport={() => setReportOpen(true)}
              onBlock={onBlock}
              partnerTyping={partnerTyping}
            />
          )}
          {stage === "ended" && (
            <EndedScreen reason={endedReason} />
          )}
        </div>
      </main>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        onSubmit={onSubmitReport}
      />
    </div>
  );
}

function reasonText(s: SessionRow, cid: string): string {
  if (s.ended_reason === "left") return s.left_by === cid ? "You left" : "User left";
  if (s.ended_reason === "skipped") return s.left_by === cid ? "You skipped" : "They skipped";
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

// ─── Home / Profile ────────────────────────────────────────────────────────
function HomeScreen({
  initial,
  onStart,
}: {
  initial: Profile;
  onStart: (p: Profile) => void;
}) {
  const [nickname, setNickname] = useState(initial.nickname);
  const [country, setCountry] = useState(initial.country);
  const [gender, setGender] = useState<Profile["gender"]>(initial.gender);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const createUploadUrl = useServerFn(createAvatarUploadUrlFn);

  const valid = nickname.trim().length >= 1 && nickname.trim().length <= 24;

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const { uploadUrl, publicUrl } = await createUploadUrl({
        data: { clientId: getClientId(), ext },
      });
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("upload failed");
      setAvatarUrl(publicUrl);
    } catch (e) {
      console.error(e);
      alert("Upload failed. Try another image.");
    } finally {
      setUploading(false);
    }
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
        {/* Avatar uploader */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative"
            aria-label="Upload photo"
          >
            <Avatar nickname={nickname || "you"} avatarUrl={avatarUrl} />
            <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--gradient-accent)] text-background shadow-md ring-2 ring-background">
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
            </span>
          </button>
          <div className="flex-1">
            <p className="text-sm font-bold">Your photo</p>
            <p className="text-xs text-muted-foreground">
              Optional · shown during the 5s decision
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </div>

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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Country
            </label>
            <Select value={country || "none"} onValueChange={(v) => setCountry(v === "none" ? "" : v)}>
              <SelectTrigger className="h-12 bg-input/60">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="none">— Hidden —</SelectItem>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    <span className="mr-2">{c.flag}</span>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Gender
            </label>
            <Select value={gender} onValueChange={(v) => setGender(v as Profile["gender"])}>
              <SelectTrigger className="h-12 bg-input/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unspecified">Prefer not to say</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="nonbinary">Non-binary</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          disabled={!valid || uploading}
          onClick={() =>
            onStart({
              nickname: nickname.trim(),
              country,
              gender,
              avatarUrl,
            })
          }
          className="h-14 w-full bg-[var(--gradient-accent)] text-base font-bold text-background hover:opacity-90 glow-pink"
        >
          <Sparkles className="mr-2 h-5 w-5" />
          Start Chat
        </Button>
        <p className="text-center text-[10px] text-muted-foreground">
          Be kind. Reports & blocks keep the community safe.
        </p>
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
  const otherCountry = isA ? session.user_b_country : session.user_a_country;
  const otherGender = isA ? session.user_b_gender : session.user_a_gender;
  const otherAvatar = isA ? session.user_b_avatar_url : session.user_a_avatar_url;

  // Anchor countdown to the client's clock the first time we see this session,
  // so server/client clock skew or late realtime delivery can't make it skip
  // instantly. Always give the user a fresh 5 seconds from when they see it.
  const DECIDE_MS = 5000;
  const localStartRef = useRef<{ id: string; start: number } | null>(null);
  if (!localStartRef.current || localStartRef.current.id !== session.id) {
    localStartRef.current = { id: session.id, start: Date.now() };
  }
  const localDeadline = localStartRef.current.start + DECIDE_MS;
  const msLeft = Math.max(0, localDeadline - now);
  const remaining = Math.ceil(msLeft / 1000);
  const fraction = Math.max(0, Math.min(1, msLeft / DECIDE_MS));

  const accepted = myDecision === "accept";

  // Client-side fallback: if timer hits 0 and we haven't decided, auto-skip.
  // Guard with a small grace period so it can't fire on the first render.
  const autoSkippedRef = useRef(false);
  useEffect(() => {
    autoSkippedRef.current = false;
  }, [session.id]);
  useEffect(() => {
    const elapsed = Date.now() - (localStartRef.current?.start ?? Date.now());
    if (
      msLeft <= 0 &&
      elapsed >= DECIDE_MS - 50 &&
      myDecision === "pending" &&
      !autoSkippedRef.current
    ) {
      autoSkippedRef.current = true;
      onDecide("skip");
    }
  }, [msLeft, myDecision, onDecide]);
  const country = findCountry(otherCountry);

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
          <Avatar nickname={otherNick} avatarUrl={otherAvatar} />
          <div className="text-center">
            <h3 className="text-2xl font-black tracking-tight">{otherNick}</h3>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              wants to chat
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-1.5">
            {country && (
              <span className="rounded-full border border-[var(--neon-cyan)]/40 bg-[var(--neon-cyan)]/10 px-2.5 py-1 text-xs text-[var(--neon-cyan)]">
                {country.flag} {country.name}
              </span>
            )}
            {otherGender && otherGender !== "unspecified" && (
              <span className="rounded-full border border-[var(--neon-pink)]/40 bg-[var(--neon-pink)]/10 px-2.5 py-1 text-xs capitalize text-[var(--neon-pink)]">
                {otherGender}
              </span>
            )}
          </div>
        </div>

        <div className="px-6 pt-6 text-center">
          <div className="text-7xl font-black tabular-nums text-gradient">{remaining}</div>
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
  onTyping,
  onLeave,
  onSkipNext,
  onReport,
  onBlock,
  partnerTyping,
}: {
  session: SessionRow;
  clientId: string;
  messages: Message[];
  draft: string;
  setDraft: (s: string) => void;
  onSend: () => void;
  onTyping: () => void;
  onLeave: () => void;
  onSkipNext: () => void;
  onReport: () => void;
  onBlock: () => void;
  partnerTyping: boolean;
}) {
  const isA = session.user_a_client_id === clientId;
  const otherNick = isA ? session.user_b_nickname : session.user_a_nickname;
  const otherAvatar = isA ? session.user_b_avatar_url : session.user_a_avatar_url;
  const otherCountry = isA ? session.user_b_country : session.user_a_country;
  const country = useMemo(() => findCountry(otherCountry), [otherCountry]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, partnerTyping]);

  return (
    <div className="flex h-[80vh] w-full max-w-md animate-fade-up flex-col overflow-hidden rounded-2xl border border-border bg-[var(--gradient-card)] shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-3 py-3">
        <div className="flex items-center gap-3">
          <Avatar nickname={otherNick} avatarUrl={otherAvatar} small />
          <div>
            <p className="flex items-center gap-1.5 text-sm font-bold leading-tight">
              {otherNick}
              {country && <span title={country.name}>{country.flag}</span>}
            </p>
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--neon-lime)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--neon-lime)]" />
              connected
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onReport}
            title="Report"
            className="h-9 w-9 text-muted-foreground hover:text-destructive"
          >
            <Flag className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onBlock}
            title="Block"
            className="h-9 w-9 text-muted-foreground hover:text-destructive"
          >
            <Ban className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onSkipNext}
            title="Next"
            className="h-9 w-9 text-muted-foreground hover:text-[var(--neon-cyan)]"
          >
            <SkipForward className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onLeave}
            title="Leave"
            className="h-9 w-9 text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
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
                    ? "ml-auto rounded-br-sm bg-[var(--gradient-accent)] text-white font-medium drop-shadow-sm"
                    : "mr-auto rounded-bl-sm bg-secondary text-foreground")
                }
              >
                {m.content}
              </div>
            );
          })}
          {partnerTyping && (
            <div className="mr-auto flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-secondary px-3.5 py-2.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--neon-pink)] [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--neon-pink)] [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--neon-pink)]" />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border p-3">
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onTyping();
          }}
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
function Avatar({
  nickname,
  avatarUrl,
  small,
}: {
  nickname: string;
  avatarUrl?: string;
  small?: boolean;
}) {
  let h = 0;
  for (let i = 0; i < nickname.length; i++) h = (h * 31 + nickname.charCodeAt(i)) >>> 0;
  const hue1 = h % 360;
  const hue2 = (hue1 + 60) % 360;
  const initials = nickname.slice(0, 2).toUpperCase();
  const size = small ? "h-10 w-10 text-xs" : "h-20 w-20 text-2xl";
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={nickname}
        className={`${size} rounded-full object-cover shadow-lg ring-2 ring-[var(--neon-pink)]/40`}
      />
    );
  }
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

// ─── Report Dialog ─────────────────────────────────────────────────────────
function ReportDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (reason: string, details: string, alsoBlock: boolean) => void;
}) {
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);

  useEffect(() => {
    if (open) {
      setReason(REPORT_REASONS[0]);
      setDetails("");
      setAlsoBlock(true);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this user</DialogTitle>
          <DialogDescription>
            Help keep blink safe. Your report is anonymous.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Reason
            </label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Details (optional)
            </label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
              placeholder="What happened?"
              rows={3}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={alsoBlock}
              onChange={(e) => setAlsoBlock(e.target.checked)}
              className="h-4 w-4 accent-[var(--neon-pink)]"
            />
            Also block — never match me with them again
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit(reason, details, alsoBlock)}
            className="bg-[var(--gradient-accent)] text-background hover:opacity-90"
          >
            <Flag className="mr-2 h-4 w-4" />
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
