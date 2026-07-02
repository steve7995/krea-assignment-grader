import { useEffect, useRef } from 'react';
import api from '../api/client';

const DEBOUNCE_MS = 1500;

export function useAutosave(
  assignmentId: string | undefined,
  answers: Record<string, string>,
  enabled: boolean,
  onSaved?: () => void
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipFirstRef = useRef(true);

  useEffect(() => {
    if (!assignmentId || !enabled) return;
    // Skip the initial mount/resume — only save on subsequent edits.
    if (skipFirstRef.current) {
      skipFirstRef.current = false;
      return;
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      api
        .put(`/assignments/${assignmentId}/attempts/me`, { answers })
        .then(() => onSaved?.())
        .catch(() => {});
    }, DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, answers, enabled]);
}
