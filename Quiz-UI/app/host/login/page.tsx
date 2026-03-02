"use client";

import { useState, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import Logo from "@/components/Logo";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/host";

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
        // Dev mode: session cookie already set, go straight to the dashboard
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
      </div>
    </div>
  );
}
