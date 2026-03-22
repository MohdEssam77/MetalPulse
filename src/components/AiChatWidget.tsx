import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, KeyRound, Trash2, Bot, ExternalLink, History, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };
type SessionSummary = { id: string; title: string; updated_at: string };

const API_KEY_STORAGE  = "metalpulse_gemini_api_key";
const USER_ID_STORAGE  = "metalpulse_chat_user_id";
const SESSION_STORAGE  = "metalpulse_chat_session_id";

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Ask me about gold/silver/platinum/palladium and popular metal ETFs. I can summarize what the latest prices imply and how recent news might affect them. This is not financial advice.",
};

function cleanKey(v: string) { return v.trim(); }

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function getUserId(): string {
  try {
    let id = localStorage.getItem(USER_ID_STORAGE);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(USER_ID_STORAGE, id); }
    return id;
  } catch { return "anonymous"; }
}

export default function AiChatWidget() {
  const userId = useMemo(() => getUserId(), []);

  const [open, setOpen]               = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen]  = useState(false);

  const [apiKey, setApiKey]       = useState<string>("");
  const [messages, setMessages]   = useState<ChatMessage[]>([GREETING]);
  const [draft, setDraft]         = useState("");
  const [isSending, setIsSending] = useState(false);

  const [sessions, setSessions]               = useState<SessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const sessionsLoadedRef = useRef(false);

  const listRef = useRef<HTMLDivElement | null>(null);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(API_KEY_STORAGE);
      if (saved) setApiKey(saved);
      const sid = localStorage.getItem(SESSION_STORAGE);
      if (sid) setCurrentSessionId(sid);
    } catch { /* ignore */ }
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      listRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 50);
    return () => clearTimeout(t);
  }, [open, messages.length]);

  // ── Session helpers ───────────────────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    try {
      const r = await fetch(`/api/ai/sessions?userId=${encodeURIComponent(userId)}`);
      if (!r.ok) return;
      const d = await r.json() as { sessions: SessionSummary[] };
      setSessions(d.sessions ?? []);
    } catch { /* ignore */ }
  }, [userId]);

  useEffect(() => {
    if (open && !sessionsLoadedRef.current) {
      sessionsLoadedRef.current = true;
      void fetchSessions();
    }
  }, [open, fetchSessions]);

  async function createSession(msgs: ChatMessage[], firstUserMsg: string): Promise<string | null> {
    try {
      const r = await fetch("/api/ai/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId,
          title: firstUserMsg.slice(0, 120),
          messages: msgs,
        }),
      });
      if (!r.ok) return null;
      const d = await r.json() as { session: { id: string; title: string; updated_at: string } };
      const s = d.session;
      setSessions((prev) => [{ id: s.id, title: s.title, updated_at: s.updated_at ?? new Date().toISOString() }, ...prev].slice(0, 5));
      try { localStorage.setItem(SESSION_STORAGE, s.id); } catch { /* ignore */ }
      return s.id;
    } catch { return null; }
  }

  async function updateSession(id: string, msgs: ChatMessage[]) {
    try {
      await fetch(`/api/ai/sessions/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: msgs }),
      });
      setSessions((prev) =>
        prev.map((s) => s.id === id ? { ...s, updated_at: new Date().toISOString() } : s)
      );
    } catch { /* ignore */ }
  }

  async function deleteSession(id: string) {
    try {
      await fetch(`/api/ai/sessions/${id}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (currentSessionId === id) startNewChat();
    } catch { toast.error("Could not delete session."); }
  }

  async function loadSession(id: string) {
    try {
      const r = await fetch(`/api/ai/sessions/${id}`);
      if (!r.ok) return;
      const d = await r.json() as { session: { messages: ChatMessage[] } };
      setMessages([GREETING, ...d.session.messages.filter((m) => m.role !== "assistant" || m.content !== GREETING.content)]);
      setCurrentSessionId(id);
      try { localStorage.setItem(SESSION_STORAGE, id); } catch { /* ignore */ }
      setSidebarOpen(false);
    } catch { toast.error("Could not load session."); }
  }

  function startNewChat() {
    setMessages([GREETING]);
    setCurrentSessionId(null);
    setDraft("");
    try { localStorage.removeItem(SESSION_STORAGE); } catch { /* ignore */ }
    setSidebarOpen(false);
  }

  // ── Send message ──────────────────────────────────────────────────────────
  const canSend = useMemo(() => !isSending && draft.trim().length > 0, [draft, isSending]);

  async function sendMessage() {
    const text = draft.trim();
    if (!text || isSending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setDraft("");
    setIsSending(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, apiKey: cleanKey(apiKey) || undefined }),
      });

      const payload = (await res.json().catch(() => null)) as any;

      if (!res.ok) {
        const msg = payload?.error ? String(payload.error) : res.statusText;
        if (res.status === 401 || res.status === 403 || res.status === 429) {
          toast.error("AI request blocked or rate-limited. Add your own Gemini API key.");
          setSettingsOpen(true);
        } else {
          toast.error(`AI request failed: ${msg}`);
        }
        return;
      }

      const reply = typeof payload?.reply === "string" ? payload.reply : "";
      if (!reply.trim()) { toast.error("AI response was empty."); return; }

      const finalMessages: ChatMessage[] = [...nextMessages, { role: "assistant", content: reply }];
      setMessages(finalMessages);

      // Persist to Supabase
      const userMessages = finalMessages.filter((m) => m.role === "user");
      const isFirstUserMsg = userMessages.length === 1;
      if (isFirstUserMsg) {
        const sid = await createSession(finalMessages, text);
        if (sid) setCurrentSessionId(sid);
      } else if (currentSessionId) {
        await updateSession(currentSessionId, finalMessages);
      }
    } catch (e) {
      toast.error(`AI request failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsSending(false);
    }
  }

  // ── API key ───────────────────────────────────────────────────────────────
  function saveKey() {
    try {
      const v = cleanKey(apiKey);
      if (v) { localStorage.setItem(API_KEY_STORAGE, v); toast.success("API key saved on this device."); }
      else { localStorage.removeItem(API_KEY_STORAGE); toast.success("API key removed."); }
      setSettingsOpen(false);
    } catch { toast.error("Could not save API key."); }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="h-12 w-12 rounded-full p-0 shadow-lg" aria-label="Open AI chat">
            <Bot className="h-7 w-7" />
          </Button>
        </DialogTrigger>

        <DialogContent className="flex h-[80vh] w-[95vw] max-w-2xl flex-col overflow-hidden rounded-2xl border border-border/60 p-0 shadow-2xl md:h-[85vh] md:w-[85vw] md:max-w-3xl lg:h-[90vh] lg:w-[80vw] lg:max-w-4xl">

          {/* Header */}
          <div className="flex shrink-0 items-center justify-between bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border/60 px-4 py-3 pr-12">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">MetalPulse AI</div>
                <div className="text-xs text-muted-foreground">Market analyst • Not financial advice</div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* History toggle */}
              <Button
                variant={sidebarOpen ? "secondary" : "ghost"}
                size="sm"
                className="h-8 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setSidebarOpen((v) => !v)}
                title="Chat history"
              >
                <History className="h-3.5 w-3.5" />
                History
              </Button>

              {/* Your API key */}
              <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                    title="Set your own API key"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Your API
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[95vw] max-w-md rounded-2xl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <KeyRound className="h-5 w-5 text-primary" />
                      Use Your Own API Key
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="rounded-xl bg-muted/50 p-4 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">How to get a free Gemini API key</p>
                      <ol className="space-y-2.5">
                        {[
                          <> Go to <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary underline underline-offset-2 hover:opacity-80">Google AI Studio <ExternalLink className="h-3 w-3" /></a></>,
                          <>Sign in with your Google account</>,
                          <>Click <span className="font-semibold text-foreground">"Create API key"</span></>,
                          <>Copy the key and paste it below</>,
                        ].map((step, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">{i + 1}</span>
                            <span className="pt-0.5">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">Your Gemini API Key</label>
                      <div className="relative">
                        <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="AIza..." className="pl-10" type="password" />
                      </div>
                      <p className="text-xs text-muted-foreground">Stored only in your browser. Never sent anywhere except Google.</p>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setSettingsOpen(false)}>Cancel</Button>
                      <Button onClick={saveKey}>Save Key</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Body = sidebar + messages */}
          <div className="flex flex-1 overflow-hidden">

            {/* Sidebar */}
            {sidebarOpen && (
              <div className="flex w-52 shrink-0 flex-col border-r border-border/60 bg-muted/30">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent chats</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="mx-2 mt-2 h-8 justify-start gap-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={startNewChat}
                >
                  <Plus className="h-3.5 w-3.5" />
                  New chat
                </Button>

                <ScrollArea className="flex-1 px-2 py-1">
                  {sessions.length === 0 && (
                    <p className="px-2 py-4 text-center text-xs text-muted-foreground">No saved chats yet.</p>
                  )}
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      className={`group relative mb-1 flex cursor-pointer flex-col rounded-lg px-2.5 py-2 transition-colors hover:bg-muted ${currentSessionId === s.id ? "bg-muted" : ""}`}
                      onClick={() => loadSession(s.id)}
                    >
                      <span className="line-clamp-2 text-xs font-medium text-foreground leading-snug pr-5">{s.title}</span>
                      <span className="mt-0.5 text-[10px] text-muted-foreground">{timeAgo(s.updated_at)}</span>
                      <button
                        className="absolute right-1.5 top-1.5 hidden h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-destructive group-hover:flex"
                        onClick={(e) => { e.stopPropagation(); void deleteSession(s.id); }}
                        aria-label="Delete session"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </ScrollArea>
              </div>
            )}

            {/* Messages */}
            <ScrollArea className="flex-1 px-4 py-4">
              <div className="space-y-3">
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={
                      m.role === "user"
                        ? "ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm"
                        : "mr-auto max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 text-sm text-foreground shadow-sm"
                    }
                  >
                    {m.content}
                  </div>
                ))}
                {isSending && (
                  <div className="mr-auto flex max-w-[85%] items-center gap-1.5 rounded-2xl rounded-tl-sm bg-muted px-4 py-3 shadow-sm">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                  </div>
                )}
                <div ref={listRef} />
              </div>
            </ScrollArea>
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-border/60 bg-background/80 p-3">
            <div className="flex items-end gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask about metals/ETFs and what the news might imply..."
                className="min-h-[44px] resize-none rounded-xl border-border/60 bg-muted/50 text-sm focus-visible:ring-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); }
                }}
              />
              <Button onClick={sendMessage} disabled={!canSend} className="h-11 w-11 shrink-0 rounded-xl p-0" aria-label="Send">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>

        </DialogContent>
      </Dialog>
    </div>
  );
}
