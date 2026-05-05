import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ScoreBar from '../components/ScoreBar';
import type { Submission, QuestionGrade } from '../types';

function RubricBreakdownBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{label}</span>
        <span>{score}%</span>
      </div>
      <ScoreBar percentage={score} showLabel={false} height="h-1.5" />
    </div>
  );
}

function QuestionResult({ grade, questionText, index }: {
  grade: QuestionGrade;
  questionText?: string;
  index: number;
}) {
  const pct = grade.max_score > 0 ? (grade.score / grade.max_score) * 100 : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-7 h-7 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-sm font-semibold">
            {index + 1}
          </span>
          <p className="text-gray-800 text-sm font-medium leading-relaxed">
            {questionText ?? `Question ${index + 1}`}
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <span className="text-2xl font-bold text-gray-900">{grade.score}</span>
          <span className="text-gray-400">/{grade.max_score}</span>
        </div>
      </div>

      <div className="mb-4">
        <ScoreBar percentage={pct} showLabel={false} height="h-2" />
        <p className="text-xs text-gray-500 mt-1">{Math.round(pct)}%</p>
      </div>

      <p className="text-sm text-gray-700 mb-4 leading-relaxed">{grade.feedback}</p>

      <div className="flex flex-wrap gap-2 mb-4">
        {grade.keywords_found.map((kw) => (
          <span key={kw} className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
            ✓ {kw}
          </span>
        ))}
        {grade.keywords_missing.map((kw) => (
          <span key={kw} className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
            ✗ {kw}
          </span>
        ))}
      </div>

      {grade.rubric_breakdown && (
        <div className="border-t border-gray-100 pt-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Rubric Breakdown</p>
          <RubricBreakdownBar label="Keywords" score={grade.rubric_breakdown.keywords_score} />
          <RubricBreakdownBar label="Concepts" score={grade.rubric_breakdown.concepts_score} />
          <RubricBreakdownBar label="Explanation" score={grade.rubric_breakdown.explanation_score} />
          <RubricBreakdownBar label="Accuracy" score={grade.rubric_breakdown.accuracy_score} />
        </div>
      )}
    </div>
  );
}

export default function Results() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const navigate = useNavigate();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [questionTexts, setQuestionTexts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!submissionId) return;
    api
      .get<Submission>(`/submissions/${submissionId}`)
      .then(async (res) => {
        const sub = res.data;
        setSubmission(sub);
        try {
          const aRes = await api.get(`/assignments/${sub.assignment_id}`);
          const texts: Record<string, string> = {};
          aRes.data.questions?.forEach((q: { id: string; question_text: string }) => {
            texts[q.id] = q.question_text;
          });
          setQuestionTexts(texts);
        } catch {
          // non-critical
        }
      })
      .catch(() => setError('Failed to load results.'))
      .finally(() => setLoading(false));
  }, [submissionId]);

  if (loading) return <LoadingSpinner message="Loading results..." />;
  if (error || !submission) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error || 'Results not found.'}
        </div>
      </div>
    );
  }

  const totalPct =
    submission.total_max_score > 0
      ? (submission.total_score / submission.total_max_score) * 100
      : 0;

  const gradeLabel =
    totalPct >= 90
      ? 'Excellent'
      : totalPct >= 75
      ? 'Good'
      : totalPct >= 60
      ? 'Satisfactory'
      : totalPct >= 50
      ? 'Needs Improvement'
      : 'Unsatisfactory';

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="text-center mb-10">
        <p className="text-gray-500 text-sm mb-1">Results for</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">{submission.student_name}</h1>

        <div className="inline-flex flex-col items-center bg-white border border-gray-200 rounded-2xl px-10 py-6 shadow-sm mb-6">
          <span className="text-5xl font-bold text-gray-900">
            {submission.total_score}
            <span className="text-2xl text-gray-400 font-normal">/{submission.total_max_score}</span>
          </span>
          <span className={`mt-2 text-sm font-semibold ${totalPct >= 75 ? 'text-green-600' : totalPct >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
            {gradeLabel}
          </span>
        </div>

        <div className="max-w-xs mx-auto">
          <ScoreBar percentage={totalPct} />
        </div>

        {submission.overall_feedback && (
          <div className="mt-6 bg-indigo-50 border border-indigo-100 rounded-xl p-5 text-left">
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">Overall Feedback</p>
            <p className="text-sm text-gray-700 leading-relaxed">{submission.overall_feedback}</p>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-gray-800">Question Breakdown</h2>
        {(submission.grades ?? []).map((grade, i) => (
          <QuestionResult
            key={grade.question_id}
            grade={grade}
            questionText={questionTexts[grade.question_id]}
            index={i}
          />
        ))}
      </div>

      <div className="mt-10 text-center">
        <button
          onClick={() => navigate('/')}
          className="text-sm text-indigo-600 hover:text-indigo-800"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
