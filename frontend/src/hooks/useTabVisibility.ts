import { useEffect, useRef } from 'react';
import api from '../api/client';

export function useTabVisibility(
  assignmentId: string | undefined,
  enabled: boolean,
  onViolation?: (count: number) => void,
) {
  const countRef = useRef(0);
  const onViolationRef = useRef(onViolation);
  onViolationRef.current = onViolation;

  useEffect(() => {
    if (!assignmentId || !enabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        countRef.current += 1;
        api.post(`/assignments/${assignmentId}/attempts/tab-event`).catch(() => {});
        onViolationRef.current?.(countRef.current);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [assignmentId, enabled]);
}
