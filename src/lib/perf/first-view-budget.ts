/**
 * Landing-page byte budget used by `scripts/perf-budget.mts`.
 *
 * Inclusive `firstViewBytes` matches PR #16's field: bytes on the wire by
 * first contentful paint, including in-flight chunks. The failing totals
 * leave out lazy assets (hero video, scene.bin, three.js chunks). Those stay
 * in the report and cannot fail the gate.
 *
 * `ENFORCE_PERF_BUDGETS=1` fails the process. Any other value is report-only.
 */

export const FIRST_VIEW_BYTE_BUDGET = 1024 * 1024;
export const FIRST_VIEW_REQUEST_BYTE_BUDGET = 300 * 1024;

export type ByteEntry = { url: string; bytes: number };

export type FirstViewResource = { url: string; bytes: number; lazy: boolean };

export type FirstViewSummary = {
  firstViewBytes: number;
  gatedFirstViewBytes: number;
  lazyBytes: number;
  resources: FirstViewResource[];
  largestGatedRequest: { url: string; bytes: number } | null;
  oversizedGatedRequests: { url: string; bytes: number }[];
};

/** Hero video, the 3D model, and three.js chunks. Report-only. */
export function isLazyFirstViewAsset(url: string): boolean {
  const pathname = pathnameOf(url);
  if (/\/vid1(?:\.[^/]+)?\.mp4$/i.test(pathname)) return true;
  if (pathname.endsWith('/scene.bin')) return true;
  if (pathname.includes('three')) return true;
  return false;
}

export function budgetsAreEnforced(value: string | undefined): boolean {
  return value === '1';
}

export function summarizeFirstView(entries: ByteEntry[]): FirstViewSummary {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    if (!Number.isFinite(entry.bytes) || entry.bytes <= 0) continue;
    const url = stripHash(entry.url);
    totals.set(url, (totals.get(url) ?? 0) + entry.bytes);
  }

  const resources = [...totals.entries()]
    .map(([url, bytes]) => ({ url, bytes, lazy: isLazyFirstViewAsset(url) }))
    .sort((left, right) => right.bytes - left.bytes || left.url.localeCompare(right.url));

  const gated = resources.filter((resource) => !resource.lazy);
  const lazy = resources.filter((resource) => resource.lazy);
  const largest = gated[0];

  return {
    firstViewBytes: sumBytes(resources),
    gatedFirstViewBytes: sumBytes(gated),
    lazyBytes: sumBytes(lazy),
    resources,
    largestGatedRequest: largest ? { url: largest.url, bytes: largest.bytes } : null,
    oversizedGatedRequests: gated
      .filter((resource) => resource.bytes > FIRST_VIEW_REQUEST_BYTE_BUDGET)
      .map((resource) => ({ url: resource.url, bytes: resource.bytes })),
  };
}

export function budgetFailures(summary: FirstViewSummary): string[] {
  const failures: string[] = [];
  if (summary.gatedFirstViewBytes > FIRST_VIEW_BYTE_BUDGET) {
    failures.push(
      `gated first-view bytes ${summary.gatedFirstViewBytes} exceed ${FIRST_VIEW_BYTE_BUDGET}`,
    );
  }
  for (const request of summary.oversizedGatedRequests) {
    failures.push(
      `request ${request.bytes} bytes exceeds ${FIRST_VIEW_REQUEST_BYTE_BUDGET}: ${request.url}`,
    );
  }
  return failures;
}

export function formatBudgetReport(args: {
  enforced: boolean;
  summary: FirstViewSummary;
  failures: string[];
  fcpMs: number;
  note?: string;
  /** Requests the browser opened before first paint that had not delivered bytes yet. */
  pending?: string[];
}): string {
  const lines = [
    `perf-budget: ${args.enforced ? 'enforced' : 'report-only'}`,
    'page: /',
    'throttling: slow-3g',
    `fcpMs: ${args.fcpMs}`,
    `firstViewBytes: ${args.summary.firstViewBytes}`,
    `gatedFirstViewBytes: ${args.summary.gatedFirstViewBytes} (budget ${FIRST_VIEW_BYTE_BUDGET})`,
    `lazyBytes: ${args.summary.lazyBytes} (report-only)`,
    `largestGatedRequest: ${
      args.summary.largestGatedRequest
        ? `${args.summary.largestGatedRequest.bytes} ${args.summary.largestGatedRequest.url}`
        : 'none'
    }`,
  ];
  if (args.note) lines.push(`note: ${args.note}`);
  const pending = args.pending ?? [];
  if (pending.length > 0) {
    lines.push('started before paint with no bytes yet:');
    for (const url of pending) lines.push(`  ${url}`);
  }
  lines.push('resources:');
  for (const resource of args.summary.resources) {
    lines.push(
      `  ${resource.lazy ? 'lazy' : 'gated'} ${resource.bytes} ${resource.url}`,
    );
  }
  if (args.failures.length === 0) {
    lines.push('RESULT: pass');
  } else {
    lines.push(args.enforced ? 'RESULT: fail' : 'RESULT: report-only miss');
    for (const failure of args.failures) lines.push(`  ${failure}`);
  }
  return lines.join('\n');
}

function pathnameOf(url: string): string {
  try {
    return new URL(url, 'http://127.0.0.1').pathname.toLowerCase();
  } catch {
    return url.split('#')[0].split('?')[0].toLowerCase();
  }
}

function stripHash(url: string): string {
  return url.split('#')[0];
}

function sumBytes(resources: { bytes: number }[]): number {
  return resources.reduce((total, resource) => total + resource.bytes, 0);
}
