import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_PROFILE,
  getClientId,
  loadProfile,
  saveProfile,
  setClientId,
  type Profile,
} from "@/lib/client-id";
import { addBlocked } from "@/lib/blocks";
import { COUNTRIES, findCountry } from "@/lib/countries";
import {
  addFriendFn,
  blockPartnerFn,
  createAvatarUploadUrlFn,
  decideFn,
  enforceTimeoutFn,
  findActiveSessionFn,
  joinQueueFn,
  leaveQueueFn,
  leaveSessionFn,
  listFriendMessagesFn,
  listFriendsFn,
  removeFriendFn,
  reportPartnerFn,
  sendFriendMessageFn,
  sendMessageFn,
} from "@/server/matchmaking.functions";
import { getBalanceFn } from "@/server/coins.functions";
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
import { lovable } from "@/integrations/lovable";

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
  Users,
  ArrowLeft,
  Home,
  UserPlus,
  Trash2,
  ShieldCheck,
  Globe2,
  MessageCircle,
  Clock,
  Coins,
  ShoppingBag,
} from "lucide-react";



type Friend = {
  clientId: string;
  nickname: string;
  avatarUrl: string;
  country: string;
  since: string;
};

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

type Stage =
  | "intro"
  | "login"
  | "home"
  | "lobby"
  | "matching"
  | "deciding"
  | "chatting"
  | "ended"
  | "friends"
  | "friend-chat";

type Lobby = "any" | "girls" | "boys";

