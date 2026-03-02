const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";
// Derive WS URL from API URL so they always match — no separate env var needed
export const WS_URL = API.replace(/^http/, "ws");

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",   // send/receive cookies for auth
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      throw new Error(json.detail || json.message || text || res.statusText);
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error(text || res.statusText);
      throw e;
    }
  }
  return res.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface Answer {
  id: number;
  question_id: number;
  answer_text: string;
  is_correct: boolean;
}

export interface Question {
  id: number;
  quiz_id: number;
  question_text: string;
  question_type: "single" | "multi";
  time_limit: number;
  order_index: number;
  answers: Answer[];
}

export interface Quiz {
  id: number;
  title: string;
  description: string | null;
  created_at: string;
  questions: Question[];
}

export interface QuizSummary {
  id: number;
  title: string;
  description: string | null;
  created_at: string;
  question_count: number;
}

export interface GameSession {
  id: number;
  pin: string;
  quiz_id: number;
  status: string;
  current_question_index: number;
}

export interface LeaderboardEntry {
  rank: number;
  nickname: string;
  score: number;
}

// ── Quiz CRUD ────────────────────────────────────────────────────────────────

export const getQuizzes = () => apiFetch<QuizSummary[]>("/api/quizzes/");
export const getQuiz = (id: number) => apiFetch<Quiz>(`/api/quizzes/${id}`);
export const createQuiz = (body: unknown) =>
  apiFetch<Quiz>("/api/quizzes/", { method: "POST", body: JSON.stringify(body) });
export const updateQuiz = (id: number, body: unknown) =>
  apiFetch<Quiz>(`/api/quizzes/${id}`, { method: "PUT", body: JSON.stringify(body) });
export const deleteQuiz = (id: number) =>
  apiFetch<void>(`/api/quizzes/${id}`, { method: "DELETE" });

// ── Game session ─────────────────────────────────────────────────────────────

export const createSession = (quiz_id: number) =>
  apiFetch<GameSession>("/api/game/session", { method: "POST", body: JSON.stringify({ quiz_id }) });
export const joinSession = (pin: string, nickname: string) =>
  apiFetch<{ ok: boolean }>(`/api/game/session/${pin}/join?nickname=${encodeURIComponent(nickname)}`, { method: "POST" });
