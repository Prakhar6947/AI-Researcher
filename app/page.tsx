"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import {
  ArrowUp,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  Clipboard,
  Database,
  FileText,
  LayoutDashboard,
  Loader2,
  Paperclip,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";

type ChatMessage = {
  id: string;
  role: "user" | "agent";
  content: string;
};

type ActiveStep = {
  label: string;
  icon: ReactNode;
};

type Library = {
  chunks: number;
  sources: string[];
};

const promptSuggestions = [
  "Give me a concise executive summary.",
  "What are the three most important findings?",
  "What risks, gaps, or open questions should I know about?",
];

function makeMessageId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function getGeneratedAnswer(generator: unknown) {
  if (!generator || typeof generator !== "object") return null;

  const messages = (generator as { messages?: unknown[] }).messages;
  const message = messages?.at(-1);
  if (!message || typeof message !== "object") return null;

  const candidate = message as {
    content?: unknown;
    kwargs?: { content?: unknown };
  };
  const content = candidate.kwargs?.content ?? candidate.content;

  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "object" && part && "text" in part ? String(part.text) : ""))
      .filter(Boolean)
      .join("\n");
  }

  return null;
}

export default function ResearchWorkspace() {
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [activeStep, setActiveStep] = useState<ActiveStep | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [library, setLibrary] = useState<Library>({ chunks: 0, sources: [] });
  const [isClearingLibrary, setIsClearingLibrary] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadLibrary = useCallback(async (): Promise<Library | null> => {
    const response = await fetch("/api/library", { cache: "no-store" });
    if (!response.ok) return null;

    return (await response.json()) as Library;
  }, []);

  useEffect(() => {
    let cancelled = false;

    void loadLibrary().then((data) => {
      if (data && !cancelled) setLibrary(data);
    });

    return () => {
      cancelled = true;
    };
  }, [loadLibrary]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, activeStep]);

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadStatus(`Adding ${file.name}…`);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not upload the document.");

      setUploadStatus(`${file.name} is ready to search.`);
      const updatedLibrary = await loadLibrary();
      if (updatedLibrary) setLibrary(updatedLibrary);
      window.setTimeout(() => setUploadStatus(""), 4500);
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : "Could not upload the document.");
    } finally {
      event.target.value = "";
    }
  };

  const handleClearLibrary = async () => {
    if (!library.chunks || !window.confirm("Remove all uploaded documents from this session?")) return;

    setIsClearingLibrary(true);
    try {
      const response = await fetch("/api/library", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not clear the knowledge base.");

      setLibrary({ chunks: 0, sources: [] });
      setUploadStatus("Knowledge base cleared.");
      window.setTimeout(() => setUploadStatus(""), 3500);
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : "Could not clear the knowledge base.");
    } finally {
      setIsClearingLibrary(false);
    }
  };

  const handleCopy = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId(null), 1800);
    } catch {
      setUploadStatus("Your browser could not copy this response.");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = prompt.trim();
    if (!question || isLoading) return;

    setIsLoading(true);
    setHistory((current) => [...current, { id: makeMessageId(), role: "user", content: question }]);
    setPrompt("");
    setActiveStep({
      label: "Planning the research path…",
      icon: <LayoutDashboard size={17} className="text-indigo-500" />,
    });

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: question }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Unable to start the research agent.");
      }
      if (!response.body) throw new Error("The agent did not return a response stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let pendingChunk = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        pendingChunk += decoder.decode(value, { stream: true });
        const lines = pendingChunk.split("\n");
        pendingChunk = lines.pop() ?? "";

        for (const line of lines) {
          if (!line) continue;
          const update = JSON.parse(line) as Record<string, unknown>;

          if (typeof update.error === "string") throw new Error(update.error);
          if (update.router) {
            setActiveStep({ label: "Understanding your question…", icon: <BrainCircuit size={17} className="text-indigo-500" /> });
          } else if (update.retriever) {
            setActiveStep({ label: "Searching your knowledge base…", icon: <Database size={17} className="text-blue-500" /> });
          } else if (update.webSearch) {
            setActiveStep({ label: "Looking for supporting context…", icon: <Search size={17} className="text-emerald-500" /> });
          } else if (update.critic) {
            const approved = (update.critic as { isContextValid?: boolean }).isContextValid;
            setActiveStep({
              label: approved ? "Checking evidence quality…" : "Finding more relevant context…",
              icon: <ShieldCheck size={17} className={approved ? "text-emerald-500" : "text-amber-500"} />,
            });
          } else if (update.generator) {
            const answer = getGeneratedAnswer(update.generator);
            if (!answer) throw new Error("The agent returned an unreadable response.");
            setHistory((current) => [...current, { id: makeMessageId(), role: "agent", content: answer }]);
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong while researching that question.";
      setHistory((current) => [...current, { id: makeMessageId(), role: "agent", content: `**Unable to answer:** ${message}` }]);
    } finally {
      setIsLoading(false);
      setActiveStep(null);
    }
  };

  return (
    <main className="min-h-screen p-3 sm:p-5 lg:p-7">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-7xl overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_24px_80px_-28px_rgba(15,23,42,0.28)] sm:min-h-[calc(100vh-2.5rem)] lg:min-h-[calc(100vh-3.5rem)]">
        <aside className="hidden w-80 shrink-0 flex-col border-r border-slate-200 bg-slate-50/80 lg:flex">
          <div className="border-b border-slate-200 px-6 py-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-slate-950 shadow-lg shadow-slate-900/15">
                <BrainCircuit size={21} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight text-slate-900">Research desk</p>
                <p className="text-xs text-slate-500">Private document analysis</p>
              </div>
            </div>
          </div>

          <div className="flex-1 p-5">
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
                <Database size={14} /> Knowledge base
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{library.chunks}</p>
              <p className="text-sm text-slate-500">searchable {library.chunks === 1 ? "chunk" : "chunks"}</p>
              <div className="mt-4 h-px bg-indigo-100" />
              <p className="mt-3 text-xs leading-5 text-slate-600">
                Documents stay in memory for this server session.
              </p>
            </div>

            <div className="mt-7">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Your documents</p>
                {library.chunks > 0 && <span className="text-xs font-medium text-slate-500">{library.sources.length}</span>}
              </div>
              {library.sources.length ? (
                <ul className="space-y-2">
                  {library.sources.map((source) => (
                    <li key={source} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm text-slate-600 shadow-sm ring-1 ring-slate-100">
                      <FileText size={16} className="shrink-0 text-indigo-500" />
                      <span className="truncate" title={source}>{source}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-sm leading-5 text-slate-400">
                  Add a PDF or text file to start asking grounded questions.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-200 p-5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              <Paperclip size={16} /> Add document
            </button>
            <button
              type="button"
              onClick={handleClearLibrary}
              disabled={!library.chunks || isClearingLibrary}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isClearingLibrary ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Clear library
            </button>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-white">
          <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-7">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-slate-950 lg:hidden"><BrainCircuit size={16} className="text-white" /></div>
                <h1 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">Agentic research</h1>
              </div>
              <p className="mt-0.5 hidden text-sm text-slate-500 sm:block">Ask grounded questions. Get structured answers.</p>
            </div>
            <div className="flex items-center gap-2">
              {library.chunks > 0 && (
                <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 sm:flex">
                  <CheckCircle2 size={14} /> {library.chunks} chunks ready
                </span>
              )}
              <button
                type="button"
                onClick={() => setHistory([])}
                disabled={!history.length}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                title="Clear conversation"
                aria-label="Clear conversation"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          {uploadStatus && (
            <div className="mx-5 mt-4 flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3.5 py-2.5 text-sm text-indigo-800 sm:mx-7">
              {uploadStatus.includes("ready") || uploadStatus.includes("cleared") ? <CheckCircle2 size={16} className="shrink-0" /> : <Loader2 size={16} className="shrink-0 animate-spin" />}
              <span className="truncate">{uploadStatus}</span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-5 py-7 sm:px-7 sm:py-10">
            <div className="mx-auto max-w-3xl">
              {!history.length ? (
                <div className="py-8 sm:py-14">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                    <Sparkles size={23} />
                  </div>
                  <p className="mt-6 text-3xl font-semibold tracking-tight text-slate-900">Turn documents into decisions.</p>
                  <p className="mt-3 max-w-xl text-base leading-7 text-slate-500">
                    Upload a PDF or text file, then ask a focused question. The research agent will retrieve relevant context and create a structured answer.
                  </p>

                  <div className="mt-8 grid gap-3 sm:grid-cols-3">
                    {promptSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setPrompt(suggestion)}
                        className="rounded-2xl border border-slate-200 bg-white p-4 text-left text-sm leading-6 text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <Sparkles size={16} className="mb-3 text-indigo-500" />
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-7">
                  {history.map((message) => (
                    <article key={message.id} className={`group flex gap-3 sm:gap-4 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                      {message.role === "agent" && (
                        <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                          <Bot size={17} />
                        </div>
                      )}
                      <div className={message.role === "user" ? "max-w-[85%] rounded-2xl rounded-tr-sm bg-slate-950 px-4 py-3 text-white shadow-sm" : "min-w-0 max-w-[calc(100%-3rem)] flex-1 rounded-2xl rounded-tl-sm border border-slate-100 bg-slate-50 px-4 py-3.5 shadow-sm sm:px-5"}>
                        {message.role === "user" ? (
                          <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                        ) : (
                          <>
                            <div className="research-prose text-sm sm:text-[0.95rem]"><ReactMarkdown>{message.content}</ReactMarkdown></div>
                            <div className="mt-3 flex justify-end border-t border-slate-200/70 pt-2">
                              <button
                                type="button"
                                onClick={() => void handleCopy(message)}
                                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-400 transition hover:bg-white hover:text-slate-700"
                              >
                                {copiedMessageId === message.id ? <Check size={14} className="text-emerald-600" /> : <Clipboard size={14} />}
                                {copiedMessageId === message.id ? "Copied" : "Copy"}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                      {message.role === "user" && (
                        <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                          <User size={17} />
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}

              {activeStep && (
                <div className="mt-7 flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3.5 py-3 text-sm text-slate-600">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-white shadow-sm">{activeStep.icon}</span>
                  <span>{activeStep.label}</span>
                  <Loader2 size={15} className="ml-auto animate-spin text-indigo-500" />
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="border-t border-slate-100 bg-white px-5 py-4 sm:px-7 sm:py-5">
            <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
              <input
                type="file"
                accept=".pdf,.txt,text/plain,application/pdf"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-sm transition focus-within:border-indigo-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-50">
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600"
                    title="Add a PDF or text file"
                    aria-label="Add a document"
                  >
                    <Paperclip size={19} />
                  </button>
                  <textarea
                    rows={1}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder={library.chunks ? "Ask about your documents…" : "Upload a document, or ask a general question…"}
                    className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1.5 py-2 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400"
                    disabled={isLoading}
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !prompt.trim()}
                    className="mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                    title="Send message"
                    aria-label="Send message"
                  >
                    {isLoading ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} />}
                  </button>
                </div>
              </div>
              <p className="mt-2 text-center text-xs text-slate-400">Enter to send · Shift + Enter for a new line · PDF and TXT supported</p>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
