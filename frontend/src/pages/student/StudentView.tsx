import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';
import QuestionCard from '../../components/QuestionCard';
import type { Assignment } from '../../types';

type Step = 'name' | 'quiz' | 'submitting';

export default function StudentView() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loadingAssignment, setLoadingAssignment] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [step, setStep] = useState<Step>('name');
  const [studentName, setStudentName] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!assignmentId) return;
    api
      .get<Assignment>(`/assignments/${assignmentId}`)
      .then((res) => {
        setAssignment(res.data);
        const initial: Record<string, string> = {};
        res.data.questions?.forEach((q) => { initial[q.id] = ''; });
        setAnswers(initial);
      })
      .catch(() => setLoadError('Assignment not found or unavailable.'))
      .finally(() => setLoadingAssignment(false));
  }, [assignmentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignment) return;

    const unanswered = assignment.questions?.filter((q) => !answers[q.id]?.trim());
    if (unanswered?.length) {
      setSubmitError(`Please answer all questions (${unanswered.length} remaining).`);
      return;
    }

    setStep('submitting');
    setSubmitError('');

    try {
      const payload = {
        student_name: studentName.trim(),
        answers: Object.entries(answers).map(([question_id, answer_text]) => ({
          question_id,
          answer_text,
        })),
      };
      const res = await api.post(`/assignments/${assignmentId}/submit`, payload);
      navigate(`/results/${res.data.submission_id}`);
    } catch {
      setSubmitError('Submission failed. Please try again.');
      setStep('quiz');
    }
  };

  if (loadingAssignment) return <LoadingSpinner message="Loading assignment..." />;

  if (loadError || !assignment) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {loadError || 'Assignment not found.'}
        </div>
      </div>
    );
  }

  if (step === 'submitting') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <LoadingSpinner message="AI is grading your answers... This may take up to 15 seconds." />
      </div>
    );
  }

  if (step === 'name') {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{assignment.title}</h1>
        <p className="text-gray-500 text-sm mb-8">by {assignment.teacher_name}</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (studentName.trim()) setStep('quiz');
          }}
          className="space-y-4"
        >
          <input
            type="text"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            placeholder="Enter your full name"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center"
            autoFocus
          />
          <button
            type="submit"
            disabled={!studentName.trim()}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Start Assignment
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{assignment.title}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {studentName} &nbsp;&middot;&nbsp; {assignment.questions?.length ?? 0} questions
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {assignment.questions?.map((q, i) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={i}
            answer={answers[q.id] ?? ''}
            onAnswerChange={(val) => setAnswers((prev) => ({ ...prev, [q.id]: val }))}
          />
        ))}

        {submitError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {submitError}
          </div>
        )}

        <button
          type="submit"
          className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
        >
          Submit for Grading
        </button>
      </form>
    </div>
  );
}
