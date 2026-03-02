"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { WS_URL } from "@/lib/api";
import Leaderboard from "@/components/Leaderboard";
import Podium from "@/components/Podium";
import Logo from "@/components/Logo";

type GameStatus = "connecting" | "lobby" | "question" | "result" | "leaderboard" | "finished" | "error";

interface Player { nickname: string; }
interface LeaderboardEntry { rank: number; nickname: string; score: number; }
interface AnswerOption { id: number; answer_text: string; is_correct?: boolean; }
interface QuestionData {
  question_text: string;
  question_type: string;
  time_limit: number;
  answers: AnswerOption[];
}
interface AnswerProgress { answered: number; total: number; }

export default function HostGamePage({ params }: { params: Promise<{ pin: string }> }) {
  const { pin } = use(params);
  const wsRef = useRef<WebSocket | null>(null);
  // ref to always read current status in ws callbacks without stale closures
  const statusRef = useRef<GameStatus>("connecting");

  const [status, setStatus] = useState<GameStatus>("connecting");
  const [players, setPlayers] = useState<Player[]>([]);
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [progress, setProgress] = useState<AnswerProgress>({ answered: 0, total: 0 });
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [correctIds, setCorrectIds] = useState<number[]>([]);
  const [wsError, setWsError] = useState("");
  const [questionNum, setQuestionNum] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const autoNextRef = useRef(false);   // when true, jump to next question as soon as leaderboard arrives
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const connectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const [connectTimedOut, setConnectTimedOut] = useState(false);

  const updateStatus = (s: GameStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  const send = useCallback((msg: object) => {
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  const startTimer = (limit: number, onExpire?: () => void) => {
    if (timerRef.current) clearInterval(timerRef.current);
    let remaining = limit;
    setTimeLeft(remaining);
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current!);
        onExpire?.();   // called in interval callback, not inside a state updater
      }
    }, 1000);
  };

  const connectWs = useCallback(() => {
    const wsUrl = `${WS_URL}/ws/host/${pin}`;
    console.log("[SparksQuiz] Opening host WebSocket:", wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setConnectTimedOut(false);

    // If the WebSocket doesn't open within 8 s, give up and let the user go back
    connectTimeoutRef.current = setTimeout(() => {
      if (statusRef.current === "connecting") {
        setConnectTimedOut(true);
        ws.close();
      }
    }, 8000);

    ws.onopen = () => {
      if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
      setWsError("");
      // Do NOT set status here — wait for the first message from the backend
      // (lobby_update for lobby, question_start/show_results/etc. for mid-game rejoin)
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: "ping" }));
      }, 30_000);
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      switch (msg.type) {
        case "lobby_update":
          setPlayers((msg.players as string[]).map((n) => ({ nickname: n })));
          // Only switch to lobby if we're still in the initial connecting phase.
          // Mid-game lobby_updates (player join/drop) must not reset the host UI.
          if (statusRef.current === "connecting") updateStatus("lobby");
          break;
        case "question_start":
          setQuestion({ question_text: msg.question_text, question_type: msg.question_type, time_limit: msg.time_limit, answers: msg.answers });
          setProgress({ answered: msg.answered ?? 0, total: msg.total ?? 0 });
          setQuestionNum((msg.question_index ?? 0) + 1);
          setTotalQuestions(msg.total_questions ?? 0);
          updateStatus("question");
          startTimer(Math.max(1, msg.time_limit - Math.floor(msg.time_elapsed ?? 0)), () => send({ action: "next_question" }));
          break;
        case "answer_progress":
          setProgress({ answered: msg.answered, total: msg.total });
          break;
        case "show_results":
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
          setTimeLeft(0);
          setCorrectIds(msg.correct_answer_ids);
          setLeaderboard(msg.leaderboard);
          updateStatus("result");
          break;
        case "leaderboard":
          setLeaderboard(msg.leaderboard);
          updateStatus("leaderboard");
          if (autoNextRef.current) {
            autoNextRef.current = false;
            setTimeout(() => send({ action: "next" }), 100);
          }
          break;
        case "game_over":
          setLeaderboard(msg.leaderboard);
          updateStatus("finished");
          break;
        case "error":
          setWsError(msg.message ?? "Unknown error");
          break;
      }
    };

    ws.onerror = () => {
      setWsError("Connection error — check that the backend is running.");
      updateStatus("error");
    };

    ws.onclose = () => {
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      if (statusRef.current !== "finished") updateStatus("connecting");
    };
  }, [pin, send]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    connectWs();

    // Reconnect when phone wakes up and the socket has dropped
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const ws = wsRef.current;
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          updateStatus("connecting");
          connectWs();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      wsRef.current?.close();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timerRef.current) clearInterval(timerRef.current);
      if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const kickPlayer = (nickname: string) => send({ action: "kick", nickname });
  const startGame = () => send({ action: "start_game" });
  // "next_question" tells backend to end the current question and broadcast show_results
  const endQuestion = () => send({ action: "next_question" });
  const showLeaderboard = () => send({ action: "show_leaderboard" });
  const nextQuestion = () => send({ action: "next" });
  // Show leaderboard to players then immediately advance to the next question
  const skipToNext = () => { autoNextRef.current = true; send({ action: "show_leaderboard" }); };

  const playerJoinUrl = typeof window !== "undefined"
    ? `${window.location.origin}/play/${pin}`
    : `/play/${pin}`;

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Logo size="xxl" iconOnly />
          <div>
            <h1 className="text-4xl font-extrabold leading-none">
              Sparks<span className="text-yellow-400">Quiz</span>
              <span className="text-gray-400 font-normal text-2xl ml-4">PIN: </span>
              <span className="text-yellow-400 tracking-widest text-4xl font-extrabold">{pin}</span>
            </h1>
            <p className="text-gray-300 text-xl mt-2">
              Players join at:{" "}
              <a href={playerJoinUrl} className="text-indigo-400 underline font-semibold" target="_blank" rel="noreferrer">
                {playerJoinUrl}
              </a>
            </p>
          </div>
        </div>
        <div className={`px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wider ${
          status === "lobby" ? "bg-blue-700 text-blue-100" :
          status === "question" ? "bg-green-700 text-green-100" :
          status === "finished" ? "bg-gray-700 text-gray-300" :
          status === "error" ? "bg-red-700 text-red-100" :
          "bg-yellow-700 text-yellow-100"
        }`}>
          {status}
        </div>
      </div>

      {wsError && (
        <div className="bg-red-900/50 border border-red-500 rounded-xl p-4 mb-4 text-red-300 text-sm">
          {wsError}
          <div className="mt-2 font-mono text-xs opacity-70">
            Tried: {WS_URL}/ws/host/{pin}
          </div>
        </div>
      )}

      {/* CONNECTING */}
      {status === "connecting" && !wsError && (
        <div className="text-center mt-20">
          {connectTimedOut ? (
            <>
              <div className="text-5xl mb-4">⚠️</div>
              <p className="text-white text-lg font-semibold mb-2">Could not connect to the game room</p>
              <p className="text-gray-400 text-sm mb-6">The session may have expired or the backend is unreachable.</p>
              <a
                href="/host"
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition"
              >
                ← Return to Dashboard
              </a>
            </>
          ) : (
            <>
              <div className="text-4xl animate-spin mb-4">⚡</div>
              <p className="text-gray-400">Connecting to game room...</p>
            </>
          )}
        </div>
      )}

      {/* LOBBY */}
      {status === "lobby" && (
        <div>
          <div className="bg-[#16213e] rounded-2xl p-5 mb-4">
            <h2 className="text-white font-semibold mb-3">
              Players in lobby ({players.length})
            </h2>
            {players.length === 0 ? (
              <p className="text-gray-500 text-sm">Waiting for players...</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {players.map((p) => (
                  <div
                    key={p.nickname}
                    className="flex items-center justify-between bg-[#0f3460] rounded-lg px-3 py-2"
                  >
                    <span className="text-white text-sm font-medium truncate">{p.nickname}</span>
                    <button
                      onClick={() => kickPlayer(p.nickname)}
                      className="text-red-400 hover:text-red-300 text-xs ml-2 flex-shrink-0"
                    >
                      Kick
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={startGame}
            disabled={players.length === 0}
            className="w-full py-4 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-xl font-bold rounded-2xl transition-all"
          >
            Start Game ({players.length} player{players.length !== 1 ? "s" : ""})
          </button>
        </div>
      )}

      {/* QUESTION */}
      {status === "question" && question && (
        <div className="space-y-4">
          {/* Question progress bar */}
          {totalQuestions > 0 && (
            <div>
              <div className="flex justify-between text-sm text-gray-400 mb-1">
                <span className="font-semibold text-white">
                  Question {questionNum} <span className="text-gray-400 font-normal">of {totalQuestions}</span>
                </span>
                <span>{Math.round((questionNum / totalQuestions) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2.5">
                <div
                  className="bg-indigo-500 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${(questionNum / totalQuestions) * 100}%` }}
                />
              </div>
            </div>
          )}
          <div className="bg-[#16213e] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-400 text-sm uppercase tracking-wider">
                {question.question_type === "multi" ? "Multi-select" : "Single choice"}
              </span>
              <div className={`text-3xl font-bold ${timeLeft <= 5 ? "text-red-400" : "text-yellow-400"}`}>
                {timeLeft}s
              </div>
            </div>
            <p className="text-white text-2xl font-semibold">{question.question_text}</p>
            {question.question_type === "multi" && (
              <p className="text-green-400 text-xl font-black mt-3">
                Select {question.answers.filter((a) => a.is_correct).length} answers
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {question.answers.map((a, i) => (
              <div
                key={a.id}
                className={`rounded-xl p-4 text-white font-semibold flex items-center gap-3 ${
                  ["btn-red", "btn-blue", "btn-yellow", "btn-green"][i % 4]
                }`}
              >
                <span className="text-3xl leading-none">{"♥♠♦♣"[i % 4]}</span>
                <span>{a.answer_text}</span>
              </div>
            ))}
          </div>

          <div className="bg-[#16213e] rounded-xl p-4 flex items-center justify-between">
            <span className="text-gray-400 text-sm">Answers received</span>
            <span className="text-white font-bold">
              {progress.answered} / {progress.total}
            </span>
          </div>

          <button
            onClick={endQuestion}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all"
          >
            End Question &amp; Show Results
          </button>
        </div>
      )}

      {/* RESULT */}
      {status === "result" && question && (
        <div className="space-y-4">
          <div className="bg-[#16213e] rounded-2xl p-5">
            <p className="text-white text-xl font-semibold mb-4">{question.question_text}</p>
            <div className="grid grid-cols-2 gap-3">
              {question.answers.map((a, i) => (
                <div
                  key={a.id}
                  className={`rounded-xl p-4 font-semibold text-white transition-all flex items-center gap-3 ${
                    correctIds.includes(a.id)
                      ? "ring-4 ring-white scale-105 brightness-125"
                      : "opacity-40"
                  } ${["btn-red", "btn-blue", "btn-yellow", "btn-green"][i % 4]}`}
                >
                  <span className="text-3xl leading-none">{"♥♠♦♣"[i % 4]}</span>
                  <span>{correctIds.includes(a.id) && "✓ "}{a.answer_text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-[#16213e] rounded-xl p-4">
            <h3 className="text-white font-semibold mb-2">Top 5</h3>
            <Leaderboard entries={leaderboard.slice(0, 5)} />
          </div>
          <div className="flex gap-3">
            <button
              onClick={showLeaderboard}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all"
            >
              Show Leaderboard
            </button>
            <button
              onClick={skipToNext}
              className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl transition-all"
            >
              Next Question →
            </button>
          </div>
        </div>
      )}

      {/* LEADERBOARD */}
      {status === "leaderboard" && (
        <div className="space-y-4">
          <div className="bg-[#16213e] rounded-2xl p-5">
            <h2 className="text-white font-semibold text-xl mb-4">Leaderboard</h2>
            <Leaderboard entries={leaderboard} />
          </div>
          <button
            onClick={nextQuestion}
            className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl transition-all"
          >
            Next Question
          </button>
        </div>
      )}

      {/* FINISHED */}
      {status === "finished" && (
        <div className="space-y-6">
          <h2 className="text-3xl font-extrabold text-center text-yellow-400">Game Over!</h2>
          <Podium entries={leaderboard} />
          <div className="border-t border-gray-700 pt-4">
            <h3 className="text-white font-semibold text-lg mb-3">Final Rankings</h3>
            <Leaderboard entries={leaderboard} />
          </div>
          <a
            href="/host"
            className="block w-full text-center py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all"
          >
            Back to Dashboard
          </a>
        </div>
      )}
    </div>
  );
}
