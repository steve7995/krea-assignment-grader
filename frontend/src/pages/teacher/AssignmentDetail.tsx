import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScoreBar from '../../components/ScoreBar';
import type { Assignment, Submission } from '../../types';

export default function AssignmentDetail() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!assignmentId) return;
    Promise.all([
      api.get<Assignment>(`/assignments/${assignmentId}`),
      api.get<Submission[]>(`/assignments/${assignmentId}/submissions`),
    ])
      .then(([aRes, sRes]) => {
        setAssignment(aRes.data);
        setSubmissions(sRes.data);
      })
      .catch(() => setError('Failed to load assignment data.'))
      .finally(() => setLoading(false));
  }, [assignmentId]);

  if (loading) return <LoadingSpinner message="Loading assignment..." />;
  if (error || !assignment) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error || 'Assignment not found.'}
        </div>
      </div>
    );
  }

  const studentUrl = `${window.location.origin}/student/${assignment.id}`;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <button
        onClick={() => navigate('/teacher/dashboard')}
        className="text-sm text-gray-500 hover:text-gray-700 mb-6 flex items-center gap-1"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{assignment.title}</h1>
        <p className="text-gray-500 mt-1">by {assignment.teacher_name}</p>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs text-gray-500">Student link:</span>
          <code className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded font-mono">
            {studentUrl}
          </code>
          <button
            onClick={() => navigator.clipboard.writeText(studentUrl)}
            className="text-xs text-indigo-600 hover:text-indigo-800"
          >
            Copy
          </button>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">
          Questions ({assignment.questions?.length ?? 0})
        </h2>
        <div className="space-y-2">
          {assignment.questions?.map((q, i) => (
            <div key={q.id} className="flex items-start gap-3 bg-gray-50 rounded-lg px-4 py-3">
              <span className="text-xs font-semibold text-indigo-600 mt-0.5">Q{i + 1}</span>
              <span className="text-sm text-gray-800 flex-1">{q.question_text}</span>
              <span className="text-xs text-gray-500 flex-shrink-0">{q.max_points} pts</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">
          Submissions ({submissions.length})
        </h2>

        {submissions.length === 0 ? (
          <div className="text-center py-12 text-gray-400 border border-dashed border-gray-200 rounded-xl">
            <p className="text-sm">No submissions yet. Share the student link to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="pb-3 font-semibold text-gray-600">Student</th>
                  <th className="pb-3 font-semibold text-gray-600">Score</th>
                  <th className="pb-3 font-semibold text-gray-600 w-40">Grade</th>
                  <th className="pb-3 font-semibold text-gray-600">Submitted</th>
                  <th className="pb-3" />
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => {
                  const pct =
                    s.total_max_score > 0
                      ? (s.total_score / s.total_max_score) * 100
                      : 0;
                  return (
                    <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 font-medium text-gray-900">{s.student_name}</td>
                      <td className="py-3 text-gray-700">
                        {s.total_score}/{s.total_max_score}
                      </td>
                      <td className="py-3 w-40">
                        <ScoreBar percentage={pct} showLabel={false} height="h-2" />
                        <span className="text-xs text-gray-500">{Math.round(pct)}%</span>
                      </td>
                      <td className="py-3 text-gray-500">
                        {new Date(s.submitted_at).toLocaleString()}
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => navigate(`/results/${s.id}`)}
                          className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