export default function ChatApp() {
  const [stage, setStage] = useState<Stage>("intro");
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [endedReason, setEndedReason] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [incomingFriendRequest, setIncomingFriendRequest] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [friendStatus, setFriendStatus] = useState<"idle" | "pending" | "mutual">("idle");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [activeFriend, setActiveFriend] = useState<Friend | null>(null);
  const [selectedLobby, setSelectedLobby] = useState<Lobby>("any");
  const [balance, setBalance] = useState<number>(0);
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
  const addFriendCall = useServerFn(addFriendFn);
  const listFriendsCall = useServerFn(listFriendsFn);
  const removeFriendCall = useServerFn(removeFriendFn);
  const getBalance = useServerFn(getBalanceFn);

  async function refreshBalance() {
    try {
      const { balance: b } = await getBalance({});
      setBalance(b);
    } catch {
      // ignore
    }
  }

  // Load DB profile for the signed-in user. Sets clientIdRef to the stable
  // matching id stored in the profiles row.
  async function hydrateProfileForUser(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("client_id, nickname, age, country, gender, avatar_url")
      .eq("user_id", userId)
      .maybeSingle();
    if (data) {
      clientIdRef.current = data.client_id as string;
      setClientId(clientIdRef.current);
      const p: Profile = {
        nickname: data.nickname || "",
        age: typeof data.age === "number" ? data.age : null,
        country: data.country || "",
        gender: (data.gender as Profile["gender"]) || "unspecified",
        avatarUrl: data.avatar_url || "",
      };
      setProfile(p);
      saveProfile(p);
    }
  }

  async function saveProfileToDb(p: Profile) {
    if (!authUserId) throw new Error("Not signed in");
    if (p.age == null || p.age < 18) throw new Error("You must be 18 or older");
    const { error } = await supabase
      .from("profiles")
      .update({
        nickname: p.nickname,
        age: p.age,
        country: p.country,
        gender: p.gender,
        avatar_url: p.avatarUrl,
      })
      .eq("user_id", authUserId);
    if (error) throw new Error(error.message);
    setProfile(p);
    saveProfile(p);
  }

  // Auth bootstrap: subscribe FIRST, then check existing session.
  useEffect(() => {
    clientIdRef.current = getClientId();
    const cached = loadProfile();
    if (cached) setProfile(cached);

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      const uid = s?.user?.id ?? null;
      setAuthUserId(uid);
      if (uid) {
        // hydrate after micro-task to avoid Supabase deadlocks
        setTimeout(() => {
          hydrateProfileForUser(uid).catch(() => {});
        }, 0);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id ?? null;
      setAuthUserId(uid);
      if (uid) hydrateProfileForUser(uid).catch(() => {});
      setAuthReady(true);
    });

    // Reconnect ONLY to an in-progress chat (not a stale deciding session).
    findActive({ data: { clientId: clientIdRef.current } })
      .then(({ session: s }) => {
        if (!s) return;
        if (s.status === "chatting") {
          setSession(s as SessionRow);
          setStage("chatting");
        }
      })
      .catch(() => {});

    return () => sub.subscription.unsubscribe();
  }, [findActive]);

  async function handleLogout() {
    await supabase.auth.signOut();
    setProfile(EMPTY_PROFILE);
    setStage("intro");
  }

  function handleGetStarted() {
    if (authUserId) setStage("home");
    else setStage("login");
  }

  function handleLoginSuccess() {
    setStage("home");
    refreshFriends();
  }

  // After OAuth callback, auto-advance from intro/login to home and load friends.
  useEffect(() => {
    if (!authUserId) return;
    if (stage === "intro" || stage === "login") setStage("home");
    refreshFriends();
    refreshBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId]);

  // Reset add-friend state whenever the session changes
  useEffect(() => {
    setFriendStatus("idle");
    setIncomingFriendRequest(false);
  }, [session?.id]);

  const refreshFriends = async () => {
    const cid = clientIdRef.current;
    if (!cid) return;
    try {
      const { friends: f } = await listFriendsCall({ data: { clientId: cid } });
      setFriends(f as Friend[]);
    } catch {
      // ignore
    }
  };

  async function onAddFriend() {
    if (!session) return;
    const wasIncoming = incomingFriendRequest;
    setFriendStatus("pending");
    setIncomingFriendRequest(false);
    // Notify partner so they see an Accept/Decline prompt
    typingChannelRef.current?.send({
      type: "broadcast",
      event: "friend-request",
      payload: { from: clientIdRef.current },
    });
    try {
      const res = await addFriendCall({
        data: {
          sessionId: session.id,
          clientId: clientIdRef.current,
          profile,
        },
      });
      if (res.mutual) {
        setFriendStatus("mutual");
        refreshFriends();
      } else if (wasIncoming) {
        // Edge case — partner add hadn't been recorded yet; keep pending
      }
    } catch {
      setFriendStatus("idle");
    }
  }

  function onDeclineFriendRequest() {
    setIncomingFriendRequest(false);
    typingChannelRef.current?.send({
      type: "broadcast",
      event: "friend-decline",
      payload: { from: clientIdRef.current },
    });
  }

  async function onRemoveFriend(otherId: string) {
    await removeFriendCall({
      data: { clientId: clientIdRef.current, otherId },
    });
    setFriends((prev) => prev.filter((f) => f.clientId !== otherId));
  }

  function goHome() {
    if (rematchTimerRef.current) {
      clearTimeout(rematchTimerRef.current);
      rematchTimerRef.current = null;
    }
    setStage("home");
    setSession(null);
    setMessages([]);
    setEndedReason(null);
    setPartnerTyping(false);
  }

  async function onReturnHomeFromMatching() {
    await leaveQ({ data: { clientId: clientIdRef.current } }).catch(() => {});
    goHome();
  }

  async function onReturnHomeFromDeciding() {
    if (session) {
      await leaveS({
        data: { sessionId: session.id, clientId: clientIdRef.current },
      }).catch(() => {});
    }
    goHome();
  }

  async function openFriends() {
    await refreshFriends();
    setStage("friends");
  }

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
          data: { clientId: clientIdRef.current, profile, lobby: selectedLobby },
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
  }, [stage, profile, join, selectedLobby]);

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
    ch.on("broadcast", { event: "friend-request" }, (msg) => {
      const from = (msg.payload as { from?: string })?.from;
      if (!from || from === cid) return;
      setIncomingFriendRequest(true);
    });
    ch.on("broadcast", { event: "friend-decline" }, (msg) => {
      const from = (msg.payload as { from?: string })?.from;
      if (!from || from === cid) return;
      setFriendStatus("idle");
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
    if (rematchTimerRef.current) {
      clearTimeout(rematchTimerRef.current);
      rematchTimerRef.current = null;
    }
    saveProfile(p);
    setProfile(p);
    setSession(null);
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
      setStage("ended");
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
    rematchTimerRef.current = setTimeout(() => startMatching(profile), 600);
    return () => {
      if (rematchTimerRef.current) {
        clearTimeout(rematchTimerRef.current);
        rematchTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-20" />
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[var(--neon-pink)] opacity-20 blur-3xl animate-blob" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-[var(--neon-cyan)] opacity-20 blur-3xl animate-blob [animation-delay:-6s]" />

      <main className="relative mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-6">
        <Header
          onHome={stage === "home" || stage === "intro" || stage === "login" ? undefined : goHome}
          onFriends={stage === "intro" || stage === "login" || !authUserId ? undefined : openFriends}
          friendsCount={friends.length}
        />
        <div className="flex flex-1 items-center justify-center">
          {stage === "intro" && (
            <IntroScreen onStart={handleGetStarted} />
          )}
          {stage === "login" && (
            <LoginScreen
              onSuccess={handleLoginSuccess}
              onBack={() => setStage("intro")}
            />
          )}
          {stage === "home" && (
            <HomeScreen
              initial={profile}
              onStart={startMatching}
              onFriends={openFriends}
              onLogout={handleLogout}
              friendsCount={friends.length}
              onSave={saveProfileToDb}
            />
          )}
          {stage === "matching" && (
            <MatchingScreen
              onCancel={onCancelMatching}
              onReturnHome={onReturnHomeFromMatching}
            />
          )}
          {stage === "deciding" && session && (
            <DecisionScreen
              session={session}
              clientId={clientIdRef.current}
              now={now}
              onDecide={onDecide}
              onReturnHome={onReturnHomeFromDeciding}
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
              onAddFriend={onAddFriend}
              onDeclineFriend={onDeclineFriendRequest}
              incomingFriendRequest={incomingFriendRequest}
              friendStatus={friendStatus}
              partnerTyping={partnerTyping}
            />
          )}
          {stage === "ended" && (
            <EndedScreen reason={endedReason} />
          )}
          {stage === "friends" && (
            <FriendsScreen
              friends={friends}
              onBack={() => setStage(profile.nickname ? "home" : "intro")}
              onRemove={onRemoveFriend}
              onRefresh={refreshFriends}
              onOpenChat={(f) => {
                setActiveFriend(f);
                setStage("friend-chat");
              }}
            />
          )}
          {stage === "friend-chat" && activeFriend && (
            <FriendChatScreen
              friend={activeFriend}
              clientId={clientIdRef.current}
              onBack={() => {
                setActiveFriend(null);
                setStage("friends");
              }}
            />
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
function Header({
  onHome,
  onFriends,
  friendsCount,
}: {
  onHome?: () => void;
  onFriends?: () => void;
  friendsCount: number;
}) {
  return (
    <header className="mb-6 flex items-center justify-between">
      <button
        type="button"
        onClick={onHome}
        disabled={!onHome}
        className="flex items-center gap-2 rounded-lg disabled:cursor-default"
        aria-label="Home"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--gradient-accent)] glow-pink">
          <Zap className="h-5 w-5 text-background" strokeWidth={3} />
        </div>
        <div className="text-left">
          <h1 className="text-xl font-black tracking-tight">
            <span className="text-gradient">blink</span>
          </h1>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            mutual match · 5s
          </p>
        </div>
      </button>
      <div className="flex items-center gap-2">
        {onFriends && (
          <Button
            variant="outline"
            size="sm"
            onClick={onFriends}
            className="h-8 gap-1.5 border-[var(--neon-pink)]/40 bg-transparent text-xs hover:bg-[var(--neon-pink)]/10"
          >
            <Users className="h-3.5 w-3.5" />
            Friends
            {friendsCount > 0 && (
              <span className="ml-0.5 rounded-full bg-[var(--neon-pink)]/20 px-1.5 text-[10px] font-bold text-[var(--neon-pink)]">
                {friendsCount}
              </span>
            )}
          </Button>
        )}
        <Badge variant="outline" className="border-[var(--neon-cyan)]/40 text-[var(--neon-cyan)]">
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--neon-cyan)] animate-pulse" />
          live
        </Badge>
      </div>
    </header>
  );
}

// ─── Home / Profile ────────────────────────────────────────────────────────
function HomeScreen({
  initial,
  onStart,
  onFriends,
  onLogout,
  friendsCount,
  onSave,
}: {
  initial: Profile;
  onStart: (p: Profile) => void;
  onFriends: () => void;
  onLogout: () => void;
  friendsCount: number;
  onSave: (p: Profile) => Promise<void>;
}) {
  const [nickname, setNickname] = useState(initial.nickname);
  const [age, setAge] = useState<string>(initial.age != null ? String(initial.age) : "");
  const [country, setCountry] = useState(initial.country);
  const [gender, setGender] = useState<Profile["gender"]>(initial.gender);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const createUploadUrl = useServerFn(createAvatarUploadUrlFn);

  const ageNum = Number.parseInt(age, 10);
  const ageValid = Number.isFinite(ageNum) && ageNum >= 18 && ageNum <= 120;
  const valid = nickname.trim().length >= 1 && nickname.trim().length <= 24 && ageValid;

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

  async function handleStart() {
    if (!valid) return;
    setError(null);
    setSaving(true);
    const p: Profile = {
      nickname: nickname.trim(),
      age: ageNum,
      country,
      gender,
      avatarUrl,
    };
    try {
      await onSave(p);
      onStart(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full max-w-md animate-fade-up">
      <div className="mb-8 text-center">
        <h2 className="mb-3 text-5xl font-black leading-none tracking-tight md:text-6xl">
          Set up your <span className="text-gradient">profile</span>.
        </h2>
        <p className="text-sm text-muted-foreground">
          Both of you have 5 seconds to accept. No swiping, no waiting.
        </p>
      </div>

      <div className="space-y-5 rounded-2xl border border-border bg-[var(--gradient-card)] p-6 shadow-2xl">
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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Nickname
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
              Age (18+)
            </label>
            <Input
              type="number"
              inputMode="numeric"
              min={18}
              max={120}
              value={age}
              onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))}
              placeholder="18"
              className="h-12 bg-input/60 text-base"
            />
          </div>
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

        {error && (
          <p className="text-center text-xs text-destructive">{error}</p>
        )}

        <Button
          disabled={!valid || uploading || saving}
          onClick={handleStart}
          variant="outline"
          className="h-14 w-full gap-2 border-[var(--neon-pink)]/40 bg-transparent text-base font-bold hover:bg-[var(--neon-pink)]/10"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5 text-[var(--neon-pink)]" />}
          Start Chat
        </Button>

        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={onFriends}
            variant="outline"
            className="h-12 gap-2 border-[var(--neon-pink)]/40 bg-transparent text-sm font-bold hover:bg-[var(--neon-pink)]/10"
          >
            <Users className="h-4 w-4" />
            My friends
            {friendsCount > 0 && (
              <span className="rounded-full bg-[var(--neon-pink)]/20 px-2 text-[10px] font-bold text-[var(--neon-pink)]">
                {friendsCount}
              </span>
            )}
          </Button>
          <Button
            onClick={onLogout}
            variant="outline"
            className="h-12 gap-2 border-border/60 bg-transparent text-sm font-bold text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>

        <p className="text-center text-[10px] text-muted-foreground">
          Be kind. Reports & blocks keep the community safe. 18+ only.
        </p>
      </div>
    </div>
  );
}

// ─── Matching ──────────────────────────────────────────────────────────────
function MatchingScreen({
  onCancel,
  onReturnHome,
}: {
  onCancel: () => void;
  onReturnHome: () => void;
}) {
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
      <div className="flex flex-col items-center gap-2">
        <Button variant="ghost" onClick={onCancel} className="text-muted-foreground">
          Cancel
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onReturnHome}
          className="gap-1.5 border-border/60 bg-transparent text-xs"
        >
          <Home className="h-3.5 w-3.5" />
          Return to home
        </Button>
      </div>
    </div>
  );
}

