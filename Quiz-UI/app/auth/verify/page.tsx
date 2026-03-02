"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import Logo from "@/components/Logo";

function VerifyContent() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No token provided in the link.");
      return;
    }

    apiFetch<{ ok: boolean; name: string; is_admin: boolean }>(
      `/auth/verify?token=${encodeURIComponent(token)}`
    )
      .then((data) => {
        setStatus("success");
        setMessage(`Welcome back, ${data.name || "Host"}!`);
        // Short delay so the user sees the success message
        setTimeout(() => router.replace("/host"), 1500);
      })
      .catch((err: unknown) => {
        setStatus("error");
        setMessage(
          err instanceof Error
            ? err.message
            : "Something went wrong verifying your link."
        );
      });
  }, [token, router]);

  if (status === "loading") {
    return (
      <>
        <Logo size="lg" />
        <h2 className="text-2xl font-bold text-white mt-4">Verifying your link…</h2>
      </>
    );
  }

  if (status === "success") {
    return (
      <>
        <div className="text-5xl">✅</div>
        <h2 className="text-2xl font-bold text-white mt-4">{message}</h2>
        <p className="text-slate-400 mt-2">Redirecting you to the dashboard…</p>
      </>
    );
  }

  return (
    <>
      <div className="text-5xl">❌</div>
      <h2 className="text-2xl font-bold text-white mt-4">Link invalid</h2>
      <p className="text-slate-300 mt-2 max-w-sm text-center">{message}</p>
      <button
        onClick={() => router.push("/host/login")}
        className="mt-6 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white
                   font-bold rounded-lg transition"
      >
        Request a new link
      </button>
    </>
  );
}

export default function VerifyPage() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-2 p-4">
      <Suspense fallback={<div className="text-slate-400">Loading…</div>}>
        <VerifyContent />
      </Suspense>
    </div>
  );
}
