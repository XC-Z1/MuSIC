import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SlidingWindowRateLimiter,
  parseTelegramLiveLink,
  redactSecrets,
  signBackendPayload,
  validateSafeExternalUrl,
  verifyWebhookSecret,
} from './security';

test('verifyWebhookSecret enforces exact constant-time match', () => {
  assert.equal(verifyWebhookSecret('my-secret-123', 'my-secret-123'), true);
  assert.equal(verifyWebhookSecret('my-secret-124', 'my-secret-123'), false);
  assert.equal(verifyWebhookSecret(undefined, 'my-secret-123'), false);
  assert.equal(verifyWebhookSecret('anything', ''), false);
});

test('validateSafeExternalUrl blocks loopback and private network SSRF targets', () => {
  assert.equal(validateSafeExternalUrl('https://cdn.example.com/song.mp3').valid, true);
  assert.equal(validateSafeExternalUrl('http://127.0.0.1:8080/admin').valid, false);
  assert.equal(validateSafeExternalUrl('http://169.254.169.254/latest/meta-data').valid, false);
  assert.equal(validateSafeExternalUrl('http://192.168.1.10/audio.mp3').valid, false);
  assert.equal(validateSafeExternalUrl('javascript:alert(1)').valid, false);
});

test('parseTelegramLiveLink extracts chat identifier and voice chat id', () => {
  const pub = parseTelegramLiveLink('https://t.me/dhaka_chill_vc/123');
  assert.equal(pub.valid, true);
  assert.equal(pub.chatIdentifier, '@dhaka_chill_vc');
  assert.equal(pub.voiceChatId, '123');

  const priv = parseTelegramLiveLink('https://t.me/c/1987654321/45');
  assert.equal(priv.valid, true);
  assert.equal(priv.chatIdentifier, '-1001987654321');
  assert.equal(priv.voiceChatId, '45');

  const bad = parseTelegramLiveLink('https://evil.example.com/not-telegram');
  assert.equal(bad.valid, false);
});

test('redactSecrets masks bot tokens and API hashes', () => {
  const text = 'token=123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890 hash=0123456789abcdef0123456789abcdef';
  const cleaned = redactSecrets(text);
  assert.equal(cleaned.includes('ABCDEFGHIJKLMNOPQRSTUVWXYZ'), false);
  assert.equal(cleaned.includes('0123456789abcdef0123456789abcdef'), false);
  assert.ok(cleaned.includes('[REDACTED_BOT_TOKEN]'));
  assert.ok(cleaned.includes('[REDACTED_API_HASH]'));
});

test('SlidingWindowRateLimiter enforces window caps and signBackendPayload is deterministic', () => {
  const limiter = new SlidingWindowRateLimiter(2, 1000);
  assert.equal(limiter.check('user1', 100).allowed, true);
  assert.equal(limiter.check('user1', 200).allowed, true);
  assert.equal(limiter.check('user1', 300).allowed, false);
  assert.equal(limiter.check('user1', 1500).allowed, true);

  const sig1 = signBackendPayload('{"cmd":"play"}', 'sec', 1700000000);
  const sig2 = signBackendPayload('{"cmd":"play"}', 'sec', 1700000000);
  assert.equal(sig1, sig2);
  assert.equal(sig1.length, 64);
});
