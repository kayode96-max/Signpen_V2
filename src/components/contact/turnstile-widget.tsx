'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          theme?: 'light' | 'dark' | 'auto';
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        }
      ) => string;
      remove?: (widgetId: string) => void;
    };
  }
}

/**
 * Cloudflare Turnstile. The site key is public (NEXT_PUBLIC_TURNSTILE_SITE_KEY).
 * The secret (TURNSTILE_SECRET_KEY) is checked only on the server, by
 * /api/feedback and by /api/signatures once an IP is over the hourly board cap.
 */
export default function TurnstileWidget({
  onToken,
  unavailableMessage = 'Feedback posting is unavailable until NEXT_PUBLIC_TURNSTILE_SITE_KEY is configured.',
}: {
  onToken: (token: string | null) => void;
  unavailableMessage?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (typeof window !== 'undefined' && window.turnstile) {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready || !siteKey || !containerRef.current || !window.turnstile) return;
    const element = containerRef.current;
    widgetId.current = window.turnstile.render(element, {
      sitekey: siteKey,
      theme: 'dark',
      callback: (token) => onToken(token),
      'expired-callback': () => onToken(null),
      'error-callback': () => onToken(null),
    });
    return () => {
      if (widgetId.current) {
        window.turnstile?.remove?.(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [ready, siteKey, onToken]);

  if (!siteKey) {
    return (
      <p className="text-sm text-yellow-400">{unavailableMessage}</p>
    );
  }

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />
      <div ref={containerRef} className="min-h-[65px]" />
    </>
  );
}
