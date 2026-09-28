import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  BookOpen,
  Check,
  FileText,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Copy,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { GoogleLogin } from "@react-oauth/google";

type Verification = {
  passed: boolean;
  verified: boolean;
  score: number | null;
  explanation: string | null;
};
type Remediation = {
  failure_type?: string | null;
  remediation?: string | null;
  source_label?: string;
  remediation_error?: string | null;
};
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  verification?: Verification;
  remediation?: Remediation;
  sources?: { text: string; score: number }[];
  query?: string;
};
type Chat = {
  id: string;
  title: string;
  updatedAt: string;
  documents: string[];
  messages: Message[];
};

const demoChats: Chat[] = [
  {
    id: "product-notes",
    title: "Product notes",
    updatedAt: "Just now",
    documents: ["product-brief.pdf", "research-notes.docx"],
    messages: [
      {
        id: "welcome",
        role: "assistant",
        content:
          "I’m ready to answer from your documents. Ask a question and I’ll cite only the context I can verify.",
      },
    ],
  },
  {
    id: "policy-review",
    title: "Policy review",
    updatedAt: "Yesterday",
    documents: ["employee-handbook.pdf"],
    messages: [],
  },
];

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ApiChat = {
  id: string;
  title: string;
  updated_at: string;
  documents: string[];
  message_count: number;
};

type AuthUser = { access_token: string; user_id: string; email: string };

const fromApiChat = (chat: ApiChat): Chat => ({
  id: chat.id,
  title: chat.title,
  updatedAt: new Date(chat.updated_at).toLocaleDateString(),
  documents: chat.documents,
  messages: [],
});

