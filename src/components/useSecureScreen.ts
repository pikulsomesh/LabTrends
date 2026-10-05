// FLAG_SECURE while a screen shows lab data: no screenshots, screen recording or recents thumbnail.
// Only one screen is mounted at a time, so the next screen's effect runs after this one's cleanup.
import { useEffect } from 'react';
import { setSecure } from '../ingest/native';

export function useSecureScreen() {
  useEffect(() => {
    setSecure(true).catch(() => {});
    return () => {
      setSecure(false).catch(() => {});
    };
  }, []);
}
