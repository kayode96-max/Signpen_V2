import {
  expect,
  test as base,
  type BrowserContext,
  type Page,
  type Request,
  type Route,
} from '@playwright/test';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Block writes. The suite only navigates and reads responses. */
export function isDataMutation(request: Request): boolean {
  if (!MUTATING.has(request.method())) return false;
  const url = request.url();
  return (
    /\/rest\/v1\//.test(url) ||
    /\/api\/signatures\b/.test(url) ||
    /\/auth\/v1\/signup\b/.test(url)
  );
}

async function blockMutations(route: Route): Promise<void> {
  if (isDataMutation(route.request())) {
    await route.abort('blockedbyclient');
    return;
  }
  await route.continue();
}

export async function installReadOnlyGuard(page: Page | BrowserContext): Promise<void> {
  await page.route('**/*', blockMutations);
}

/**
 * Drop credential material if a console line echoes a Supabase URL.
 * The anon key is public, but the suite still should not reprint it.
 */
export function redact(text: string): string {
  return text
    .replace(/apikey=[^&\s'")]+/gi, 'apikey=[redacted]')
    .replace(/bearer\s+[a-z0-9._~+/-]+/gi, 'bearer [redacted]')
    .slice(0, 300);
}

const TRANSPORT_FAILURE =
  /ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_ADDRESS_UNREACHABLE|ERR_INTERNET_DISCONNECTED|Name or service not known|Temporary failure in name resolution|WebSocket connection to .* failed|access control checks|Failed to fetch|NetworkError|useCollection fetch error|useDoc fetch error|Error in getDoc/i;

/**
 * `next start` without a reachable Supabase project falls through to
 * placeholder.supabase.co (see src/supabase/config.ts). Those DNS failures
 * are an environment gap. HTTP errors from a real project still fail the smoke.
 */
function isIgnorableSupabaseTransportError(text: string, failedRequests: string[]): boolean {
  const transportFailures = failedRequests.filter((line) =>
    /ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED|ERR_ADDRESS_UNREACHABLE|Name or service not known|Temporary failure in name resolution/i.test(
      line,
    ),
  );
  if (transportFailures.length === 0) return false;
  const onlySupabase = transportFailures.every((line) => /supabase\.co/i.test(line));
  if (!onlySupabase) return false;
  return TRANSPORT_FAILURE.test(text);
}

export function collectConsole(page: Page): { errors: () => string[] } {
  const errors: string[] = [];
  const failedRequests: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(redact(message.text()));
  });
  page.on('pageerror', (error) => {
    errors.push(redact(String(error)));
  });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? 'failed';
    failedRequests.push(redact(`${reason} ${request.url().split('?')[0]}`));
  });

  return {
    errors: () =>
      errors.filter((text) => !isIgnorableSupabaseTransportError(text, failedRequests)),
  };
}

export async function horizontalOverflow(
  page: Page,
): Promise<{ overflow: boolean; offenders: string[] }> {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return (
          rect.width > 0 &&
          style.visibility !== 'hidden' &&
          rect.right > viewportWidth + 1 &&
          style.position !== 'fixed'
        );
      })
      .slice(0, 8)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const id = el.id ? `#${el.id}` : '';
        const className = (el.getAttribute('class') || '')
          .split(' ')
          .filter(Boolean)
          .slice(0, 3)
          .join('.');
        return `${el.tagName.toLowerCase()}${id}${className ? `.${className}` : ''} right=${Math.round(rect.right)}`;
      });

    return {
      overflow: document.documentElement.scrollWidth > viewportWidth + 1,
      offenders,
    };
  });
}

export function jsonHasEmailField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((entry) => jsonHasEmailField(entry));
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, 'email')) return true;
    return Object.values(record).some((entry) => jsonHasEmailField(entry));
  }
  return false;
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await installReadOnlyGuard(page);
    await use(page);
  },
});

export { expect };
