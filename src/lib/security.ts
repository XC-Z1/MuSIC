import crypto from 'node:crypto';

/**
 * Verifies the Telegram webhook secret token header using constant-time comparison.
 */
export function verifyWebhookSecret(
  providedHeader: string | undefined,
  expectedSecret: string | undefined,
): boolean {
  if (!expectedSecret) {
    return false;
  }
  if (!providedHeader) {
    return false;
  }
  const a = Buffer.from(providedHeader, 'utf8');
  const b = Buffer.from(expectedSecret, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

/**
 * Generates an HMAC-SHA256 signature for PHP/Vercel -> Python VPS backend requests.
 */
export function signBackendPayload(payload: string, secret: string, timestamp: number): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
}

/**
 * Validates that a user-supplied media or Telegram link is safe (http/https only, no SSRF targets).
 */
export function validateSafeExternalUrl(rawUrl: string): { valid: boolean; reason?: string; normalized?: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, reason: 'URL cannot be empty.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'Invalid URL format.' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valid: false, reason: 'Only HTTP and HTTPS protocols are permitted.' };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host === '169.254.169.254' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^10\.\d+\.\d+\.\d+$/.test(host) ||
    /^192\.168\.\d+\.\d+$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)
  ) {
    return { valid: false, reason: 'Private, loopback, or link-local addresses are blocked.' };
  }

  return { valid: true, normalized: parsed.toString() };
}

/**
 * Parses and validates Telegram Voice Chat / Group / Channel links.
 */
export function parseTelegramLiveLink(rawLink: string): {
  valid: boolean;
  chatIdentifier?: string;
  voiceChatId?: string;
  reason?: string;
} {
  const trimmed = rawLink.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Please provide a Telegram group or voice chat link.' };
  }

  const normalized = trimmed.startsWith('@')
    ? `https://t.me/${trimmed.slice(1)}`
    : trimmed;

  const urlCheck = validateSafeExternalUrl(normalized);
  if (!urlCheck.valid) {
    return { valid: false, reason: urlCheck.reason };
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return { valid: false, reason: 'Invalid Telegram link.' };
  }

  const allowedHosts = new Set(['t.me', 'telegram.me', 'telegram.dog']);
  if (!allowedHosts.has(parsed.hostname.toLowerCase())) {
    return { valid: false, reason: 'Link must point to t.me or telegram.me.' };
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length === 0) {
    return { valid: false, reason: 'Missing group or channel username in link.' };
  }

  // Handle invite links (https://t.me/+hash or https://t.me/joinchat/hash)
  if (segments[0].startsWith('+') || segments[0] === 'joinchat') {
    const hash = segments[0].startsWith('+') ? segments[0] : segments[1];
    if (!hash || hash.length < 6) {
      return { valid: false, reason: 'Incomplete Telegram invite link.' };
    }
    return {
      valid: true,
      chatIdentifier: `invite:${hash}`,
      voiceChatId: parsed.searchParams.get('videochat') || parsed.searchParams.get('voicechat') || 'live',
    };
  }

  // Handle c/123456789/123 or username/123
  if (segments[0] === 'c' && segments[1]) {
    return {
      valid: true,
      chatIdentifier: `-100${segments[1]}`,
      voiceChatId: segments[2] || parsed.searchParams.get('videochat') || 'live',
    };
  }

  const username = segments[0].replace(/[^a-zA-Z0-9_]/g, '');
  if (username.length < 3) {
    return { valid: false, reason: 'Invalid Telegram username.' };
  }

  return {
    valid: true,
    chatIdentifier: `@${username}`,
    voiceChatId: segments[1] || parsed.searchParams.get('videochat') || 'live',
  };
}

/**
 * Redacts sensitive tokens, API hashes, and Pyrogram/Telethon session strings from text/logs.
 */
export function redactSecrets(input: string): string {
  return input
    .replace(/\b\d{8,12}:[A-Za-z0-9_-]{30,50}\b/g, '[REDACTED_BOT_TOKEN]')
    .replace(/\b[0-9a-f]{32}\b/gi, '[REDACTED_API_HASH]')
    .replace(/(session_string|StringSession|api_hash|bot_token|password|otp)["'=:\s]+[^\s,"'}]+/gi, '$1=[REDACTED]');
}

/**
 * Simple sliding-window in-memory rate limiter for webhook & API abuse protection.
 */
export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now = Date.now()): { allowed: boolean; remaining: number } {
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= this.maxRequests) {
      this.hits.set(key, recent);
      return { allowed: false, remaining: 0 };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true, remaining: this.maxRequests - recent.length };
  }
}
