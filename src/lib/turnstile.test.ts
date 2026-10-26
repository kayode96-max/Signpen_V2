import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TURNSTILE_DISABLED_WARNING,
  isTurnstileEnabled,
  resetTurnstileDisabledWarningForTests,
  warnTurnstileDisabledOnce,
} from '@/lib/turnstile';

describe('isTurnstileEnabled', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetTurnstileDisabledWarningForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('is true only when both keys are set and non-empty', () => {
    expect(isTurnstileEnabled()).toBe(false);

    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret');
    expect(isTurnstileEnabled()).toBe(false);

    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site');
    expect(isTurnstileEnabled()).toBe(false);

    vi.stubEnv('TURNSTILE_SECRET_KEY', '   ');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site');
    expect(isTurnstileEnabled()).toBe(false);

    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '   ');
    expect(isTurnstileEnabled()).toBe(false);

    vi.stubEnv('TURNSTILE_SECRET_KEY', ' secret ');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', ' site ');
    expect(isTurnstileEnabled()).toBe(true);
  });

  it('logs the disabled warning once and never includes a key', () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'super-secret-value');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnTurnstileDisabledOnce();
    warnTurnstileDisabledOnce();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toBe(TURNSTILE_DISABLED_WARNING);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('super-secret-value');

    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site');
    warn.mockClear();
    warnTurnstileDisabledOnce();
    expect(warn).not.toHaveBeenCalled();
  });
});
