/** Shared fetch helper for the HTTP-based AI providers. No vscode import. */

export const REQUEST_TIMEOUT_MS = 60_000;

export interface PostJsonOptions {
  /** Human-readable provider name used in error messages. */
  label: string;
  headers: Record<string, string>;
  body: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Extracts a provider error message from common JSON error shapes. */
function extractErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const p = payload as Record<string, unknown>;
  const err = p.error;
  if (typeof err === 'string') return err; // Ollama
  if (err && typeof err === 'object') {
    const msg = (err as Record<string, unknown>).message;
    if (typeof msg === 'string') return msg; // Anthropic, OpenAI, Gemini
  }
  if (typeof p.message === 'string') return p.message;
  return undefined;
}

function combineSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/**
 * POSTs JSON and returns the parsed JSON response.
 * Throws an Error with the HTTP status and API message on failure (never echoes headers/keys).
 */
export async function postJson(url: string, opts: PostJsonOptions): Promise<unknown> {
  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...opts.headers },
      body: JSON.stringify(opts.body),
      signal: combineSignals(opts.signal, timeoutMs),
    });
  } catch (err) {
    throw toNetworkError(err, opts.label, opts.signal, timeoutMs);
  }

  let text: string;
  try {
    text = await res.text();
  } catch (err) {
    // The timeout / cancel signal also covers reading the body.
    throw toNetworkError(err, opts.label, opts.signal, timeoutMs);
  }
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = undefined;
  }

  if (!res.ok) {
    const apiMsg = extractErrorMessage(payload) ?? (text.slice(0, 300) || res.statusText);
    throw new Error(`${opts.label} request failed (HTTP ${res.status}): ${apiMsg}${hintFor(res.status)}`);
  }
  if (payload === undefined) {
    throw new Error(`${opts.label} returned an invalid (non-JSON) response.`);
  }
  return payload;
}

function hintFor(status: number): string {
  if (status === 401 || status === 403) return ' — check your API key (run "DevDiary: Set AI API Key").';
  if (status === 429) return ' — rate limited or out of quota; try again later.';
  return '';
}

export function toNetworkError(
  err: unknown,
  label: string,
  userSignal: AbortSignal | undefined,
  timeoutMs: number,
): Error {
  if (userSignal?.aborted) return new Error(`${label} request was cancelled.`);
  const name = err instanceof Error ? err.name : '';
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new Error(`${label} request timed out after ${Math.round(timeoutMs / 1000)}s.`);
  }
  const msg = err instanceof Error ? err.message : String(err);
  return new Error(`Could not reach ${label}: ${msg}`);
}

/** Trims model output and throws if nothing usable came back. */
export function requireText(text: string | undefined, label: string): string {
  const out = (text ?? '').trim();
  if (!out) throw new Error(`${label} returned an empty response.`);
  return out;
}
