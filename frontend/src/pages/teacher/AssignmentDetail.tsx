import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScoreBar from '../../components/ScoreBar';
import type { Assignment, AssignmentStatus, AttemptsSummary, Submission, QuestionGrade } from '../../types';

const STATUS_STYLES: Record<AssignmentStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  published: 'bg-green-100 text-green-700',
  closed: 'bg-red-100 text-red-600',
};

function exportToCSV(assignment: Assignment, submissions: Submission[]) {
  const questions = assignment.questions ?? [];

  const headers = [
    'Student Name',
    'Submitted At',
    ...questions.flatMap((_q, i) => [`Q${i + 1} Score`, `Q${i + 1} Max`]),
    'Total Score',
    'Total Max',
    'Percentage',
    'Overall Feedback',
  ];

  const rows = submissions.map((s) => {
    const gradeMap: Record<string, QuestionGrade> = {};
    s.grades?.forEach((g) => { gradeMap[g.question_id] = g; });

    return [
      `"${s.student_name}"`,
      `"${new Date(s.submitted_at).toLocaleString()}"`,
      ...questions.flatMap((q) => {
        const g = gradeMap[q.id];
        return [g?.score ?? 0, g?.max_score ?? q.max_points];
      }),
      s.total_score,
      s.total_max_score,
      s.total_max_score > 0 ? `${Math.round((s.total_score / s.total_max_score) * 100)}%` : '0%',
      `"${(s.overall_feedback ?? '').replace(/"/g, '""')}"`,
    ];
  });

  const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${assignment.title.replace(/\s+/g, '_')}_results.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AssignmentDetail() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [attemptsSummary, setAttemptsSummary] = useState<AttemptsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = () => {
    if (!assignmentId) return Promise.resolve();
    return Promise.all([
      api.get<Assignment>(`/assignments/${assignmentId}`),
      api.get<Submission[]>(`/assignments/${assignmentId}/submissions`),
      api.get<AttemptsSummary>(`/assignments/${assignmentId}/attempts/summary`),
    ]).then(([aRes, sRes, summaryRes]) => {
      setAssignment(aRes.data);
      setSubmissions(sRes.data);
      setAttemptsSummary(summaryRes.data);
    });
  };

  useEffect(() => {
    if (!assignmentId) return;
    loadData()
      .catch(() => setError('Failed to load assignment data.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  const handlePublish = async () => {
    if (!assignmentId) return;
    setActionLoading(true);
    try {
      await api.post(`/assignments/${assignmentId}/publish`);
      await loadData();
    } catch {
      setError('Failed to publish assignment.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClose = async () => {
    if (!assignmentId || !assignment) return;
    if (!window.confirm(`Close "${assignment.title}"? This will grade all in-progress student answers and can't be undone.`)) return;
    setActionLoading(true);
    try {
      await api.post(`/assignments/${assignmentId}/close`);
      await loadData();
    } catch {
      setError('Failed to close assignment.');
    } finally {
      setActionLoading(false);
    }
  };

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
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{assignment.title}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLES[assignment.status]}`}>
                {assignment.status}
              </span>
            </div>
            <p className="text-gray-500 mt-1">by {assignment.teacher_name}</p>
            {assignment.time_limit_minutes && (
              <div className="flex items-center gap-1.5 mt-1">
                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-indigo-700 font-medium">{assignment.time_limit_minutes} min time limit</span>
                {assignment.published_at && (
                  <span className="text-xs text-gray-400">
                    · auto-closes {new Date(new Date(assignment.published_at).getTime() + assignment.time_limit_minutes * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {assignment.status === 'draft' && (
              <button
                onClick={handlePublish}
                disabled={actionLoading}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? 'Publishing...' : 'Publish Assignment'}
              </button>
            )}
            {assignment.status === 'published' && (
              <button
                onClick={handleClose}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                title="Force-close early and grade any students who haven't submitted yet"
              >
                {actionLoading ? 'Closing...' : 'Force Close Early'}
              </button>
            )}
          </div>
        </div>

        {assignment.status !== 'draft' && (
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
        )}
        {assignment.status === 'draft' && (
          <p className="mt-4 text-xs text-gray-400">
            Publish this assignment to generate a student link and let students start answering.
          </p>
        )}

        {assignment.status !== 'draft' && attemptsSummary && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full font-medium">
              {attemptsSummary.total_started} student{attemptsSummary.total_started === 1 ? '' : 's'} started
            </span>
            {assignment.status === 'published' && (
              <>
                <span className="bg-yellow-100 text-yellow-700 px-2.5 py-1 rounded-full font-medium">
                  {attemptsSummary.in_progress} still writing
                </span>
                <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">
                  {attemptsSummary.graded} graded
                </span>
              </>
            )}
            {assignment.status === 'closed' && (
              <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">
                {attemptsSummary.graded} graded
              </span>
            )}
          </div>
        )}
      </div>

      {/* Questions list */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">
          Questions ({assignment.questions?.length ?? 0})
        </h2>
        <div className="space-y-2">
          {assignment.questions?.map((q, i) => (
            <div key={q.id} className="flex items-start gap-3 bg-gray-50 rounded-lg px-4 py-3">
              <span className="text-xs font-semibold text-indigo-600 mt-0.5">Q{i + 1}</span>
              <span className="text-sm text-gray-800 flex-1">{q.question_text}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                {q.question_type === 'mcq' && (
                  <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-medium">MCQ</span>
                )}
                {q.image_url && (
                  <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">IMG</span>
                )}
                <span className="text-xs text-gray-500">{q.max_points} pts</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Submissions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">
            Submissions ({submissions.length})
          </h2>
          {submissions.length > 0 && (
            <button
              onClick={() => exportToCSV(assignment, submissions)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </button>
          )}
        </div>

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
                  const pct = s.total_max_score > 0 ? (s.total_score / s.total_max_score) * 100 : 0;
                  return (
                    <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 font-medium text-gray-900">{s.student_name}</td>
                      <td className="py-3 text-gray-700">{s.total_score}/{s.total_max_score}</td>
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
