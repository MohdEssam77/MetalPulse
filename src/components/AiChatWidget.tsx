import { useEffect, useMemo, useRef, useState } from "react";
import { Send, KeyRound, Trash2, Bot, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

const STORAGE_KEY = "metalpulse_gemini_api_key";

function cleanKey(v: string) {
  return v.trim();
}

export default function AiChatWidget() {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState<string>("");

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Ask me about gold/silver/platinum/palladium and popular metal ETFs. I can summarize what the latest prices imply and how recent news might affect them. This is not financial advice.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setApiKey(saved);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      listRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 50);
    return () => clearTimeout(t);
  }, [open, messages.length]);

  const canSend = useMemo(() => {
    return !isSending && draft.trim().length > 0;
  }, [draft, isSending]);

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
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages,
          apiKey: cleanKey(apiKey) || undefined,
        }),
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
      if (!reply.trim()) {
        toast.error("AI response was empty.");
        return;
      }

      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e) {
      toast.error(`AI request failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsSending(false);
    }
  }

  function saveKey() {
    try {
      const v = cleanKey(apiKey);
      if (v) {
        window.localStorage.setItem(STORAGE_KEY, v);
        toast.success("API key saved on this device.");
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
        toast.success("API key removed.");
      }
      setSettingsOpen(false);
    } catch {
      toast.error("Could not save API key.");
    }
  }

  function clearChat() {
    setMessages((m) => (m.length ? [m[0]!] : m));
  }

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
          <div className="flex items-center justify-between bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border/60 px-4 py-3 pr-12">
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
              <Button
                variant="ghost"
                size="icon"
                onClick={clearChat}
                aria-label="Clear chat"
                title="Clear chat"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="h-4 w-4" />
              </Button>

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
                    {/* Steps */}
                    <div className="rounded-xl bg-muted/50 p-4 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">How to get a free Gemini API key</p>
                      <ol className="space-y-2.5">
                        {[
                          <>Go to <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary underline underline-offset-2 hover:opacity-80">Google AI Studio <ExternalLink className="h-3 w-3" /></a></>,
                          <>Sign in with your Google account</>,
                          <>Click <span className="font-semibold text-foreground">"Create API key"</span></>,
                          <>Copy the key and paste it below</>,
                        ].map((step, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                              {i + 1}
                            </span>
                            <span className="pt-0.5">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    {/* Input */}
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">Your Gemini API Key</label>
                      <div className="relative">
                        <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder="AIza..."
                          className="pl-10"
                          type="password"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Stored only in your browser. Never sent anywhere except Google.</p>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setSettingsOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={saveKey}>Save Key</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

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

          {/* Input */}
          <div className="border-t border-border/60 bg-background/80 p-3">
            <div className="flex items-end gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask about metals/ETFs and what the news might imply..."
                className="min-h-[44px] resize-none rounded-xl border-border/60 bg-muted/50 text-sm focus-visible:ring-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
              />
              <Button
                onClick={sendMessage}
                disabled={!canSend}
                className="h-11 w-11 shrink-0 rounded-xl p-0"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
