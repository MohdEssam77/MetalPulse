import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Settings, Send, KeyRound, Trash2 } from "lucide-react";
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
          toast.error("AI request blocked or rate-limited. Add your own Gemini API key in settings.");
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
        toast.success("Saved API key on this device.");
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
        toast.success("Removed API key from this device.");
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
            <MessageCircle className="h-5 w-5" />
          </Button>
        </DialogTrigger>

        <DialogContent className="w-[95vw] max-w-lg p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-foreground">MetalPulse AI</div>
              <div className="text-xs text-muted-foreground">Market analyst mode • Not financial advice</div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={clearChat}
                aria-label="Clear chat"
                title="Clear chat"
              >
                <Trash2 className="h-4 w-4" />
              </Button>

              <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Chat settings" title="Settings">
                    <Settings className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[95vw] max-w-md">
                  <DialogHeader>
                    <DialogTitle>AI Settings</DialogTitle>
                  </DialogHeader>

                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">
                      If the default key is rate-limited, you can paste your own Gemini API key. It’s stored only in your browser.
                    </div>

                    <label className="block text-sm font-medium text-foreground">Gemini API Key</label>
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

                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="secondary" onClick={() => setSettingsOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={saveKey}>Save</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <ScrollArea className="h-[55vh] px-4 py-3">
            <div className="space-y-3">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={
                    m.role === "user"
                      ? "ml-auto max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : "mr-auto max-w-[85%] rounded-2xl bg-secondary px-3 py-2 text-sm text-foreground"
                  }
                >
                  {m.content}
                </div>
              ))}
              <div ref={listRef} />
            </div>
          </ScrollArea>

          <div className="border-t border-border p-3">
            <div className="flex items-end gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask about metals/ETFs and what the news might imply..."
                className="min-h-[44px] resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
              />
              <Button onClick={sendMessage} disabled={!canSend} className="h-11 px-3" aria-label="Send">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
