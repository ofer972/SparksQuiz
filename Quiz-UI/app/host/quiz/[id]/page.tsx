"use client";

import { use } from "react";
import QuizEditor from "@/components/QuizEditor";

export default function EditQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <QuizEditor quizId={Number(id)} />;
}
