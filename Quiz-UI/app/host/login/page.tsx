"use client";

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import Logo from "@/components/Logo";

// ── Backend health indicator ──────────────────────────────────────────────────

function BackendStatus() {
  const [state, setState] = useState<"checking" | "ok" | "error">("checking");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8011";
    fetch(`${API}/health`, { method: "GET" })
      .then((r) => {
        if (r.ok) { setState("ok"); }
        else { setState("error"); setDetail(`HTTP ${r.status}`); }
      })
      .catch((e) => { setState("error"); setDetail(e.message ?? "unreachable"); });
  }, []);

  if (state === "checking") return (
    <div className="flex items-center gap-2 text-slate-400 text-xs">
      <span className="w-2 h-2 rounded-full bg-slate-500 animate-pulse" />
      Checking backend…
    </div>
  );

  if (state === "ok") return (
    <div className="flex items-center gap-2 text-green-400 text-xs">
      <span className="w-2 h-2 rounded-full bg-green-400" />
      Backend reachable
    </div>
  );

  return (
    <div className="text-xs text-red-400 space-y-0.5">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        Backend unreachable — {detail}
      </div>
      <div className="pl-4 text-red-500 opacity-70">
        {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8011"}
      </div>
    </div>
  );
}

// ── Login form ────────────────────────────────────────────────────────────────

function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const searchParams = useSearchParams();
  const router = useRouter();
  const next = searchParams.get("next") ?? "/host";

  // If already logged in, go straight to dashboard
  useEffect(() => {
    apiFetch("/auth/me").then(() => router.replace(next)).catch(() => {});
  }, [next, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    setError("");
    try {
      const res = await apiFetch<{ direct?: boolean; message?: string }>(
        "/auth/request-link",
        { method: "POST", body: JSON.stringify({ email: email.trim() }) }
      );
      if (res.direct) {
        window.location.href = next;
        return;
      }
      setStatus("sent");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">📬</div>
        <h2 className="text-2xl font-bold text-white">Check your inbox</h2>
        <p className="text-slate-300">
          A login link was sent to <span className="font-semibold text-white">{email}</span>.
          It is valid for 15 minutes.
        </p>
        <p className="text-slate-400 text-sm">
          Running locally? Check the backend console for the link.
        </p>
        <button
          onClick={() => { setStatus("idle"); setEmail(""); }}
          className="mt-4 text-indigo-400 underline text-sm"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-slate-300 text-sm font-medium mb-1">
          Host email address
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          className="w-full px-4 py-3 rounded-lg bg-slate-700 border border-slate-600
                     text-white placeholder-slate-400 focus:outline-none
                     focus:ring-2 focus:ring-indigo-500 text-lg"
        />
      </div>

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500
                   text-white font-bold text-lg transition disabled:opacity-50"
      >
        {status === "loading" ? "Sending…" : "Send login link →"}
      </button>

      <input type="hidden" value={next} />
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800 rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <Logo size="xl" />
          <p className="text-slate-400 mt-3">Host login — enter your email to continue</p>
        </div>

        <Suspense fallback={<div className="text-slate-400">Loading…</div>}>
          <LoginForm />
        </Suspense>

        {/* Backend connectivity indicator — shown at bottom of card */}
        <div className="mt-6 pt-4 border-t border-slate-700 flex justify-center">
          <BackendStatus />
        </div>
      </div>
    </div>
  );
}
