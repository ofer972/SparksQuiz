"use client";

import { Suspense, use, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { WS_URL } from "@/lib/api";
import PlayerController from "@/components/PlayerController";
import Leaderboard from "@/components/Leaderboard";
import Podium from "@/components/Podium";
import Logo from "@/components/Logo";

type GamePhase = "connecting" | "lobby" | "question" | "answered" | "result" | "leaderboard" | "finished" | "kicked" | "error";

interface AnswerOption { id: number; text: string; }
interface QuestionData {
  question_text: string;
  question_type: "single" | "multi";
  time_limit: number;
  correct_count: number;
  icon_set: string;
  answers: AnswerOption[];
}
interface LeaderboardEntry { rank: number; nickname: string; score: number; }
interface AckData { correct: boolean; points: number; }

function PlayerGame({ pin }: { pin: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const nickname = searchParams.get("nickname") ?? "";

  const wsRef = useRef<WebSocket | null>(null);
  const [phase, setPhase] = useState<GamePhase>("connecting");
  const [players, setPlayers] = useState<string[]>([]);
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [ack, setAck] = useState<AckData | null>(null);
  const [correctIds, setCorrectIds] = useState<number[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [totalScore, setTotalScore] = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [questionsCorrect, setQuestionsCorrect] = useState(0);
  const [questionNum, setQuestionNum] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [wsError, setWsError] = useState("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  const send = useCallback((msg: object) => {
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  // Use a closure variable so we never call side-effects inside a React state updater
  const startTimer = (limit: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    let remaining = limit;
    setTimeLeft(remaining);
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(timerRef.current!);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setTimeLeft(0);
  };

  const connectWs = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}/ws/player/${pin}/${encodeURIComponent(nickname)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setPhase("connecting");
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: "ping" }));
      }, 30_000);
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      switch (msg.type) {
        case "lobby_update":
          setPlayers(msg.players);
          setPhase("lobby");
          break;
        case "question_start":
          setQuestion({
            question_text: msg.question_text,
            question_type: msg.question_type,
            time_limit: msg.time_limit,
            correct_count: msg.correct_count ?? 1,
            icon_set: msg.icon_set ?? "elements",
            answers: msg.answers,
          });
          setQuestionNum((msg.question_index ?? 0) + 1);
          setTotalQuestions(msg.total_questions ?? 0);
          setAck(null);
          setCorrectIds([]);
          setPhase("question");
          startTimer(Math.max(1, msg.time_limit - Math.floor(msg.time_elapsed ?? 0)));
          break;
        case "answer_ack":
          stopTimer();
          setAck({ correct: msg.correct, points: msg.points ?? 0 });
          setTotalScore((s) => s + (msg.points ?? 0));
          setQuestionsAnswered((n) => n + 1);
          if (msg.correct) setQuestionsCorrect((n) => n + 1);
          setPhase("answered");
          break;
        case "show_results":
          stopTimer();
          setCorrectIds(msg.correct_answer_ids);
          setPhase("result");
          break;
        case "leaderboard":
          setPhase("leaderboard");
          break;
        case "game_over":
          setLeaderboard(msg.leaderboard);
          setPhase("finished");
          break;
        case "kicked":
          setPhase("kicked");
          break;
        case "host_disconnected":
          setWsError("The host disconnected. The game has ended.");
          setPhase("error");
          break;
      }
    };

    ws.onerror = () => {
      setWsError("Connection error — check that the backend is running.");
      setPhase("error");
    };

    ws.onclose = () => {
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    };
  }, [pin, nickname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!nickname) { router.push("/play"); return; }

    connectWs();

    // Reconnect when phone wakes up and the socket has dropped
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const ws = wsRef.current;
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          setPhase("connecting");
          connectWs();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      wsRef.current?.close();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timerRef.current) clearInterval(timerRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, nickname]);

  const handleSubmit = (answerIds: number[]) => {
    send({ action: "submit_answer", answer_ids: answerIds });
  };

  const accuracy = questionsAnswered > 0
    ? Math.round((questionsCorrect / questionsAnswered) * 100)
    : 0;

  if (phase === "kicked") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-4xl mb-4">❌</p>
          <h2 className="text-2xl font-bold text-white mb-2">You were removed</h2>
          <p className="text-gray-400 mb-6">The host removed you from the game.</p>
          <a href="/play" className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl">
            Join another game
          </a>
        </div>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-4xl mb-4">⚠️</p>
          <h2 className="text-2xl font-bold text-white mb-2">Connection Lost</h2>
          <p className="text-gray-400 mb-6">{wsError}</p>
          <a href="/play" className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl">
            Back to lobby
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col p-4 max-w-lg mx-auto">
      {/* Header — nickname + running score */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-white font-bold text-2xl">{nickname}</div>
        <div className="text-yellow-400 font-bold text-2xl">{totalScore.toLocaleString()} pts</div>
      </div>

      {phase === "connecting" && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Logo size="md" />
            <p className="text-gray-400 mt-3">Connecting to game...</p>
          </div>
        </div>
      )}

      {phase === "lobby" && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4"><Logo size="xl" iconOnly /></div>
            <h2 className="text-2xl font-bold text-white mb-1">You&apos;re in the lobby!</h2>
            <p className="text-gray-400">Waiting for the host to start...</p>
          </div>
          <div className="bg-[#16213e] rounded-2xl p-5 w-full">
            <p className="text-gray-400 text-sm mb-3">{players.length} player{players.length !== 1 ? "s" : ""} joined</p>
            <div className="flex flex-wrap gap-2">
              {players.map((p) => (
                <span
                  key={p}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                    p === nickname ? "bg-indigo-600 text-white" : "bg-[#0f3460] text-gray-300"
                  }`}
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {(phase === "question" || phase === "answered") && question && (
        <PlayerController
          question={question}
          timeLeft={timeLeft}
          phase={phase}
          ack={ack}
          onSubmit={handleSubmit}
          iconSet={question.icon_set}
        />
      )}

      {/* RESULT — correct answer reveal + personal stats (no leaderboard) */}
      {phase === "result" && question && (
        <div className="flex-1 flex flex-col gap-4">
          {/* Ack summary if they answered */}
          {ack && (
            <div className={`rounded-2xl p-4 text-center ${ack.correct ? "bg-green-900/40 border border-green-600" : "bg-red-900/40 border border-red-600"}`}>
              <span className={`text-3xl font-black ${ack.correct ? "text-green-400" : "text-red-400"}`}>
                {ack.correct ? "✓  Correct!" : "✗  Incorrect!"}
              </span>
              {ack.points > 0 && (
                <p className="text-yellow-400 text-2xl font-extrabold mt-1">+{ack.points} pts</p>
              )}
            </div>
          )}
          {!ack && (
            <div className="rounded-2xl p-4 text-center bg-gray-800/60 border border-gray-600">
              <span className="text-gray-400 text-xl font-semibold">⏱ Time&apos;s up!</span>
            </div>
          )}

          {/* Correct answers */}
          <div className="bg-[#16213e] rounded-2xl p-4">
            <p className="text-gray-400 text-sm mb-2">Correct answer{correctIds.length > 1 ? "s" : ""}:</p>
            <div className="grid grid-cols-2 gap-2">
              {question.answers.map((a, i) => (
                <div
                  key={a.id}
                  className={`rounded-xl p-3 font-semibold text-white text-sm ${
                    correctIds.includes(a.id) ? "ring-4 ring-white" : "opacity-30"
                  } ${["btn-red", "btn-blue", "btn-yellow", "btn-green"][i % 4]}`}
                >
                  {a.text}
                </div>
              ))}
            </div>
          </div>

          {/* Personal stats */}
          <div className="bg-[#16213e] rounded-2xl p-4">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">Your stats so far</p>
            <div className="flex justify-around">
              <div className="text-center">
                <p className="text-3xl font-extrabold text-green-400">{questionsCorrect}</p>
                <p className="text-gray-400 text-xs mt-1">Correct</p>
              </div>
              <div className="w-px bg-gray-700" />
              <div className="text-center">
                <p className="text-3xl font-extrabold text-red-400">{questionsAnswered - questionsCorrect}</p>
                <p className="text-gray-400 text-xs mt-1">Wrong</p>
              </div>
              <div className="w-px bg-gray-700" />
              <div className="text-center">
                <p className="text-3xl font-extrabold text-indigo-400">{accuracy}%</p>
                <p className="text-gray-400 text-xs mt-1">Accuracy</p>
              </div>
            </div>
            {questionsAnswered > 0 && (
              <div className="mt-3">
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${accuracy}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-2 py-2">
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <p className="text-gray-400 text-sm font-medium">Waiting for the host to continue…</p>
          </div>
        </div>
      )}

      {/* LEADERBOARD phase — show personal progress, not the full leaderboard */}
      {phase === "leaderboard" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-1">Keep it up!</h2>
            {totalQuestions > 0 && questionNum < totalQuestions && (
              <p className="text-gray-400 text-sm mb-3">
                Question {questionNum + 1} of {totalQuestions} coming up…
              </p>
            )}
            <div className="flex justify-center gap-1 mt-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>

          <div className="bg-[#16213e] rounded-2xl p-5 w-full">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-4">Your progress</p>
            <div className="flex justify-around mb-4">
              <div className="text-center">
                <p className="text-4xl font-extrabold text-green-400">{questionsCorrect}</p>
                <p className="text-gray-400 text-xs mt-1">Correct</p>
              </div>
              <div className="text-center">
                <p className="text-4xl font-extrabold text-red-400">{questionsAnswered - questionsCorrect}</p>
                <p className="text-gray-400 text-xs mt-1">Wrong</p>
              </div>
              <div className="text-center">
                <p className="text-4xl font-extrabold text-yellow-400">{totalScore.toLocaleString()}</p>
                <p className="text-gray-400 text-xs mt-1">Points</p>
              </div>
            </div>
            {questionsAnswered > 0 && (
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Accuracy</span>
                  <span>{accuracy}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2.5">
                  <div
                    className="bg-green-500 h-2.5 rounded-full transition-all"
                    style={{ width: `${accuracy}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <p className="text-center text-gray-500 text-sm animate-pulse">Waiting for next question...</p>
        </div>
      )}

      {/* FINISHED — now we show the full leaderboard + podium */}
      {phase === "finished" && (
        <div className="flex-1 flex flex-col gap-6">
          <h2 className="text-3xl font-extrabold text-center text-yellow-400">Game Over!</h2>
          <Podium entries={leaderboard} highlight={nickname} />

          {/* Personal final stats */}
          <div className="bg-[#16213e] rounded-2xl p-4">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">Your final stats</p>
            <div className="flex justify-around">
              <div className="text-center">
                <p className="text-3xl font-extrabold text-green-400">{questionsCorrect} / {questionsAnswered}</p>
                <p className="text-gray-400 text-xs mt-1">Correct</p>
              </div>
              <div className="w-px bg-gray-700" />
              <div className="text-center">
                <p className="text-3xl font-extrabold text-indigo-400">{accuracy}%</p>
                <p className="text-gray-400 text-xs mt-1">Accuracy</p>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-700 pt-4">
            <h3 className="text-white font-semibold text-lg mb-3">Final Rankings</h3>
            <Leaderboard entries={leaderboard} highlight={nickname} />
          </div>
          <a
            href="/play"
            className="block text-center py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl"
          >
            Play Again
          </a>
        </div>
      )}
    </main>
  );
}

export default function PlayerGamePage({ params }: { params: Promise<{ pin: string }> }) {
  const { pin } = use(params);
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>}>
      <PlayerGame pin={pin} />
    </Suspense>
  );
}
