"use client";

import { useState } from "react";

interface AnswerOption { id: number; text: string; }
interface AckData { correct: boolean; points: number; }
interface Props {
  question: { question_text: string; question_type: "single" | "multi"; time_limit: number; answers: AnswerOption[] };
  timeLeft: number;
  phase: "question" | "answered";
  ack: AckData | null;
  onSubmit: (ids: number[]) => void;
}

const COLORS = ["btn-red", "btn-blue", "btn-yellow", "btn-green"];
const SHAPES = ["▲", "◆", "●", "■"];

export default function PlayerController({ question, timeLeft, phase, ack, onSubmit }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = (id: number) => {
    if (phase !== "question") return;
    if (question.question_type === "single") {
      // auto-submit on single
      onSubmit([id]);
      setSelected(new Set([id]));
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    }
  };

  const submitMulti = () => {
    if (selected.size === 0) return;
    onSubmit(Array.from(selected));
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
        <p className="text-gray-400 text-xs text-center">Select all correct answers, then tap Submit</p>
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
                rounded-2xl p-4 md:p-5 flex items-center gap-3
                text-white font-bold text-base md:text-xl
                transition-all active:scale-95
                disabled:opacity-70
                min-h-[80px] md:min-h-[64px]
              `}
            >
              <span className="text-2xl">{SHAPES[i % 4]}</span>
              <span className="flex-1 text-left">{a.text}</span>
            </button>
          );
        })}
      </div>

      {/* Multi-select submit button */}
      {question.question_type === "multi" && phase === "question" && (
        <button
          onClick={submitMulti}
          disabled={selected.size === 0}
          className="w-full py-4 bg-white text-black font-extrabold text-xl rounded-2xl disabled:opacity-30 transition-all active:scale-95"
        >
          SUBMIT ({selected.size} selected)
        </button>
      )}
    </div>
  );
}
