import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface RubricForm {
  keywords: string;
  concepts_required: string;
  model_answer: string;
  explanation_notes: string;
}

interface QuestionForm {
  question_text: string;
  max_points: number;
  question_type: 'open_ended' | 'mcq';
  options: string[];
  correct_option: number;
  image_url: string;
  image_uploading: boolean;
  rubric: RubricForm;
}

function emptyQuestion(): QuestionForm {
  return {
    question_text: '',
    max_points: 10,
    question_type: 'open_ended',
    options: ['', '', '', ''],
    correct_option: 0,
    image_url: '',
    image_uploading: false,
    rubric: { keywords: '', concepts_required: '', model_answer: '', explanation_notes: '' },
  };
}

export default function CreateAssignment() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number | ''>('');
  const [questions, setQuestions] = useState<QuestionForm[]>([emptyQuestion()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdId, setCreatedId] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);

  const updateQuestion = (index: number, updates: Partial<QuestionForm>) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...updates } : q)));
  };

  const updateRubric = (index: number, field: keyof RubricForm, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, rubric: { ...q.rubric, [field]: value } } : q))
    );
  };

  const updateOption = (qIndex: number, optIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const opts = [...q.options];
        opts[optIndex] = value;
        return { ...q, options: opts };
      })
    );
  };

  const handleImageUpload = async (qIndex: number, file: File) => {
    updateQuestion(qIndex, { image_uploading: true });
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post<{ url: string }>('/upload-image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      updateQuestion(qIndex, { image_url: res.data.url, image_uploading: false });
    } catch {
      updateQuestion(qIndex, { image_uploading: false });
      setError(`Failed to upload image for question ${qIndex + 1}.`);
    }
  };

  const addQuestion = () => setQuestions((prev) => [...prev, emptyQuestion()]);

  const removeQuestion = (index: number) => {
    if (questions.length === 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const validate = () => {
    if (!title.trim()) return 'Assignment title is required.';
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question_text.trim()) return `Question ${i + 1}: question text is required.`;
      if (q.max_points <= 0) return `Question ${i + 1}: max points must be > 0.`;
      if (q.question_type === 'mcq') {
        const filled = q.options.filter((o) => o.trim());
        if (filled.length < 2) return `Question ${i + 1}: at least 2 options are required.`;
      } else {
        if (!q.rubric.keywords.trim()) return `Question ${i + 1}: keywords are required.`;
        if (!q.rubric.concepts_required.trim()) return `Question ${i + 1}: concepts required is required.`;
        if (!q.rubric.model_answer.trim()) return `Question ${i + 1}: model answer is required.`;
      }
    }
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setIsSubmitting(true);
    setError('');
    try {
      const payload = {
        title: title.trim(),
        time_limit_minutes: timeLimitMinutes !== '' ? timeLimitMinutes : null,
        questions: questions.map((q) => {
          if (q.question_type === 'mcq') {
            const filledOptions = q.options.filter((o) => o.trim());
            return {
              question_text: q.question_text.trim(),
              max_points: q.max_points,
              question_type: 'mcq',
              options: filledOptions,
              image_url: q.image_url || null,
              rubric: {
                keywords: [],
                concepts_required: '',
                model_answer: String(q.correct_option),
                explanation_notes: '',
              },
            };
          }
          return {
            question_text: q.question_text.trim(),
            max_points: q.max_points,
            question_type: 'open_ended',
            options: [],
            image_url: q.image_url || null,
            rubric: {
              keywords: q.rubric.keywords.split(',').map((k) => k.trim()).filter(Boolean),
              concepts_required: q.rubric.concepts_required.trim(),
              model_answer: q.rubric.model_answer.trim(),
              explanation_notes: q.rubric.explanation_notes.trim(),
            },
          };
        }),
      };
      const res = await api.post('/assignments', payload);
      setCreatedId(res.data.assignment_id);
    } catch {
      setError('Failed to create assignment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (createdId) {
    const studentUrl = `${window.location.origin}/student/${createdId}`;

    const handlePublish = async () => {
      setPublishing(true);
      setError('');
      try {
        await api.post(`/assignments/${createdId}/publish`);
        setPublished(true);
      } catch {
        setError('Failed to publish assignment. Please try again.');
      } finally {
        setPublishing(false);
      }
    };

    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Assignment Created!</h2>

        {!published ? (
          <>
            <p className="text-gray-500 mb-8">
              It's saved as a draft. Publish it to open it for students and get the shareable link.
            </p>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-6">
                {error}
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm"
              >
                {publishing ? 'Publishing...' : 'Publish Now'}
              </button>
              <button
                onClick={() => navigate('/teacher/dashboard')}
                className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
              >
                Publish Later from Dashboard
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-gray-500 mb-8">Published! Share this link with your students:</p>
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6">
              <p className="font-mono text-sm text-indigo-800 break-all">{studentUrl}</p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => navigator.clipboard.writeText(studentUrl)}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
              >
                Copy Link
              </button>
              <button
                onClick={() => navigate('/teacher/dashboard')}
                className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
              >
                Go to Dashboard
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Create Assignment</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Assignment details */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Assignment Details</h2>
            <span className="text-xs text-gray-400">Creating as {user?.name}</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assignment Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Business Strategy — Competitive Analysis Assignment"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Time Limit <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={480}
                value={timeLimitMinutes}
                onChange={(e) => setTimeLimitMinutes(e.target.value ? parseInt(e.target.value) : '')}
                placeholder="e.g. 60"
                className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-500">minutes</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Leave blank for no limit. Timer starts when the assignment is published — students auto-submit when time runs out.
            </p>
          </div>
        </div>

        {/* Questions */}
        {questions.map((q, index) => (
          <div key={index} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Question {index + 1}</h2>
              {questions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeQuestion(index)}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>

            {/* Type selector */}
            <div className="flex gap-2">
              {(['open_ended', 'mcq'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => updateQuestion(index, { question_type: type })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    q.question_type === type
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                  }`}
                >
                  {type === 'open_ended' ? 'Open Ended' : 'Multiple Choice'}
                </button>
              ))}
            </div>

            {/* Question text + max points */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Question Text</label>
                <textarea
                  rows={2}
                  value={q.question_text}
                  onChange={(e) => updateQuestion(index, { question_text: e.target.value })}
                  placeholder="Write your question..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
              <div className="w-24">
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Points</label>
                <input
                  type="number"
                  min={1}
                  value={q.max_points}
                  onChange={(e) => updateQuestion(index, { max_points: parseInt(e.target.value) || 1 })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Image upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Image <span className="text-gray-400 font-normal">(optional — flowchart, diagram, etc.)</span>
              </label>
              {q.image_url ? (
                <div className="relative inline-block">
                  <img
                    src={q.image_url}
                    alt="Question"
                    className="h-32 rounded-lg border border-gray-200 object-contain bg-gray-50"
                  />
                  <button
                    type="button"
                    onClick={() => updateQuestion(index, { image_url: '' })}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={(el) => { fileRefs.current[index] = el; }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(index, file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileRefs.current[index]?.click()}
                    disabled={q.image_uploading}
                    className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors disabled:opacity-50"
                  >
                    {q.image_uploading ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    )}
                    {q.image_uploading ? 'Uploading...' : 'Upload Image'}
                  </button>
                </div>
              )}
            </div>

            {/* MCQ options */}
            {q.question_type === 'mcq' && (
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <h3 className="text-sm font-semibold text-indigo-700">Answer Options</h3>
                {q.options.map((opt, optIdx) => (
                  <div key={optIdx} className="flex items-center gap-3">
                    <input
                      type="radio"
                      name={`correct-${index}`}
                      checked={q.correct_option === optIdx}
                      onChange={() => updateQuestion(index, { correct_option: optIdx })}
                      className="accent-indigo-600 flex-shrink-0"
                      title="Mark as correct answer"
                    />
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => updateOption(index, optIdx, e.target.value)}
                      placeholder={`Option ${optIdx + 1}`}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {q.correct_option === optIdx && (
                      <span className="text-xs text-green-600 font-medium flex-shrink-0">✓ Correct</span>
                    )}
                  </div>
                ))}
                <p className="text-xs text-gray-400">Select the radio button next to the correct answer.</p>
              </div>
            )}

            {/* Open-ended rubric */}
            {q.question_type === 'open_ended' && (
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <h3 className="text-sm font-semibold text-indigo-700">Rubric</h3>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Keywords <span className="text-gray-400">(comma-separated)</span>
                  </label>
                  <input
                    type="text"
                    value={q.rubric.keywords}
                    onChange={(e) => updateRubric(index, 'keywords', e.target.value)}
                    placeholder="photosynthesis, chlorophyll, glucose"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Concepts Required</label>
                  <textarea
                    rows={2}
                    value={q.rubric.concepts_required}
                    onChange={(e) => updateRubric(index, 'concepts_required', e.target.value)}
                    placeholder="Student must demonstrate understanding of..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Model Answer</label>
                  <textarea
                    rows={3}
                    value={q.rubric.model_answer}
                    onChange={(e) => updateRubric(index, 'model_answer', e.target.value)}
                    placeholder="The ideal answer is..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Explanation Notes <span className="text-gray-400">(optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={q.rubric.explanation_notes}
                    onChange={(e) => updateRubric(index, 'explanation_notes', e.target.value)}
                    placeholder="Additional grading notes for the AI..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={addQuestion}
          className="w-full py-3 border-2 border-dashed border-indigo-300 text-indigo-600 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-colors text-sm font-medium"
        >
          + Add Question
        </button>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? 'Creating...' : 'Create Assignment'}
        </button>
      </form>
    </div>
  );
}
