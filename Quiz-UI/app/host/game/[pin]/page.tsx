"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { WS_URL, getSession } from "@/lib/api";
import Leaderboard from "@/components/Leaderboard";
import Podium from "@/components/Podium";
import Logo from "@/components/Logo";
import { QRCodeSVG } from "qrcode.react";

type GameStatus = "connecting" | "lobby" | "question" | "result" | "leaderboard" | "finished" | "error";
type IconSetKey = "elements" | "suits" | "shapes" | "celestial" | "faces";

const ICON_SETS: Record<IconSetKey, { label: string; icons: string[] }> = {
  elements: { label: "Elements",  icons: ["🔥", "💧", "⚡", "🌿"] },
  suits:    { label: "Card Suits", icons: ["♥",  "♠",  "♦",  "♣"]  },
  shapes:   { label: "Shapes",    icons: ["▲",  "◆",  "●",  "■"]  },
  celestial:{ label: "Celestial", icons: ["☀️", "🌙", "⭐", "🌍"] },
  faces:    { label: "Faces",     icons: ["😎", "🤔", "😄", "🤩"] },
};

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
  const [selectedIconSet, setSelectedIconSet] = useState<IconSetKey>("elements");
  const autoNextRef = useRef(false);   // when true, jump to next question as soon as leaderboard arrives
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const connectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const [connectTimedOut, setConnectTimedOut] = useState(false);
  const [shortJoinUrl, setShortJoinUrl] = useState<string | null>(null);
  const hadConnectionRef = useRef(false);
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

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
          hadConnectionRef.current = true;
          // Only switch to lobby if we're still in the initial connecting phase.
          // Mid-game lobby_updates (player join/drop) must not reset the host UI.
          if (statusRef.current === "connecting") updateStatus("lobby");
          break;
        case "question_start":
          hadConnectionRef.current = true;
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
      if (statusRef.current !== "finished") {
        updateStatus("connecting");
        // Try to reconnect after a short delay (e.g. network blip, backend restart)
        setTimeout(() => connectWs(), 2000);
      }
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

  // Fetch session to get short_join_url (persisted in DB; works after refresh)
  useEffect(() => {
    getSession(pin)
      .then((s) => {
        if (s.short_join_url) setShortJoinUrl(s.short_join_url);
      })
      .catch(() => {});
  }, [pin]);

  const kickPlayer = (nickname: string) => send({ action: "kick", nickname });
  const startGame = () => send({ action: "start_game", icon_set: selectedIconSet });
  // "next_question" tells backend to end the current question and broadcast show_results
  const endQuestion = () => send({ action: "next_question" });
  const showLeaderboard = () => send({ action: "show_leaderboard" });
  const nextQuestion = () => send({ action: "next" });
  // Show leaderboard to players then immediately advance to the next question
  const skipToNext = () => { autoNextRef.current = true; send({ action: "show_leaderboard" }); };

  const longJoinUrl = typeof window !== "undefined"
    ? `${window.location.origin}/play/${pin}`
    : `/play/${pin}`;
  const displayJoinUrl = shortJoinUrl ?? longJoinUrl;
  const displayJoinUrlText = displayJoinUrl.replace(/^https?:\/\//, "");

  return (
    <div className="min-h-screen p-3 sm:p-6 max-w-4xl mx-auto overflow-x-hidden">
      {/* Row: left = SparksQuiz + PIN + URL; right = status badge next to QR code */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 items-start mb-4 sm:mb-6">
        <div className="flex items-start gap-2 sm:gap-3 min-w-0">
          <Logo size="xxl" iconOnly />
          <div className="min-w-0 flex-1">
            <h1 className={`font-extrabold leading-tight ${status === "lobby" ? "text-2xl sm:text-4xl md:text-5xl" : "text-xl sm:text-3xl md:text-4xl"}`}>
              Sparks<span className="text-yellow-400">Quiz</span>
            </h1>
            <div className="mt-1 sm:mt-2">
              <p className={`text-gray-400 font-normal ${status === "lobby" ? "text-base sm:text-xl md:text-2xl" : "text-sm sm:text-lg md:text-xl"}`}>
                PIN: <span className={`text-yellow-400 tracking-widest font-extrabold ${status === "lobby" ? "text-xl sm:text-2xl md:text-3xl" : "text-lg sm:text-xl md:text-2xl"}`}>{pin}</span>
              </p>
              <p className={`text-gray-300 mt-0.5 sm:mt-1 ${status === "lobby" ? "text-sm sm:text-xl md:text-2xl" : "text-xs sm:text-lg md:text-xl"}`}>
                Players join at:{" "}
                <a href={displayJoinUrl} className={`text-indigo-400 underline font-semibold break-all ${status === "lobby" ? "text-base sm:text-2xl md:text-3xl" : "text-sm sm:text-xl md:text-2xl"}`} target="_blank" rel="noreferrer">
                  {displayJoinUrlText}
                </a>
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-center md:justify-end items-center gap-3 sm:gap-4 flex-wrap">
          <div className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wider flex-shrink-0 ${
            status === "lobby" ? "bg-blue-700 text-blue-100" :
            status === "question" ? "bg-green-700 text-green-100" :
            status === "finished" ? "bg-gray-700 text-gray-300" :
            status === "error" ? "bg-red-700 text-red-100" :
            "bg-yellow-700 text-yellow-100"
          }`}>
            {status}
          </div>
          <div className="bg-white p-2 sm:p-4 rounded-xl sm:rounded-2xl">
            <QRCodeSVG
              value={displayJoinUrl}
              size={status !== "connecting" && status !== "lobby" ? (isNarrow ? 100 : 135) : (isNarrow ? 140 : 292)}
              level="M"
            />
          </div>
        </div>
      </div>

      {wsError && (
        <div className="bg-red-900/50 border border-red-500 rounded-xl p-3 sm:p-4 mb-3 sm:mb-4 text-red-300 text-xs sm:text-sm">
          {wsError}
          <div className="mt-2 font-mono text-xs opacity-70 break-all">
            Tried: {WS_URL}/ws/host/{pin}
          </div>
        </div>
      )}

      {/* CONNECTING */}
      {status === "connecting" && !wsError && (
        <div className="text-center mt-12 sm:mt-20 px-2">
          {connectTimedOut ? (
            <>
              <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">⚠️</div>
              <p className="text-white text-base sm:text-lg font-semibold mb-2">Could not connect to the game room</p>
              <p className="text-gray-400 text-xs sm:text-sm mb-4 sm:mb-6">The session may have expired or the backend is unreachable.</p>
              <a
                href="/host"
                className="inline-block px-5 py-3 min-h-[48px] bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition touch-manipulation"
              >
                ← Return to Dashboard
              </a>
            </>
          ) : (
            <>
              <div className="text-3xl sm:text-4xl animate-spin mb-3 sm:mb-4">⚡</div>
              <p className="text-gray-400 text-sm sm:text-base">
                {hadConnectionRef.current ? "Connection lost. Reconnecting..." : "Connecting to game room..."}
              </p>
            </>
          )}
        </div>
      )}

      {/* LOBBY */}
      {status === "lobby" && (
        <div>
          <div className="bg-[#16213e] rounded-xl sm:rounded-2xl p-4 sm:p-5 mb-3 sm:mb-4">
            <h2 className="text-white font-semibold text-sm sm:text-base mb-2 sm:mb-3">
              Players in lobby ({players.length})
            </h2>
            {players.length === 0 ? (
              <p className="text-gray-500 text-xs sm:text-sm">Waiting for players...</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {players.map((p) => (
                  <div
                    key={p.nickname}
                    className="flex items-center justify-between bg-[#0f3460] rounded-lg px-2 sm:px-3 py-2 min-h-[44px]"
                  >
                    <span className="text-white text-xs sm:text-sm font-medium truncate">{p.nickname}</span>
                    <button
                      onClick={() => kickPlayer(p.nickname)}
                      className="text-red-400 hover:text-red-300 text-xs ml-2 flex-shrink-0 min-h-[36px] min-w-[44px] touch-manipulation"
                    >
                      Kick
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Icon set selector */}
          <div className="bg-[#16213e] rounded-xl sm:rounded-2xl p-3 sm:p-4 mb-3 sm:mb-4">
            <p className="text-gray-400 text-xs sm:text-sm mb-2 sm:mb-3 font-semibold uppercase tracking-wider">Answer Icons</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {(Object.keys(ICON_SETS) as IconSetKey[]).map((key) => {
                const set = ICON_SETS[key];
                const isSelected = selectedIconSet === key;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedIconSet(key)}
                    type="button"
                    className={`rounded-xl p-2 flex flex-col items-center gap-1 transition-all border-2 min-h-[64px] touch-manipulation ${
                      isSelected ? "border-indigo-400 bg-indigo-900/40" : "border-transparent bg-[#0f3460] hover:border-indigo-600"
                    }`}
                  >
                    <div className="grid grid-cols-2 gap-0.5 text-base leading-tight">
                      {set.icons.map((icon, i) => (
                        <span key={i} className={`flex items-center justify-center rounded text-sm w-6 h-6 ${
                          ["btn-red","btn-blue","btn-yellow","btn-green"][i]
                        }`}>{icon}</span>
                      ))}
                    </div>
                    <span className="text-gray-300 text-xs font-medium">{set.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={startGame}
            disabled={players.length === 0}
            type="button"
            className="w-full py-3 sm:py-4 min-h-[48px] bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-base sm:text-xl font-bold rounded-xl sm:rounded-2xl transition-all touch-manipulation"
          >
            Start Game ({players.length} player{players.length !== 1 ? "s" : ""})
          </button>
        </div>
      )}

      {/* QUESTION */}
      {status === "question" && question && (
        <div className="space-y-3 sm:space-y-4">
          {/* Question progress bar */}
          {totalQuestions > 0 && (
            <div>
              <div className="flex justify-between text-xs sm:text-sm text-gray-400 mb-1">
                <span className="font-semibold text-white">
                  Question {questionNum} <span className="text-gray-400 font-normal">of {totalQuestions}</span>
                </span>
                <span>{Math.round((questionNum / totalQuestions) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2 sm:h-2.5">
                <div
                  className="bg-indigo-500 h-2 sm:h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${(questionNum / totalQuestions) * 100}%` }}
                />
              </div>
            </div>
          )}
          <div className="bg-[#16213e] rounded-xl sm:rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-2 sm:mb-3 gap-2">
              <span className="text-gray-400 text-xs sm:text-sm uppercase tracking-wider">
                {question.question_type === "multi" ? "Multi-select" : "Single choice"}
              </span>
              <div className={`text-2xl sm:text-3xl font-bold flex-shrink-0 ${timeLeft <= 5 ? "text-red-400" : "text-yellow-400"}`}>
                {timeLeft}s
              </div>
            </div>
            <p className="text-white text-lg sm:text-2xl font-semibold break-words">{question.question_text}</p>
            {question.question_type === "multi" && (
              <p className="text-green-400 text-base sm:text-xl font-black mt-2 sm:mt-3">
                Select {question.answers.filter((a) => a.is_correct).length} answers
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {question.answers.map((a, i) => (
              <div
                key={a.id}
                className={`rounded-lg sm:rounded-xl p-3 sm:p-4 min-h-[72px] sm:min-h-0 text-white font-semibold flex flex-col items-center justify-center gap-1 sm:gap-2 ${
                  ["btn-red", "btn-blue", "btn-yellow", "btn-green"][i % 4]
                }`}
              >
                <span className="text-xl sm:text-3xl leading-none">{ICON_SETS[selectedIconSet].icons[i % 4]}</span>
                <span className="text-center text-sm sm:text-2xl font-semibold line-clamp-2 break-words">{a.answer_text}</span>
              </div>
            ))}
          </div>

          <div className="bg-[#16213e] rounded-xl p-3 sm:p-4 flex items-center justify-between">
            <span className="text-gray-400 text-xs sm:text-sm">Answers received</span>
            <span className="text-white font-bold text-sm sm:text-base">
              {progress.answered} / {progress.total}
            </span>
          </div>

          <button
            onClick={endQuestion}
            type="button"
            className="w-full py-3 min-h-[48px] bg-indigo-600 hover:bg-indigo-500 text-white text-base sm:text-lg font-bold rounded-xl transition-all touch-manipulation"
          >
            End Question &amp; Show Results
          </button>
        </div>
      )}

      {/* RESULT */}
      {status === "result" && question && (
        <div className="space-y-3 sm:space-y-4">
          <div className="bg-[#16213e] rounded-xl sm:rounded-2xl p-4 sm:p-5">
            <p className="text-white text-base sm:text-xl font-semibold mb-3 sm:mb-4 break-words">{question.question_text}</p>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {question.answers.map((a, i) => (
                <div
                  key={a.id}
                  className={`rounded-lg sm:rounded-xl p-3 sm:p-4 min-h-[64px] font-semibold text-white transition-all flex flex-col items-center justify-center gap-1 sm:gap-2 ${
                    correctIds.includes(a.id)
                      ? "ring-2 sm:ring-4 ring-white scale-105 brightness-125"
                      : "opacity-40"
                  } ${["btn-red", "btn-blue", "btn-yellow", "btn-green"][i % 4]}`}
                >
                  <span className="text-xl sm:text-3xl leading-none">{ICON_SETS[selectedIconSet].icons[i % 4]}</span>
                  <span className="text-center text-sm sm:text-2xl font-semibold line-clamp-2">{correctIds.includes(a.id) && "✓ "}{a.answer_text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-[#16213e] rounded-xl p-3 sm:p-4">
            <h3 className="text-white font-semibold text-sm sm:text-base mb-2">Top 5</h3>
            <Leaderboard entries={leaderboard.slice(0, 5)} />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={showLeaderboard}
              type="button"
              className="flex-1 py-3 min-h-[48px] bg-indigo-600 hover:bg-indigo-500 text-white text-sm sm:text-base font-bold rounded-xl transition-all touch-manipulation"
            >
              Show Leaderboard
            </button>
            <button
              onClick={skipToNext}
              type="button"
              className="flex-1 py-3 min-h-[48px] bg-green-600 hover:bg-green-500 text-white text-sm sm:text-base font-bold rounded-xl transition-all touch-manipulation"
            >
              Next Question →
            </button>
          </div>
        </div>
      )}

      {/* LEADERBOARD */}
      {status === "leaderboard" && (
        <div className="space-y-3 sm:space-y-4">
          <div className="bg-[#16213e] rounded-xl sm:rounded-2xl p-4 sm:p-5">
            <h2 className="text-white font-semibold text-lg sm:text-xl mb-3 sm:mb-4">Leaderboard</h2>
            <Leaderboard entries={leaderboard} />
          </div>
          <button
            onClick={nextQuestion}
            type="button"
            className="w-full py-3 min-h-[48px] bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl transition-all touch-manipulation"
          >
            Next Question
          </button>
        </div>
      )}

      {/* FINISHED */}
      {status === "finished" && (
        <div className="space-y-4 sm:space-y-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-center text-yellow-400">Game Over!</h2>
          <Podium entries={leaderboard} />
          <div className="border-t border-gray-700 pt-3 sm:pt-4">
            <h3 className="text-white font-semibold text-base sm:text-lg mb-2 sm:mb-3">Final Rankings</h3>
            <Leaderboard entries={leaderboard} />
          </div>
          <a
            href="/host"
            className="block w-full text-center py-3 min-h-[48px] flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all touch-manipulation"
          >
            Back to Dashboard
          </a>
        </div>
      )}
    </div>
  );
}
