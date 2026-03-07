"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getQuizzes, deleteQuiz, createSession, apiFetch, type QuizSummary } from "@/lib/api";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";

interface Me { name: string; email: string; is_admin: boolean; }

export default function HostDashboard() {
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<number | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  const fetchQuizzes = async () => {
    try {
      const meData = await apiFetch<Me>("/auth/me");
      setMe(meData);
    } catch {
      router.replace("/host/login");
      return;
    }
    try {
      setQuizzes(await getQuizzes());
    } catch {
      setError("Failed to load quizzes — is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/host/login");
  };

  useEffect(() => { fetchQuizzes(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this quiz and all its questions?")) return;
    try {
      await deleteQuiz(id);
      setQuizzes((q) => q.filter((x) => x.id !== id));
    } catch {
      setError("Failed to delete quiz.");
    }
  };

  const handleStart = async (quizId: number) => {
    setError("");
    setStarting(quizId);
    try {
      const session = await createSession(quizId);
      router.push(`/host/game/${session.pin}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start game.");
    } finally {
      setStarting(null);
    }
  };

  return (
    <div className="min-h-screen p-3 sm:p-6 max-w-4xl mx-auto overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Logo size="xxl" iconOnly />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-extrabold leading-tight">
              Sparks<span className="text-yellow-400">Quiz</span>
            </h1>
            <p className="text-gray-400 text-xs sm:text-sm mt-0.5">Host Dashboard</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {me && (
            <span className="text-slate-400 text-xs sm:text-sm w-full sm:w-auto order-first sm:order-none">
              Signed in as <span className="text-white font-semibold truncate">{me.name || me.email}</span>
            </span>
          )}
          {me?.is_admin && (
            <Link
              href="/admin"
              className="px-3 py-2 min-h-[44px] flex items-center bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition touch-manipulation"
            >
              Manage Hosts
            </Link>
          )}
          <button
            onClick={handleLogout}
            className="px-3 py-2 min-h-[44px] bg-slate-700 hover:bg-red-700 text-slate-300 hover:text-white text-sm rounded-lg transition touch-manipulation"
          >
            Logout
          </button>
          <Link
            href="/host/quiz/new"
            className="px-4 sm:px-5 py-2.5 min-h-[44px] flex items-center bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all touch-manipulation"
          >
            + New Quiz
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-500 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 text-red-300 text-xs sm:text-sm flex items-center justify-between gap-2">
          <span className="break-words flex-1 min-w-0">{error}</span>
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-200 flex-shrink-0 min-w-[44px] min-h-[44px] touch-manipulation">✕</button>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400 text-center mt-20">Loading...</div>
      ) : quizzes.length === 0 ? (
        <div className="text-center mt-20">
          <p className="text-gray-400 text-lg mb-4">No quizzes yet.</p>
          <Link href="/host/quiz/new" className="text-indigo-400 underline">
            Create your first quiz
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4">
          {quizzes.map((quiz) => (
            <div
              key={quiz.id}
              className="bg-[#16213e] rounded-xl sm:rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 shadow"
            >
              <div className="min-w-0 flex-1">
                <h2 className="text-base sm:text-xl font-bold text-white break-words">{quiz.title}</h2>
                {quiz.description && (
                  <p className="text-gray-400 text-xs sm:text-sm mt-0.5 line-clamp-2">{quiz.description}</p>
                )}
                <p className="text-gray-500 text-xs mt-1">
                  {quiz.question_count} question{quiz.question_count !== 1 ? "s" : ""} &middot;{" "}
                  {new Date(quiz.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => handleStart(quiz.id)}
                  disabled={starting === quiz.id || quiz.question_count === 0}
                  title={quiz.question_count === 0 ? "Add questions before starting" : undefined}
                  className="px-4 py-2 min-h-[44px] bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-all text-sm touch-manipulation"
                >
                  {starting === quiz.id ? "Starting..." : "Start Game"}
                </button>
                <Link
                  href={`/host/quiz/${quiz.id}`}
                  className="px-4 py-2 min-h-[44px] flex items-center bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-lg transition-all text-sm touch-manipulation"
                >
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(quiz.id)}
                  className="px-4 py-2 min-h-[44px] bg-red-700 hover:bg-red-600 text-white font-semibold rounded-lg transition-all text-sm touch-manipulation"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
