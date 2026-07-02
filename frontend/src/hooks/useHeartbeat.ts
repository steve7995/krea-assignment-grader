import { useEffect, useRef, useState } from 'react';
import api from '../api/client';

const HEARTBEAT_INTERVAL_MS = 10000;

function randomToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useHeartbeat(assignmentId: string | undefined, enabled: boolean) {
  const [locked, setLocked] = useState(false);
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  const sessionTokenRef = useRef(randomToken());

  useEffect(() => {
    if (!assignmentId || !enabled) return;

    let cancelled = false;

    const ping = () => {
      api
        .post(`/assignments/${assignmentId}/attempts/heartbeat`, {
          session_token: sessionTokenRef.current,
        })
        .then((res) => {
          if (!cancelled) {
            setLocked(false);
            if (res.data.deadline_passed) setDeadlinePassed(true);
          }
        })
        .catch((err) => {
          if (!cancelled && err?.response?.status === 409) setLocked(true);
        });
    };

    ping();
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [assignmentId, enabled]);

  return { locked, deadlinePassed };
}
