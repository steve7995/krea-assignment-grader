import { useState } from 'react';
import type { Question } from '../types';

interface QuestionCardProps {
  question: Question;
  index: number;
  answer: string;
  onAnswerChange: (value: string) => void;
}

export default function QuestionCard({
  question,
  index,
  answer,
  onAnswerChange,
}: QuestionCardProps) {
  const [hintOpen, setHintOpen] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-7 h-7 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-sm font-semibold">
            {index + 1}
          </span>
          <p className="text-gray-900 font-medium leading-relaxed">
            {question.question_text}
          </p>
        </div>
        <span className="flex-shrink-0 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full whitespace-nowrap">
          {question.max_points} pts
        </span>
      </div>

      <textarea
        value={answer}
        onChange={(e) => onAnswerChange(e.target.value)}
        rows={4}
        placeholder="Type your answer here..."
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
      />

      {question.rubric && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setHintOpen((o) => !o)}
            className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
          >
            <svg
              className={`w-3 h-3 transition-transform ${hintOpen ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {hintOpen ? 'Hide hints' : 'Show hints'}
          </button>

          {hintOpen && (
            <div className="mt-2 p-3 bg-indigo-50 rounded-lg text-xs space-y-2">
              {question.rubric.keywords.length > 0 && (
                <div>
                  <span className="font-semibold text-indigo-700">Keywords: </span>
                  <span className="text-gray-700">
                    {question.rubric.keywords.join(', ')}
                  </span>
                </div>
              )}
              {question.rubric.concepts_required && (
                <div>
                  <span className="font-semibold text-indigo-700">Concepts: </span>
                  <span className="text-gray-700">{question.rubric.concepts_required}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
