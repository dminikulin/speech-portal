import { useEffect, useCallback, useRef } from "react";
import { useAuth } from "./useAuth";

const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour (3,600,000 ms)
const STORAGE_KEY = "speechportal_last_activity";

export function useAutoLogout() {
  const { user, logout } = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performLogout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    if (timerRef.current) clearTimeout(timerRef.current);
    // Call the logout function from your auth hook / service
    if (logout) {
      logout();
    } else {
      localStorage.removeItem("user");
      window.location.reload();
    }
  }, [logout]);

  const resetTimer = useCallback(() => {
    if (!user) return;

    const now = Date.now();
    localStorage.setItem(STORAGE_KEY, now.toString());

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      performLogout();
    }, INACTIVITY_TIMEOUT_MS);
  }, [user, performLogout]);

  // Check on app mount or when tab gains focus
  const checkStoredActivity = useCallback(() => {
    if (!user) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    const now = Date.now();

    if (stored) {
      const lastActivity = parseInt(stored, 10);
      if (now - lastActivity >= INACTIVITY_TIMEOUT_MS) {
        performLogout();
        return;
      }
    }

    // Still within the 1-hour window: schedule remaining time
    const remainingTime = stored
      ? Math.max(0, INACTIVITY_TIMEOUT_MS - (now - parseInt(stored, 10)))
      : INACTIVITY_TIMEOUT_MS;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      performLogout();
    }, remainingTime);
  }, [user, performLogout]);

  useEffect(() => {
    if (!user) return;

    // Check activity immediately on mount (covers reopening browser/tab)
    checkStoredActivity();

    // Interaction listeners: throttled to avoid excessive localStorage writes
    let throttleTimeout: ReturnType<typeof setTimeout> | null = null;
    const handleActivity = () => {
      if (!throttleTimeout) {
        resetTimer();
        throttleTimeout = setTimeout(() => {
          throttleTimeout = null;
        }, 10000); // Throttle writes to once every 10 seconds
      }
    };

    // Events to monitor user activity
    const activityEvents = [
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    activityEvents.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Check when user switches back to this browser tab
    window.addEventListener("focus", checkStoredActivity);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        checkStoredActivity();
      }
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (throttleTimeout) clearTimeout(throttleTimeout);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      window.removeEventListener("focus", checkStoredActivity);
    };
  }, [user, resetTimer, checkStoredActivity]);
}