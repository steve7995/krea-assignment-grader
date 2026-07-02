import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useAutosave } from '../../hooks/useAutosave';
import { useHeartbeat } from '../../hooks/useHeartbeat';
import { useTabVisibility } from '../../hooks/useTabVisibility';
import LoadingSpinner from '../../components/LoadingSpinner';
import QuestionCard from '../../components/QuestionCard';
import type { Assignment, Submission } from '../../types';

const MAX_VIOLATIONS = 3;

type Step = 'loading' | 'closed' | 'locked' | 'not-open' | 'active' | 'submitting';

function formatCountdown(ms: number): { text: string; urgent: boolean; critical: boolean } {
  if (ms <= 0) return { text: '0:00', urgent: true, critical: true };
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const text = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
  return { text, urgent: totalSec < 300, critical: totalSec < 60 };
}

export default function StudentView() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState<Step>('loading');
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [violationCount, setViolationCount] = useState(0);
  const [violationBanner, setViolationBanner] = useState('');
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const submittingRef = useRef(false);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = step === 'active';
  const { locked, deadlinePassed } = useHeartbeat(assignmentId, active);
  useAutosave(assignmentId, answers, active, () => setSavedAt(new Date()));

  // ── Auto-submit logic ─────────────────────────────────────────────────────

  const handleAutoSubmit = useCallback(async () => {
    if (!assignmentId || submittingRef.current) return;
    submittingRef.current = true;
    setStep('submitting');
    try {
      const res = await api.post<{ submission_id: string; graded: boolean }>(
        `/assignments/${assignmentId}/attempts/submit`
      );
      navigate(`/results/${res.data.submission_id}`, { replace: true });
    } catch {
      // If already submitted, try to fetch existing submission
      try {
        const sub = await api.get<Submission>(`/assignments/${assignmentId}/my-submission`);
        navigate(`/results/${sub.data.id}`, { replace: true });
      } catch {
        setError('Failed to submit. Please try again.');
        submittingRef.current = false;
        setStep('active');
      }
    }
  }, [assignmentId, navigate]);

  const handleManualSubmit = async () => {
    if (!window.confirm('Submit your answers? You cannot make further changes after this.')) return;
    await handleAutoSubmit();
  };

  // Trigger auto-submit when heartbeat signals deadline passed
  useEffect(() => {
    if (deadlinePassed && step === 'active') handleAutoSubmit();
  }, [deadlinePassed, step, handleAutoSubmit]);

  // ── Tab visibility / violation tracking ──────────────────────────────────

  const showViolationBanner = (msg: string) => {
    setViolationBanner(msg);
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = setTimeout(() => setViolationBanner(''), 6000);
  };

  useTabVisibility(assignmentId, active, (count) => {
    setViolationCount(count);
    if (count >= MAX_VIOLATIONS) {
      handleAutoSubmit();
    } else {
      const remaining = MAX_VIOLATIONS - count;
      showViolationBanner(
        `Tab switch detected (violation ${count}/${MAX_VIOLATIONS}). ${remaining} more will auto-submit your exam.`
      );
    }
  });

  // ── Anti-cheat: keyboard, context menu, beforeunload ─────────────────────

  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Block devtools and view-source shortcuts
      if (e.key === 'F12') { e.preventDefault(); return; }
      if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'i', 'j', 'c'].includes(e.key)) { e.preventDefault(); return; }
      if (e.ctrlKey && ['u', 'U'].includes(e.key)) { e.preventDefault(); return; }
      // Block paste globally (textarea-level blocks cover answers; this covers everything else)
      if (e.ctrlKey && ['v', 'V'].includes(e.key)) { e.preventDefault(); }
    };

    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [active]);

  // ── Fullscreen enforcement ────────────────────────────────────────────────

  useEffect(() => {
    if (!active) return;

    const requestFs = () => {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    };

    const handleFsChange = () => {
      if (!document.fullscreenElement && step === 'active' && !submittingRef.current) {
        setViolationCount((prev) => {
          const next = prev + 1;
          if (next >= MAX_VIOLATIONS) {
            handleAutoSubmit();
          } else {
            const remaining = MAX_VIOLATIONS - next;
            showViolationBanner(
              `You exited fullscreen (violation ${next}/${MAX_VIOLATIONS}). ${remaining} more will auto-submit your exam.`
            );
            // Re-request fullscreen
            setTimeout(requestFs, 500);
          }
          return next;
        });
      }
    };

    requestFs();
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // ── Countdown timer ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!assignment?.time_limit_minutes || !assignment?.published_at || !active) return;

    const deadline = new Date(assignment.published_at).getTime() + assignment.time_limit_minutes * 60 * 1000;

    const tick = () => {
      const remaining = deadline - Date.now();
      setTimeRemaining(remaining);
      if (remaining <= 0) handleAutoSubmit();
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment, active]);

  // ── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!assignmentId) return;

    (async () => {
      try {
        const assignmentRes = await api.get<Assignment>(`/assignments/${assignmentId}`);
        setAssignment(assignmentRes.data);

        if (assignmentRes.data.status === 'closed') {
          try {
            const subRes = await api.get<Submission>(`/assignments/${assignmentId}/my-submission`);
            navigate(`/results/${subRes.data.id}`, { replace: true });
          } catch {
            setStep('not-open');
          }
          return;
        }
        if (assignmentRes.data.status !== 'published') {
          setStep('not-open');
          return;
        }

        await api.post(`/assignments/${assignmentId}/attempts/start`);
        const attemptRes = await api.get(`/assignments/${assignmentId}/attempts/me`);

        // If already graded, go straight to results
        if (attemptRes.data.status === 'graded') {
          try {
            const subRes = await api.get<Submission>(`/assignments/${assignmentId}/my-submission`);
            navigate(`/results/${subRes.data.id}`, { replace: true });
          } catch {
            setStep('not-open');
          }
          return;
        }

        setAnswers(attemptRes.data.answers || {});
        setStep('active');
      } catch {
        setError('Assignment not found or unavailable.');
        setStep('not-open');
      }
    })();
  }, [assignmentId, navigate]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (step === 'loading') return <LoadingSpinner message="Loading assignment..." />;
  if (step === 'submitting') return <LoadingSpinner message="Grading your answers..." />;

  if (error || !assignment) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error || 'Assignment not found.'}
        </div>
      </div>
    );
  }

  if (step === 'not-open') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg px-4 py-3 text-sm">
          This assignment is not currently open for submissions.
        </div>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Already open elsewhere</h2>
        <p className="text-gray-500 text-sm">
          This assignment is currently open in another tab or device. Close it there to continue here.
        </p>
      </div>
    );
  }

  const countdown = timeRemaining !== null ? formatCountdown(timeRemaining) : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">

      {/* Violation banner */}
      {violationBanner && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg max-w-md text-center">
          {violationBanner}
        </div>
      )}

      {/* Header row */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{assignment.title}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {user?.name} &nbsp;&middot;&nbsp; {assignment.questions?.length ?? 0} questions
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {/* Countdown */}
          {countdown && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold ${
              countdown.critical
                ? 'bg-red-100 text-red-700 animate-pulse'
                : countdown.urgent
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-indigo-100 text-indigo-700'
            }`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {countdown.text}
            </div>
          )}
          <span className="text-xs text-gray-400">
            {savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : 'Autosaving...'}
          </span>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-lg px-4 py-3 text-sm mb-4">
        Your answers save automatically as you type.
        {assignment.time_limit_minutes
          ? ` Your exam will auto-submit when the timer reaches 0:00.`
          : ` Click Submit when you're done.`}
        {' '}Results are shown immediately after submission.
      </div>

      {/* Anti-cheat notice */}
      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm mb-6 flex items-start gap-2">
        <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>
          Pasting, right-click, and developer tools are disabled. Switching tabs or exiting fullscreen counts as a violation — <strong>{MAX_VIOLATIONS} violations will auto-submit your exam</strong>. Violations logged: {violationCount}/{MAX_VIOLATIONS}.
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-6">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {assignment.questions?.map((q, i) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={i}
            answer={answers[q.id] ?? ''}
            onAnswerChange={(val) => setAnswers((prev) => ({ ...prev, [q.id]: val }))}
            disablePaste
          />
        ))}
      </div>

      <button
        onClick={handleManualSubmit}
        className="w-full mt-8 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
      >
        Submit Exam
      </button>
    </div>
  );
}
