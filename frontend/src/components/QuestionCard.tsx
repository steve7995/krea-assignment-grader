import { useState, useRef } from 'react';
import type { Question } from '../types';
import api from '../api/client';

interface QuestionCardProps {
  question: Question;
  index: number;
  answer: string;
  onAnswerChange: (value: string) => void;
  disablePaste?: boolean;
}

export default function QuestionCard({ question, index, answer, onAnswerChange, disablePaste = false }: QuestionCardProps) {
  const [hintOpen, setHintOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const isMcq = question.question_type === 'mcq';
  const isImageAnswer = answer.startsWith('[IMAGE]');
  const imagePreviewUrl = isImageAnswer ? answer.slice(7) : null;

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    setUploadError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post<{ url: string }>('/upload-image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onAnswerChange(`[IMAGE]${res.data.url}`);
    } catch {
      setUploadError('Image upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-7 h-7 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-sm font-semibold">
            {index + 1}
          </span>
          <div>
            <p className="text-gray-900 font-medium leading-relaxed">{question.question_text}</p>
            {isMcq && (
              <span className="inline-block mt-1 text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-medium">
                Multiple Choice
              </span>
            )}
          </div>
        </div>
        <span className="flex-shrink-0 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full whitespace-nowrap">
          {question.max_points} pts
        </span>
      </div>

      {/* Image */}
      {question.image_url && (
        <div className="mb-4 rounded-lg overflow-hidden border border-gray-200">
          <img
            src={question.image_url}
            alt="Question visual"
            className="w-full max-h-80 object-contain bg-gray-50"
          />
        </div>
      )}

      {/* MCQ options */}
      {isMcq ? (
        <div className="space-y-2">
          {(question.options ?? []).map((option, i) => (
            <label
              key={i}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                answer === String(i)
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name={`question-${question.id}`}
                value={String(i)}
                checked={answer === String(i)}
                onChange={() => onAnswerChange(String(i))}
                className="accent-indigo-600"
              />
              <span className="text-sm text-gray-800">{option}</span>
            </label>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Image answer preview */}
          {imagePreviewUrl ? (
            <div className="relative inline-block">
              <img
                src={imagePreviewUrl}
                alt="Your answer"
                className="max-h-64 rounded-lg border border-gray-200 object-contain bg-gray-50"
              />
              <button
                type="button"
                onClick={() => { onAnswerChange(''); if (fileRef.current) fileRef.current.value = ''; }}
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
              >
                ×
              </button>
            </div>
          ) : (
            <textarea
              value={answer}
              onChange={(e) => onAnswerChange(e.target.value)}
              onPaste={disablePaste ? (e) => e.preventDefault() : undefined}
              onDrop={disablePaste ? (e) => e.preventDefault() : undefined}
              onContextMenu={disablePaste ? (e) => e.preventDefault() : undefined}
              rows={4}
              placeholder="Type your answer here..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          )}

          {/* Image upload option */}
          {!imagePreviewUrl && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">or</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={fileRef}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
                {uploading ? 'Uploading...' : 'Upload image instead'}
              </button>
            </div>
          )}

          {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
        </div>
      )}

      {/* Hints — only for open-ended */}
      {!isMcq && question.rubric && (
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
                  <span className="text-gray-700">{question.rubric.keywords.join(', ')}</span>
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