// ─── Decision ──────────────────────────────────────────────────────────────
function DecisionScreen({
  session,
  clientId,
  now,
  onDecide,
  onReturnHome,
}: {
  session: SessionRow;
  clientId: string;
  now: number;
  onDecide: (d: "accept" | "skip") => void;
  onReturnHome: () => void;
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
      <div className="mt-3 flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={onReturnHome}
          className="gap-1.5 text-xs text-muted-foreground"
        >
          <Home className="h-3.5 w-3.5" />
          Return to home
        </Button>
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
  onAddFriend,
  onDeclineFriend,
  incomingFriendRequest,
  friendStatus,
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
  onAddFriend: () => void;
  onDeclineFriend: () => void;
  incomingFriendRequest: boolean;
  friendStatus: "idle" | "pending" | "mutual";
}) {
  const isA = session.user_a_client_id === clientId;
  const otherNick = isA ? session.user_b_nickname : session.user_a_nickname;
  const otherAvatar = isA ? session.user_b_avatar_url : session.user_a_avatar_url;
  const otherCountry = isA ? session.user_b_country : session.user_a_country;
  const country = useMemo(() => findCountry(otherCountry), [otherCountry]);
  const [emojiOpen, setEmojiOpen] = useState(false);

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
            onClick={onAddFriend}
            disabled={friendStatus !== "idle"}
            title={
              friendStatus === "mutual"
                ? "You are friends"
                : friendStatus === "pending"
                  ? "Friend request sent"
                  : "Add friend"
            }
            className={
              "h-9 w-9 " +
              (friendStatus === "mutual"
                ? "text-[var(--neon-lime)]"
                : friendStatus === "pending"
                  ? "text-[var(--neon-cyan)]"
                  : "text-muted-foreground hover:text-[var(--neon-pink)]")
            }
          >
            {friendStatus === "mutual" ? (
              <ShieldCheck className="h-4 w-4" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
          </Button>
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

      {incomingFriendRequest && friendStatus === "idle" && (
        <div className="flex items-center gap-3 border-b border-border bg-[var(--neon-pink)]/10 px-3 py-2.5">
          <UserPlus className="h-4 w-4 shrink-0 text-[var(--neon-pink)]" />
          <p className="flex-1 text-xs font-semibold">
            {(session.user_a_client_id === clientId
              ? session.user_b_nickname
              : session.user_a_nickname)}{" "}
            wants to add you as a friend
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={onAddFriend}
            className="h-7 gap-1 border-[var(--neon-pink)]/40 bg-transparent px-3 text-xs font-bold hover:bg-[var(--neon-pink)]/10"
          >
            Accept
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDeclineFriend}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
          >
            Decline
          </Button>
        </div>
      )}

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

      <div className="relative flex items-center gap-2 border-t border-border p-3">
        {emojiOpen && (
          <div className="absolute bottom-[4.25rem] left-3 grid grid-cols-7 gap-1 rounded-xl border border-border bg-popover p-2 shadow-2xl">
            {CHAT_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setDraft(`${draft}${emoji}`);
                  setEmojiOpen(false);
                  onTyping();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-lg hover:bg-secondary"
                aria-label={`Add ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setEmojiOpen((open) => !open)}
          className="h-11 w-11 shrink-0 text-muted-foreground hover:text-[var(--neon-pink)]"
          title="Emoji"
        >
          <Smile className="h-5 w-5" />
        </Button>
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

// ─── Intro / Landing ───────────────────────────────────────────────────────
function IntroScreen({
  onStart,
}: {
  onStart: () => void;
}) {
  const features = [
    {
      icon: <Clock className="h-5 w-5 text-[var(--neon-pink)]" />,
      title: "5-second match",
      body: "Both of you tap accept within 5 seconds — or the match disappears.",
    },
    {
      icon: <Globe2 className="h-5 w-5 text-[var(--neon-cyan)]" />,
      title: "Anyone, anywhere",
      body: "Anonymous strangers from around the world. No accounts, no waiting.",
    },
    {
      icon: <UserPlus className="h-5 w-5 text-[var(--neon-lime)]" />,
      title: "Add friends",
      body: "Click after a great chat — if you both add, you become friends.",
    },
    {
      icon: <ShieldCheck className="h-5 w-5 text-[var(--neon-pink)]" />,
      title: "Stay safe",
      body: "Report or block in one tap. Blocked users never match with you again.",
    },
  ];

  return (
    <div className="w-full max-w-2xl animate-fade-up">
      <div className="mb-10 text-center">
        <Badge
          variant="outline"
          className="mb-4 border-[var(--neon-cyan)]/40 text-[var(--neon-cyan)]"
        >
          <Sparkles className="mr-1 h-3 w-3" /> anonymous · instant · 1-on-1
        </Badge>
        <h2 className="mb-4 text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
          Talk to a <span className="text-gradient">stranger</span>
          <br />
          in 5 seconds.
        </h2>
        <p className="mx-auto max-w-md text-base text-muted-foreground">
          Blink pairs you with one random person. You both decide in 5 seconds.
          If you both tap accept, the chat opens.
        </p>
      </div>

      <div className="mb-8 flex justify-center">
        <Button
          onClick={onStart}
          variant="outline"
          className="h-14 w-full max-w-xs gap-2 border-[var(--neon-pink)]/40 bg-transparent text-base font-bold hover:bg-[var(--neon-pink)]/10 sm:w-auto sm:px-10"
        >
          <Sparkles className="h-5 w-5 text-[var(--neon-pink)]" />
          Get started
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-border bg-[var(--gradient-card)] p-4 shadow-lg"
          >
            <div className="mb-2 flex items-center gap-2">
              {f.icon}
              <p className="text-sm font-bold">{f.title}</p>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        be kind · 18+ · anonymous
      </p>
    </div>
  );
}

// ─── Friends ───────────────────────────────────────────────────────────────
function FriendsScreen({
  friends,
  onBack,
  onRemove,
  onRefresh,
  onOpenChat,
}: {
  friends: Friend[];
  onBack: () => void;
  onRemove: (id: string) => void;
  onRefresh: () => void;
  onOpenChat: (f: Friend) => void;
}) {
  useEffect(() => {
    onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full max-w-md animate-fade-up">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Back
      </button>

      <div className="mb-6">
        <h2 className="text-3xl font-black tracking-tight">
          Your <span className="text-gradient">friends</span>
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          When you both tap add friend during a chat, you'll show up here.
        </p>
      </div>

      <div className="space-y-2 rounded-2xl border border-border bg-[var(--gradient-card)] p-3 shadow-2xl">
        {friends.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <MessageCircle className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-semibold">No friends yet</p>
            <p className="text-xs text-muted-foreground">
              Match, chat, and tap the add-friend icon together.
            </p>
          </div>
        )}
        {friends.map((f) => {
          const country = findCountry(f.country);
          return (
            <div
              key={f.clientId}
              className="flex items-center gap-3 rounded-xl bg-background/40 p-3"
            >
              <button
                type="button"
                onClick={() => onOpenChat(f)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                title="Open chat"
              >
                <Avatar nickname={f.nickname || "?"} avatarUrl={f.avatarUrl} small />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-bold">
                    {f.nickname || "stranger"}
                    {country && <span title={country.name}>{country.flag}</span>}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    friends since {new Date(f.since).toLocaleDateString()}
                  </p>
                </div>
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChat(f)}
                title="Chat"
                className="h-9 w-9 text-muted-foreground hover:text-[var(--neon-pink)]"
              >
                <MessageCircle className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemove(f.clientId)}
                title="Remove friend"
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Friend Chat ───────────────────────────────────────────────────────────
type FriendMessage = {
  id: string;
  pair_key: string;
  from_client_id: string;
  to_client_id: string;
  content: string;
  created_at: string;
};

function FriendChatScreen({
  friend,
  clientId,
  onBack,
}: {
  friend: Friend;
  clientId: string;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<FriendMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const sendFn = useServerFn(sendFriendMessageFn);
  const listFn = useServerFn(listFriendMessagesFn);
  const scrollRef = useRef<HTMLDivElement>(null);
  const country = useMemo(() => findCountry(friend.country), [friend.country]);

  const pairKey = useMemo(() => {
    const [a, b] = clientId < friend.clientId
      ? [clientId, friend.clientId]
      : [friend.clientId, clientId];
    return `${a}:${b}`;
  }, [clientId, friend.clientId]);

  // initial load
  useEffect(() => {
    listFn({ data: { clientId, otherId: friend.clientId } })
      .then((res) => setMessages(res.messages as FriendMessage[]))
      .catch(() => {});
  }, [clientId, friend.clientId, listFn]);

  // realtime
  useEffect(() => {
    const ch = supabase
      .channel(`friend-msgs-${pairKey}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "friend_messages",
          filter: `pair_key=eq.${pairKey}`,
        },
        (payload) => {
          setMessages((m) => {
            const next = payload.new as FriendMessage;
            if (m.some((x) => x.id === next.id)) return m;
            return [...m, next];
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [pairKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function onSend() {
    const content = draft.trim();
    if (!content) return;
    setDraft("");
    try {
      await sendFn({
        data: { clientId, otherId: friend.clientId, content },
      });
    } catch {
      setDraft(content);
    }
  }

  return (
    <div className="flex h-[80vh] w-full max-w-md animate-fade-up flex-col overflow-hidden rounded-2xl border border-border bg-[var(--gradient-card)] shadow-2xl">
      <div className="flex items-center gap-3 border-b border-border px-3 py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          title="Back to friends"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar nickname={friend.nickname || "?"} avatarUrl={friend.avatarUrl} small />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-bold">
            {friend.nickname || "friend"}
            {country && <span title={country.name}>{country.flag}</span>}
          </p>
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--neon-lime)]">
            <ShieldCheck className="h-3 w-3" /> friend
          </p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2 p-4">
          {messages.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No messages yet. Say hi 👋
            </p>
          )}
          {messages.map((m) => {
            const mine = m.from_client_id === clientId;
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
        </div>
      </div>

      <div className="relative flex items-center gap-2 border-t border-border p-3">
        {emojiOpen && (
          <div className="absolute bottom-[4.25rem] left-3 grid grid-cols-7 gap-1 rounded-xl border border-border bg-popover p-2 shadow-2xl">
            {CHAT_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setDraft(`${draft}${emoji}`);
                  setEmojiOpen(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-lg hover:bg-secondary"
                aria-label={`Add ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setEmojiOpen((o) => !o)}
          className="h-11 w-11 shrink-0 text-muted-foreground hover:text-[var(--neon-pink)]"
          title="Emoji"
        >
          <Smile className="h-5 w-5" />
        </Button>
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

// ─── Login / Signup ────────────────────────────────────────────────────────

function LoginScreen({
  onSuccess,
  onBack,
}: {
  onSuccess: () => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email.trim() || password.length < 6) {
      setError("Enter a valid email and a password (6+ chars).");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        // auto-confirm is on, so a session should exist
        const { data } = await supabase.auth.getSession();
        if (data.session) onSuccess();
        else setInfo("Account created. Please sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        setError(result.error.message ?? "Google sign-in failed");
        setLoading(false);
        return;
      }
      if (result.redirected) return; // browser will navigate
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md animate-fade-up">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Back
      </button>
      <div className="mb-6 text-center">
        <h2 className="mb-2 text-4xl font-black leading-none tracking-tight md:text-5xl">
          {mode === "signin" ? (
            <>Welcome <span className="text-gradient">back</span>.</>
          ) : (
            <>Join <span className="text-gradient">blink</span>.</>
          )}
        </h2>
        <p className="text-sm text-muted-foreground">
          {mode === "signin"
            ? "Sign in to start matching."
            : "Create an account to start matching. 18+ only."}
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-[var(--gradient-card)] p-6 shadow-2xl">
        <Button
          onClick={handleGoogle}
          disabled={loading}
          variant="outline"
          className="h-12 w-full gap-2 border-[var(--neon-pink)]/40 bg-transparent text-sm font-bold hover:bg-[var(--neon-pink)]/10"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
            <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.5-1.7 4.4-5.5 4.4-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.7 14.6 2.7 12 2.7 6.9 2.7 2.8 6.8 2.8 12s4.1 9.3 9.2 9.3c5.3 0 8.8-3.7 8.8-8.9 0-.6-.06-1-.14-1.5H12z"/>
          </svg>
          Continue with Google
        </Button>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleEmail} className="space-y-3">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-12 bg-input/60"
            autoComplete="email"
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (6+ chars)"
            className="h-12 bg-input/60"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          {info && <p className="text-xs text-[var(--neon-cyan)]">{info}</p>}
          <Button
            type="submit"
            disabled={loading}
            className="h-12 w-full gap-2 bg-[var(--gradient-accent)] text-base font-bold text-background hover:opacity-90"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setInfo(null);
          }}
          className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "signin"
            ? "No account? Create one"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
