"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getQuiz, createQuiz, updateQuiz } from "@/lib/api";

interface AnswerDraft { answer_text: string; is_correct: boolean; }
interface QuestionDraft {
  question_text: string;
  question_type: "single" | "multi";
  time_limit: number;
  answers: AnswerDraft[];
}

const emptyQuestion = (): QuestionDraft => ({
  question_text: "",
  question_type: "single",
  time_limit: 20,
  answers: [
    { answer_text: "", is_correct: false },
    { answer_text: "", is_correct: false },
    { answer_text: "", is_correct: false },
    { answer_text: "", is_correct: false },
  ],
});

const ANSWER_COLORS = ["btn-red", "btn-blue", "btn-yellow", "btn-green"];
const ANSWER_LABELS = ["A", "B", "C", "D"];

export default function QuizEditor({ quizId }: { quizId?: number }) {
  const router = useRouter();
  const isEdit = !!quizId;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([emptyQuestion()]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [activeQ, setActiveQ] = useState(0);

  useEffect(() => {
    if (!quizId) return;
    getQuiz(quizId).then((quiz) => {
      setTitle(quiz.title);
      setDescription(quiz.description ?? "");
      setQuestions(
        quiz.questions.map((q) => ({
          question_text: q.question_text,
          question_type: q.question_type as "single" | "multi",
          time_limit: q.time_limit,
          answers: q.answers.map((a) => ({ answer_text: a.answer_text, is_correct: a.is_correct })),
        }))
      );
    }).finally(() => setLoading(false));
  }, [quizId]);

  const setQuestion = (idx: number, patch: Partial<QuestionDraft>) =>
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));

  const setAnswer = (qi: number, ai: number, patch: Partial<AnswerDraft>) =>
    setQuestions((qs) =>
      qs.map((q, i) =>
        i !== qi
          ? q
          : {
              ...q,
              answers: q.answers.map((a, j) => (j === ai ? { ...a, ...patch } : a)),
            }
      )
    );

  const toggleCorrect = (qi: number, ai: number) => {
    const q = questions[qi];
    if (q.question_type === "single") {
      setQuestion(qi, {
        answers: q.answers.map((a, j) => ({ ...a, is_correct: j === ai })),
      });
    } else {
      setAnswer(qi, ai, { is_correct: !q.answers[ai].is_correct });
    }
  };

  const addAnswer = (qi: number) =>
    setQuestions((qs) =>
      qs.map((q, i) =>
        i !== qi ? q : { ...q, answers: [...q.answers, { answer_text: "", is_correct: false }] }
      )
    );

  const removeAnswer = (qi: number, ai: number) =>
    setQuestions((qs) =>
      qs.map((q, i) => (i !== qi ? q : { ...q, answers: q.answers.filter((_, j) => j !== ai) }))
    );

  const addQuestion = () => {
    setQuestions((qs) => [...qs, emptyQuestion()]);
    setActiveQ(questions.length);
  };

  const removeQuestion = (qi: number) => {
    setQuestions((qs) => qs.filter((_, i) => i !== qi));
    setActiveQ(Math.max(0, activeQ - 1));
  };

  const handleSave = async () => {
    if (!title.trim()) return alert("Quiz title is required");
    if (questions.length === 0) return alert("Add at least one question");
    for (const [qi, q] of questions.entries()) {
      if (!q.question_text.trim()) return alert(`Question ${qi + 1} has no text`);
      if (q.answers.length < 2) return alert(`Question ${qi + 1} needs at least 2 answers`);
      if (q.answers.some((a) => !a.answer_text.trim())) return alert(`Question ${qi + 1} has a blank answer option`);
      if (!q.answers.some((a) => a.is_correct)) return alert(`Question ${qi + 1} needs a correct answer`);
    }
    setSaving(true);
    try {
      const body = { title, description, questions };
      if (isEdit) {
        await updateQuiz(quizId, body);
      } else {
        await createQuiz(body);
      }
      router.push("/host");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>;

  const q = questions[activeQ];

  return (
    <div className="min-h-screen p-3 sm:p-4 max-w-5xl mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-4 sm:mb-6">
        <button
          onClick={() => router.push("/host")}
          className="text-gray-400 hover:text-white text-sm min-h-[44px] min-w-[44px] flex items-center touch-manipulation"
        >
          &larr; Back
        </button>
        <h1 className="text-lg sm:text-2xl font-bold text-white flex-1 min-w-0">
          {isEdit ? "Edit Quiz" : "New Quiz"}
        </h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 sm:px-6 py-2.5 min-h-[44px] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-all touch-manipulation text-sm sm:text-base"
        >
          {saving ? "Saving..." : "Save Quiz"}
        </button>
      </div>

      {/* Quiz meta */}
      <div className="bg-[#16213e] rounded-xl sm:rounded-2xl p-4 sm:p-5 mb-4 sm:mb-6 space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Quiz title *"
          className="w-full bg-[#0f3460] text-white rounded-xl px-4 py-3 text-base sm:text-lg font-semibold placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="w-full bg-[#0f3460] text-white rounded-xl px-4 py-2 text-sm sm:text-base placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Question list — horizontal scroll on mobile, sidebar on desktop */}
        <div className="lg:w-80 lg:min-w-0 lg:flex-shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0 lg:space-y-2 scrollbar-thin">
            {questions.map((qu, i) => (
              <button
                key={i}
                onClick={() => setActiveQ(i)}
                type="button"
                className={`flex-shrink-0 lg:w-full text-left px-3 py-2.5 rounded-xl transition-all min-h-[56px] touch-manipulation w-[85vw] max-w-[320px] lg:max-w-none ${
                  i === activeQ
                    ? "bg-indigo-600 text-white"
                    : "bg-[#16213e] text-gray-400 hover:bg-[#1e2d50]"
                }`}
              >
                <span className="text-xs sm:text-sm font-medium opacity-80">Q{i + 1}</span>
                <span className="block text-xs sm:text-sm mt-0.5 line-clamp-2 leading-snug">
                  {qu.question_text.trim() || "Untitled question"}
                </span>
                <span className={`inline-block mt-1.5 text-xs font-medium px-1.5 py-0.5 rounded ${
                  qu.question_type === "multi"
                    ? "bg-amber-600/30 text-amber-200"
                    : "bg-slate-500/30 text-slate-300"
                }`}>
                  {qu.question_type === "single" ? "Single" : "Multi"}
                </span>
              </button>
            ))}
            <button
              onClick={addQuestion}
              type="button"
              className="flex-shrink-0 lg:w-full px-3 py-2 min-h-[48px] bg-[#16213e] hover:bg-[#1e2d50] text-gray-400 hover:text-white rounded-xl text-sm font-medium transition-all touch-manipulation w-[85vw] max-w-[320px] lg:max-w-none"
            >
              + Add Question
            </button>
          </div>
        </div>

        {/* Active question editor */}
        {q && (
          <div className="flex-1 min-w-0 bg-[#16213e] rounded-xl sm:rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-white font-semibold text-base sm:text-lg">Question {activeQ + 1}</h3>
              {questions.length > 1 && (
                <button
                  onClick={() => removeQuestion(activeQ)}
                  className="text-red-400 hover:text-red-300 text-sm min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
                >
                  Remove
                </button>
              )}
            </div>

            <textarea
              value={q.question_text}
              onChange={(e) => setQuestion(activeQ, { question_text: e.target.value })}
              placeholder="Enter your question..."
              rows={3}
              className="w-full bg-[#0f3460] text-white rounded-xl px-4 py-3 text-base sm:text-lg placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />

            <div className="flex gap-3 sm:gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-gray-400 text-xs sm:text-sm">Type:</label>
                <select
                  value={q.question_type}
                  onChange={(e) =>
                    setQuestion(activeQ, { question_type: e.target.value as "single" | "multi" })
                  }
                  className="bg-[#0f3460] text-white rounded-lg px-3 py-2 text-sm outline-none min-h-[44px] touch-manipulation"
                >
                  <option value="single">Single choice</option>
                  <option value="multi">Multi choice</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-gray-400 text-xs sm:text-sm">Timer:</label>
                <select
                  value={q.time_limit}
                  onChange={(e) => setQuestion(activeQ, { time_limit: Number(e.target.value) })}
                  className="bg-[#0f3460] text-white rounded-lg px-3 py-2 text-sm outline-none min-h-[44px] touch-manipulation"
                >
                  {[10, 15, 20, 30, 45, 60].map((t) => (
                    <option key={t} value={t}>{t}s</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <p className="text-gray-400 text-xs sm:text-sm mb-2 sm:mb-3">
                {q.question_type === "single"
                  ? "Tap an answer to mark it correct"
                  : "Tap answers to mark correct (multiple allowed)"}
              </p>
              <div className="flex flex-col gap-2 sm:gap-3">
                {q.answers.map((a, ai) => (
                  <div key={ai} className="flex items-center gap-2 sm:gap-3">
                    <button
                      onClick={() => toggleCorrect(activeQ, ai)}
                      type="button"
                      className={`w-10 h-10 sm:w-9 sm:h-9 rounded-full flex-shrink-0 font-bold text-white text-sm transition-all touch-manipulation ${
                        ANSWER_COLORS[ai % 4]
                      } ${a.is_correct ? "ring-2 ring-white scale-105" : "opacity-70"}`}
                    >
                      {ANSWER_LABELS[ai % 4]}
                    </button>
                    <textarea
                      value={a.answer_text}
                      onChange={(e) => setAnswer(activeQ, ai, { answer_text: e.target.value })}
                      placeholder={`Answer ${ANSWER_LABELS[ai % 4]}`}
                      rows={2}
                      className="flex-1 min-w-0 bg-[#0f3460] text-white rounded-lg px-3 py-2 text-sm placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                    {q.answers.length > 2 && (
                      <button
                        onClick={() => removeAnswer(activeQ, ai)}
                        type="button"
                        className="text-gray-500 hover:text-red-400 text-lg leading-none flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {q.answers.length < 6 && (
                <button
                  onClick={() => addAnswer(activeQ)}
                  type="button"
                  className="mt-3 text-indigo-400 hover:text-indigo-300 text-sm min-h-[44px] flex items-center touch-manipulation"
                >
                  + Add answer option
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
