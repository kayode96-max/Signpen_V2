/** Byte progress for the shirt download. Pure so the modal and tests share it. */

export function downloadProgressPercent(
  loadedBytes: number,
  totalBytes: number | null | undefined,
): number | null {
  if (totalBytes == null || !Number.isFinite(totalBytes) || totalBytes <= 0) return null;
  if (!Number.isFinite(loadedBytes) || loadedBytes <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((loadedBytes / totalBytes) * 100)));
}

export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

export function formatDownloadLabel(loadedBytes: number, totalBytes: number | null): string {
  const percent = downloadProgressPercent(loadedBytes, totalBytes);
  const loaded = formatByteSize(loadedBytes);
  if (percent == null) return `Downloading the shirt… ${loaded}`;
  const total = formatByteSize(totalBytes ?? 0);
  return `Downloading the shirt… ${percent}% (${loaded} of ${total})`;
}

/**
 * Read a fetch body and report bytes as they arrive.
 * `totalBytes` comes from Content-Length when the server sends one.
 */
export async function readResponseBytes(
  response: Response,
  onProgress: (loadedBytes: number, totalBytes: number | null) => void,
): Promise<ArrayBuffer> {
  const header = response.headers.get('content-length');
  const parsed = header ? Number(header) : NaN;
  const totalBytes = Number.isFinite(parsed) && parsed > 0 ? parsed : null;

  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onProgress(buffer.byteLength, totalBytes ?? buffer.byteLength);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, totalBytes);
  }

  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}
