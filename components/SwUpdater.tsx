'use client';

import { useEffect } from 'react';

export default function SwUpdater() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // When a new SW takes control, reload so users always see the latest version
    const handleControllerChange = () => window.location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
  }, []);

  return null;
}