function VerificationCard({
  result,
  remediation,
}: {
  result?: Verification;
  remediation?: Remediation;
}) {
  if (!result) {
    return <small className="verified"><Check size={12} /> Verification pending</small>;
  }

  const status = !result.verified
    ? "Unverified"
    : result.passed
      ? "Passed"
      : "Failed";
  const statusClass = !result.verified
    ? "verification-unknown"
    : result.passed
      ? "verification-pass"
      : "verification-fail";
  const score =
    result.score === null ? "—" : `${Math.round(result.score * 100)}%`;

  return (
    <div className={`verification-card ${statusClass}`}>
      <div className="verification-header">
        <span className="verification-title">
          <ShieldCheck size={14} /> Lynx verification
        </span>
        <strong>{status}</strong>
      </div>
      <div className="verification-meta">
        <span>Faithfulness score</span>
        <b>{score}</b>
      </div>
      {result.explanation ? (
        <p className="verification-explanation">{result.explanation}</p>
      ) : null}
      {remediation?.remediation ? (
        <p className="verification-explanation">
          {remediation.remediation === "web_search"
            ? "Answer from the web — not found in your documents."
            : remediation.remediation === "strict_regeneration"
              ? "Answer from your documents — document-grounded."
              : "I could not find reliable information to answer this."}
        </p>
      ) : null}
      {remediation?.remediation_error ? (
        <p className="verification-explanation">
          Remediation detail: {remediation.remediation_error}
        </p>
      ) : null}
    </div>
  );
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("aoa_token") ?? "");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [userEmail, setUserEmail] = useState(
    () => localStorage.getItem("aoa_email") ?? "",
  );
  const [chats, setChats] = useState<Chat[]>(apiBaseUrl ? [] : demoChats);
  const [activeId, setActiveId] = useState(apiBaseUrl ? "" : demoChats[0].id);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isUploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [isAnswering, setIsAnswering] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const composerTextarea = useRef<HTMLTextAreaElement>(null);
  const activeChat = chats.find((chat) => chat.id === activeId) ?? chats[0];
  const authHeaders: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  useEffect(() => {
    setChats(apiBaseUrl && token ? [] : demoChats);
    setActiveId(apiBaseUrl && token ? "" : demoChats[0].id);
  }, [token]);

  const completeAuth = (user: AuthUser) => {
    localStorage.setItem("aoa_token", user.access_token);
    localStorage.setItem("aoa_email", user.email);
    setToken(user.access_token);
    setUserEmail(user.email);
    setAuthError("");
  };

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError("");
    try {
      const response = await fetch(`${apiBaseUrl}/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });
      const data = (await response.json()) as AuthUser & { detail?: string };
      if (!response.ok) throw new Error(data.detail ?? "Authentication failed");
      completeAuth(data);
    } catch (requestError) {
      setAuthError(requestError instanceof Error ? requestError.message : "Authentication failed");
    }
  };

  const createRemoteChat = async () => {
    if (!apiBaseUrl) return;
    const response = await fetch(`${apiBaseUrl}/chats`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ title: "New conversation" }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        detail?: string;
      } | null;
      throw new Error(body?.detail || `Unable to create chat (${response.status})`);
    }
    const chat = fromApiChat((await response.json()) as ApiChat);
    setChats((current) => [
      chat,
      ...current.filter((existing) => existing.id !== chat.id),
    ]);
    setActiveId(chat.id);
  };

  useEffect(() => {
    if (!apiBaseUrl) return;
    void fetch(`${apiBaseUrl}/chats`, { headers: authHeaders })
      .then(async (response) => {
        if (response.status === 401) {
          localStorage.removeItem("aoa_token");
          localStorage.removeItem("aoa_email");
          setToken("");
          setUserEmail("");
          throw new Error("Your session expired. Please sign in again.");
        }
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            detail?: string;
          } | null;
          throw new Error(body?.detail || `Unable to load chats (${response.status})`);
        }
        return (await response.json()) as ApiChat[];
      })
      .then((remoteChats) => {
        const nextChats = remoteChats.map(fromApiChat);
        setChats(nextChats);
        const blankChat = nextChats.find(
          (chat) =>
            chat.title === "New conversation" && chat.messages.length === 0,
        );
        if (blankChat) {
          setActiveId(blankChat.id);
          return;
        }
        return createRemoteChat();
      })
      .catch((requestError) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load chats from the FastAPI service.",
        );
      });
  }, [token]);

  useEffect(() => {
    if (
      !apiBaseUrl ||
      !token ||
      !activeId ||
      !uuidPattern.test(activeId) ||
      !chats.some((chat) => chat.id === activeId)
    ) {
      return;
    }
    void fetch(`${apiBaseUrl}/chats/${activeId}/messages`, { headers: authHeaders })
      .then((response) => response.ok ? response.json() : [])
      .then((messages: {
        id: string;
        role: "user" | "assistant";
        content: string;
        verification?: Verification;
        sources?: { text: string; score: number }[];
      }[]) => {
        updateActiveChat((chat) => ({
          ...chat,
          messages: messages.map((message) => ({ ...message })),
        }));
      })
      .catch(() => undefined);
  }, [activeId, token]);

  const visibleChats = useMemo(
    () =>
      chats.filter((chat) =>
        chat.title.toLowerCase().includes(search.toLowerCase()),
      ),
    [chats, search],
  );

  const updateActiveChat = (update: (chat: Chat) => Chat) => {
    setChats((current) =>
      current.map((chat) => (chat.id === activeId ? update(chat) : chat)),
    );
  };

  const createChat = async () => {
    if (apiBaseUrl) {
      try {
        await createRemoteChat();
        setSidebarOpen(false);
        return;
      } catch {
        return;
      }
    }
    const id = `chat-${Date.now()}`;
    setChats((current) => [
      {
        id,
        title: "New conversation",
        updatedAt: "Just now",
        documents: [],
        messages: [],
      },
      ...current,
    ]);
    setActiveId(id);
    setSidebarOpen(false);
  };

  const answerQuestion = async (
    question: string,
    addUserMessage = true,
    webSearch = false,
  ) => {
    if (!question || !activeChat) return;
    if (addUserMessage) {
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: question,
      };
      setQuery("");
      if (composerTextarea.current) {
        composerTextarea.current.style.height = "auto";
        composerTextarea.current.style.overflowY = "hidden";
      }
      updateActiveChat((chat) => ({
        ...chat,
        title: chat.messages.length === 0 ? question.slice(0, 34) : chat.title,
        updatedAt: "Just now",
        messages: [...chat.messages, userMessage],
      }));
    }
    setIsAnswering(true);
    if (apiBaseUrl) {
      try {
        const response = await fetch(`${apiBaseUrl}/chats/${activeId}/questions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ query: question, web_search: webSearch }),
        });
        if (!response.ok) {
          const detail = (await response.json().catch(() => null)) as {
            detail?: string;
          } | null;
          throw new Error(detail?.detail || "Question request failed");
        }
        const data = (await response.json()) as {
          answer: string;
          sources: { text: string; score: number }[];
          verification: Verification;
          failure_type?: string | null;
          remediation?: string | null;
          source_label?: string;
          remediation_error?: string | null;
        };
        updateActiveChat((chat) => ({
          ...chat,
          messages: [
            ...chat.messages,
            {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              content: data.answer,
              query: question,
              verification: data.verification,
              remediation: {
                failure_type: data.failure_type,
                remediation: data.remediation,
                source_label: data.source_label,
                remediation_error: data.remediation_error,
              },
              sources: data.sources,
            },
          ],
        }));
      } catch (requestError) {
        updateActiveChat((chat) => ({
          ...chat,
          messages: [
            ...chat.messages,
            {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              content: requestError instanceof Error
                ? requestError.message
                : "The RAG service could not answer this question.",
            },
          ],
        }));
      }
      setIsAnswering(false);
      return;
    }

    window.setTimeout(() => {
      updateActiveChat((chat) => ({
        ...chat,
        messages: [
          ...chat.messages,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content:
              "I don’t know from the uploaded documents yet. Add a relevant source or try a more specific question.",
          },
        ],
      }));
      setIsAnswering(false);
    }, 450);
  };

  const sendQuestion = async (event: FormEvent) => {
    event.preventDefault();
    await answerQuestion(query.trim());
  };

  const copyMessage = async (message: Message) => {
    await navigator.clipboard.writeText(message.content);
    setCopiedMessageId(message.id);
    window.setTimeout(() => setCopiedMessageId(null), 1600);
  };

  const regenerateMessage = async (messageIndex: number) => {
    const previousUserMessage = activeChat?.messages
      .slice(0, messageIndex)
      .reverse()
      .find((message) => message.role === "user");
    if (previousUserMessage) await answerQuestion(previousUserMessage.content, false);
  };

  const searchWebForMessage = async (messageIndex: number) => {
    const previousUserMessage = activeChat?.messages
      .slice(0, messageIndex)
      .reverse()
      .find((message) => message.role === "user");
    if (previousUserMessage) {
      await answerQuestion(previousUserMessage.content, false, true);
    }
  };

  const uploadDocuments = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    setError("");
    if (apiBaseUrl) {
      const body = new FormData();
      files.forEach((file) => body.append("files", file));
      try {
        const response = await fetch(`${apiBaseUrl}/chats/${activeId}/documents`, {
          method: "POST",
          body,
          headers: authHeaders,
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            detail?: string;
          } | null;
          throw new Error(body?.detail || `Upload failed (${response.status})`);
        }
      } catch (uploadError) {
        setUploading(false);
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : "Upload failed. Unable to reach the FastAPI service.",
        );
        return;
      }
    }
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    updateActiveChat((chat) => ({
      ...chat,
      documents: [...chat.documents, ...files.map((file) => file.name)],
    }));
    setUploading(false);
    event.target.value = "";
  };

  if (apiBaseUrl && !token) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <div className="brand auth-brand"><div className="brand-mark"><img src="/logo.png" alt="" /></div><span>AOA</span></div>
          <p className="eyebrow">{authMode === "login" ? "Welcome back" : "Create your account"}</p>
          <h1>{authMode === "login" ? "Sign in to your workspace" : "Start with AOA"}</h1>
          <p className="auth-copy">Your chats and document history stay available across sessions.</p>
          {authError ? <div className="api-error">{authError}</div> : null}
          <form className="auth-form" onSubmit={submitAuth}>
            <input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="Email address" required />
            <input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="Password (8+ characters)" minLength={8} required />
            <button className="new-chat" type="submit">{authMode === "login" ? "Sign in" : "Create account"}</button>
          </form>
          <div className="auth-divider"><span>or</span></div>
          <GoogleLogin
            onSuccess={async (credential) => {
              if (!credential.credential) return;
              const response = await fetch(`${apiBaseUrl}/auth/google`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id_token: credential.credential }),
              });
              const data = (await response.json()) as AuthUser & { detail?: string };
              if (!response.ok) setAuthError(data.detail ?? "Google sign-in failed");
              else completeAuth(data);
            }}
            onError={() => setAuthError("Google sign-in failed")}
          />
          <button className="auth-switch" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>
            {authMode === "login" ? "Need an account? Create one" : "Already have an account? Sign in"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${isSidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><img src="/logo.png" alt="" /></div>
          <span>AOA</span>
          <span className="brand-label">Answer or Abstain</span>
          <button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><X size={18} /></button>
        </div>
        <button className="new-chat" onClick={createChat}><Plus size={18} /> New chat</button>
        <label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chats" /></label>
        <div className="chat-list">
          <p className="eyebrow">Your chats</p>
          {visibleChats.map((chat) => (
            <button className={`chat-item ${chat.id === activeId ? "selected" : ""}`} key={chat.id} onClick={() => { setActiveId(chat.id); setSidebarOpen(false); }}>
              <MessageCircle size={16} />
              <span><strong>{chat.title}</strong><small>{chat.updatedAt}</small></span>
            </button>
          ))}
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar"><Menu size={20} /></button>
          <div><p className="eyebrow">Workspace / {activeChat?.title}</p><h1>{activeChat?.title}</h1></div>
          <div className="user-menu"><span>{userEmail}</span><button className="auth-switch" onClick={() => { localStorage.removeItem("aoa_token"); setToken(""); }}>Sign out</button></div>
        </header>

        <section className="content">
          {error ? <div className="api-error" role="alert">{error}</div> : null}
          <div className="conversation">
            {activeChat?.messages.length === 0 ? <div className="empty-state"><div className="empty-icon"><img src="/logo.png" alt="AOA" /></div><h2>Ask your documents anything</h2><p>Upload a source above, then ask a question. AOA retrieves relevant passages and abstains when the answer cannot be verified.</p><div className="suggestions"><button onClick={() => setQuery("Summarize the key points")}>Summarize the key points <ArrowUp size={14} /></button><button onClick={() => setQuery("What are the main risks?")}>What are the main risks? <ArrowUp size={14} /></button></div></div> : activeChat?.messages.map((message, messageIndex) => <article className={`message ${message.role}`} key={message.id}>            <div className="avatar">{message.role === "assistant" ? <img src="/logo.png" alt="" /> : "You"}</div><div><span className="message-label">{message.role === "assistant" ? "AOA" : "You"}</span>{message.role === "assistant" ? <div className="message-markdown">            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div> : <p>{message.content}</p>}{message.role === "assistant" ? <VerificationCard result={message.verification} remediation={message.remediation} /> : null}{message.role === "assistant" ? <div className="message-actions"><button onClick={() => void copyMessage(message)} aria-label="Copy answer" title={copiedMessageId === message.id ? "Copied" : "Copy answer"}><Copy size={14} /> {copiedMessageId === message.id ? "Copied" : "Copy"}</button><button onClick={() => void regenerateMessage(messageIndex)} disabled={isAnswering} aria-label="Regenerate answer" title="Regenerate answer"><RefreshCw size={14} /> Regenerate</button>{!message.verification || !message.verification.passed || !message.verification.verified || message.content.toLowerCase().includes("i don't know") ? <button onClick={() => void searchWebForMessage(messageIndex)} disabled={isAnswering} className="web-search-action" aria-label="Search the web"><Search size={14} /> Search the web</button> : null}</div> : null}{message.role === "assistant" && message.sources?.length ? <details className="source-details"><summary>Search/context sources ({message.sources.length})</summary>{message.sources.map((source, index) => <p className="source-item" key={`${source.text}-${index}`}>{source.text}</p>)}</details> : null}</div></article>)}{isAnswering ? <div className="message assistant loading-message"><div className="avatar"><img src="/logo.png" alt="" /></div><div className="loading-bubble" aria-label="AOA is thinking"><span /><span /><span /></div></div> : null}
          </div>

          <form className={`composer ${query.includes("\n") ? "composer-expanded" : ""}`} onSubmit={sendQuestion}><div className="composer-input"><textarea ref={composerTextarea} value={query} onChange={(event) => { const textarea = event.currentTarget; setQuery(textarea.value); textarea.style.height = "auto"; const maxHeight = 140; textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`; textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden"; }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendQuestion(event); } }} placeholder="Ask a question about your documents..." rows={1} /></div><button type="submit" disabled={!query.trim()} aria-label="Send question"><ArrowUp size={19} /></button></form>
          <p className="disclaimer">AOA answers only from your uploaded sources. It will say “I don’t know” when the documents do not provide enough evidence.</p>
        </section>
      </main>
      <aside className="documents-sidebar">
        <div className="documents-sidebar-header">
          <div className="documents-sidebar-title">
            <BookOpen size={17} />
            <div>
              <p className="eyebrow">Knowledge base</p>
              <h2>Source documents</h2>
            </div>
          </div>
          <span className="document-count">{activeChat?.documents.length ?? 0}</span>
        </div>
        <p className="documents-sidebar-copy">
          Add files to ground answers in this chat.
        </p>
        <input ref={fileInput} type="file" multiple accept=".pdf,.docx,.txt,.md,.csv" hidden onChange={uploadDocuments} />
        <button className="upload-button" onClick={() => fileInput.current?.click()} disabled={isUploading || !activeChat}>
          <Upload size={16} /> {isUploading ? "Uploading..." : "Add documents"}
        </button>
        <div className="document-list">
          {activeChat?.documents.length ? activeChat.documents.map((document) => (
            <span className="document-chip" key={document}>
              <FileText size={14} /><span>{document}</span><Check size={13} />
            </span>
          )) : (
            <div className="document-empty">
              <FileText size={18} />
              <span>No documents yet</span>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

export default App;
