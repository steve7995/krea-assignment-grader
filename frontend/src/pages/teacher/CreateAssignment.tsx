import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';

interface RubricForm {
  keywords: string; // comma-separated
  concepts_required: string;
  model_answer: string;
  explanation_notes: string;
}

interface QuestionForm {
  question_text: string;
  max_points: number;
  rubric: RubricForm;
}

function emptyQuestion(): QuestionForm {
  return {
    question_text: '',
    max_points: 10,
    rubric: { keywords: '', concepts_required: '', model_answer: '', explanation_notes: '' },
  };
}

export default function CreateAssignment() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [questions, setQuestions] = useState<QuestionForm[]>([emptyQuestion()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdId, setCreatedId] = useState('');

  const updateQuestion = (index: number, field: keyof QuestionForm, value: string | number) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, [field]: value } : q))
    );
  };

  const updateRubric = (index: number, field: keyof RubricForm, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === index ? { ...q, rubric: { ...q.rubric, [field]: value } } : q
      )
    );
  };

  const addQuestion = () => setQuestions((prev) => [...prev, emptyQuestion()]);

  const removeQuestion = (index: number) => {
    if (questions.length === 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const validate = () => {
    if (!title.trim()) return 'Assignment title is required.';
    if (!teacherName.trim()) return 'Teacher name is required.';
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question_text.trim()) return `Question ${i + 1}: question text is required.`;
      if (q.max_points <= 0) return `Question ${i + 1}: max points must be > 0.`;
      if (!q.rubric.keywords.trim()) return `Question ${i + 1}: keywords are required.`;
      if (!q.rubric.concepts_required.trim()) return `Question ${i + 1}: concepts required is required.`;
      if (!q.rubric.model_answer.trim()) return `Question ${i + 1}: model answer is required.`;
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
        teacher_name: teacherName.trim(),
        questions: questions.map((q) => ({
          question_text: q.question_text.trim(),
          max_points: q.max_points,
          rubric: {
            keywords: q.rubric.keywords.split(',').map((k) => k.trim()).filter(Boolean),
            concepts_required: q.rubric.concepts_required.trim(),
            model_answer: q.rubric.model_answer.trim(),
            explanation_notes: q.rubric.explanation_notes.trim(),
          },
        })),
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
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Assignment Created!</h2>
        <p className="text-gray-500 mb-8">Share this link with your students:</p>
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
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Create Assignment</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-800">Assignment Details</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teacher Name</label>
            <input
              type="text"
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              placeholder="Your name"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assignment Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chapter 5 Quiz"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

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

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Question Text</label>
                <textarea
                  rows={2}
                  value={q.question_text}
                  onChange={(e) => updateQuestion(index, 'question_text', e.target.value)}
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
                  onChange={(e) => updateQuestion(index, 'max_points', parseInt(e.target.value) || 1)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

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
