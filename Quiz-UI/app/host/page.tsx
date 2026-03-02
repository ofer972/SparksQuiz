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
      const [quizData, meData] = await Promise.all([
        getQuizzes(),
        apiFetch<Me>("/auth/me"),
      ]);
      setQuizzes(quizData);
      setMe(meData);
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
    <div className="min-h-screen p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Logo size="xxl" iconOnly />
          <div>
            <h1 className="text-3xl font-extrabold leading-none">
              Sparks<span className="text-yellow-400">Quiz</span>
            </h1>
            <p className="text-gray-400 text-sm mt-0.5">Host Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {me && (
            <span className="text-slate-400 text-sm">
              Signed in as <span className="text-white font-semibold">{me.name || me.email}</span>
            </span>
          )}
          {me?.is_admin && (
            <Link
              href="/admin"
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition"
            >
              Manage Hosts
            </Link>
          )}
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 bg-slate-700 hover:bg-red-700 text-slate-300 hover:text-white text-sm rounded-lg transition"
          >
            Logout
          </button>
          <Link
            href="/host/quiz/new"
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all"
          >
            + New Quiz
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-500 rounded-xl p-4 mb-6 text-red-300 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-200 ml-4">✕</button>
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
        <div className="grid gap-4">
          {quizzes.map((quiz) => (
            <div
              key={quiz.id}
              className="bg-[#16213e] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow"
            >
              <div>
                <h2 className="text-xl font-bold text-white">{quiz.title}</h2>
                {quiz.description && (
                  <p className="text-gray-400 text-sm mt-0.5">{quiz.description}</p>
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
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-all text-sm"
                >
                  {starting === quiz.id ? "Starting..." : "Start Game"}
                </button>
                <Link
                  href={`/host/quiz/${quiz.id}`}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-lg transition-all text-sm"
                >
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(quiz.id)}
                  className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white font-semibold rounded-lg transition-all text-sm"
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
