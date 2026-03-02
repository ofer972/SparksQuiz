"use client";

import { useState } from "react";

interface AnswerOption { id: number; text: string; }
interface AckData { correct: boolean; points: number; }
interface Props {
  question: { question_text: string; question_type: "single" | "multi"; time_limit: number; correct_count: number; answers: AnswerOption[] };
  timeLeft: number;
  phase: "question" | "answered";
  ack: AckData | null;
  onSubmit: (ids: number[]) => void;
}

const COLORS = ["btn-red", "btn-blue", "btn-yellow", "btn-green"];
const SHAPES = ["♥", "♠", "♦", "♣"];

export default function PlayerController({ question, timeLeft, phase, ack, onSubmit }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const needed = question.question_type === "multi" ? question.correct_count : 1;
  const remaining = Math.max(0, needed - selected.size);

  const toggle = (id: number) => {
    if (phase !== "question") return;
    if (question.question_type === "single") {
      onSubmit([id]);
      setSelected(new Set([id]));
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        // Auto-submit when the required number of answers is reached
        if (next.size === needed) {
          setTimeout(() => onSubmit(Array.from(next)), 0);
        }
        return next;
      });
    }
  };

  const timerPct = (timeLeft / question.time_limit) * 100;

  if (phase === "answered" && ack) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <div className={`text-8xl font-black ${ack.correct ? "text-green-400" : "text-red-400"}`}>
          {ack.correct ? "✓" : "✗"}
        </div>
        <div className="text-center">
          <p className="text-white text-2xl font-bold">
            {ack.correct ? "Correct!" : "Incorrect!"}
          </p>
          {ack.points > 0 && (
            <p className="text-yellow-400 text-4xl font-extrabold mt-2">+{ack.points}</p>
          )}
        </div>
        <p className="text-gray-400 text-sm">Waiting for next question...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-4">
      {/* Timer bar */}
      <div className="h-2 bg-[#16213e] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${
            timerPct > 40 ? "bg-green-500" : timerPct > 20 ? "bg-yellow-400" : "bg-red-500"
          }`}
          style={{ width: `${timerPct}%` }}
        />
      </div>

      {/* Question text */}
      <div className="bg-[#16213e] rounded-2xl p-5 flex items-center justify-between">
        <p className="text-white font-semibold text-lg flex-1">{question.question_text}</p>
        <span className={`text-2xl font-bold ml-4 flex-shrink-0 ${timeLeft <= 5 ? "text-red-400" : "text-gray-300"}`}>
          {timeLeft}
        </span>
      </div>

      {question.question_type === "multi" && (
        <p className={`text-center text-2xl font-black ${remaining === 0 ? "text-green-400" : "text-green-300"}`}>
          {remaining === 0
            ? "✓ Submitting…"
            : remaining === needed
              ? `Select ${needed} answer${needed > 1 ? "s" : ""}`
              : `${remaining} more to select`}
        </p>
      )}

      {/* Answer buttons — 2x2 on mobile, 1x4 on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-1 gap-3 flex-1">
        {question.answers.map((a, i) => {
          const isSelected = selected.has(a.id);
          return (
            <button
              key={a.id}
              onClick={() => toggle(a.id)}
              disabled={phase !== "question"}
              className={`
                ${COLORS[i % 4]}
                ${isSelected ? "selected" : ""}
                rounded-2xl p-4 md:p-5 flex flex-col items-center justify-center gap-2
                text-white font-bold text-base md:text-xl
                transition-all active:scale-95
                disabled:opacity-70
                min-h-[80px] md:min-h-[64px]
              `}
            >
              <span className="text-4xl leading-none">{SHAPES[i % 4]}</span>
              <span className="text-center">{a.text}</span>
            </button>
          );
        })}
      </div>

    </div>
  );
}
