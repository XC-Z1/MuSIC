import crypto from 'node:crypto';

export interface BackendResponse<T = Record<string, unknown>> {
  ok: boolean;
  error?: string;
  data?: T;
}

/**
 * Sends an HMAC-SHA256 authenticated command from Vercel Serverless to the VPS Python Audio Worker.
 */
export async function callAudioBackend<T = Record<string, unknown>>(
  endpoint: string,
  payload: Record<string, unknown> = {},
  method: 'GET' | 'POST' = 'POST',
): Promise<BackendResponse<T>> {
  const baseUrl = (process.env.AUDIO_BACKEND_URL || '').replace(/\/+$/, '');
  const apiSecret = process.env.AUDIO_BACKEND_API_SECRET || '';

  if (!baseUrl || !apiSecret) {
    return {
      ok: false,
      error: 'Streaming Backend Offline: AUDIO_BACKEND_URL or AUDIO_BACKEND_API_SECRET is not configured.',
    };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const bodyString = method === 'GET' ? '' : JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(`${timestamp}.${bodyString}`)
    .digest('hex');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Secret': apiSecret,
        'X-Timestamp': String(timestamp),
        'X-Signature': signature,
      },
      body: method === 'GET' ? undefined : bodyString,
      signal: controller.signal,
    });

    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: typeof json.detail === 'string' ? json.detail : `Backend returned HTTP ${res.status}`,
      };
    }

    return { ok: true, data: json as T };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error && err.name === 'AbortError'
        ? 'Streaming Backend Timeout'
        : 'Streaming Backend Offline',
    };
  } finally {
    clearTimeout(timeout);
  }
}
