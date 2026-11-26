<?php
declare(strict_types=1);

function verifyTelegramWebhookSecret(array $config): bool
{
    $expected = $config['webhook_secret'] ?? '';
    if ($expected === '') {
        return true;
    }
    $provided = $_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '';
    if ($provided === '') {
        return false;
    }
    return hash_equals($expected, $provided);
}

function sanitizeTextInput(?string $text, int $maxLength = 512): string
{
    if ($text === null) {
        return '';
    }
    $clean = trim(strip_tags($text));
    return mb_substr($clean, 0, $maxLength, 'UTF-8');
}

function validateSafeExternalUrl(string $url): bool
{
    $parts = parse_url(trim($url));
    if (!is_array($parts) || !isset($parts['scheme'], $parts['host'])) {
        return false;
    }
    $scheme = strtolower($parts['scheme']);
    if ($scheme !== 'https' && $scheme !== 'http') {
        return false;
    }
    $host = strtolower($parts['host']);
    if ($host === 'localhost' || $host === '127.0.0.1' || $host === '169.254.169.254') {
        return false;
    }
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        if (!filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return false;
        }
    }
    return true;
}

function redactSensitiveText(string $input): string
{
    $redacted = preg_replace('/\b\d{8,12}:[A-Za-z0-9_-]{30,50}\b/', '[REDACTED_BOT_TOKEN]', $input) ?? $input;
    $redacted = preg_replace('/\b[0-9a-fA-F]{32}\b/', '[REDACTED_HASH]', $redacted) ?? $redacted;
    return $redacted;
}

function encryptSecretBlob(string $plaintext, string $base64Key): string
{
    $key = base64_decode($base64Key, true);
    if ($key === false || strlen($key) !== 32) {
        $key = hash('sha256', $base64Key, true);
    }
    $iv = random_bytes(12);
    $tag = '';
    $ciphertext = openssl_encrypt($plaintext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    if ($ciphertext === false) {
        throw new RuntimeException('Encryption failed');
    }
    return base64_encode($iv . $tag . $ciphertext);
}

function checkRateLimit(string $cacheDir, string $identifier, int $limitPerMin): bool
{
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0750, true);
    }
    $file = $cacheDir . '/rl_' . hash('sha256', $identifier) . '.json';
    $now = time();
    $windowStart = $now - 60;
    $timestamps = [];
    if (is_file($file)) {
        $raw = file_get_contents($file);
        $decoded = is_string($raw) ? json_decode($raw, true) : [];
        if (is_array($decoded)) {
            $timestamps = array_values(array_filter($decoded, static fn($t): bool => is_int($t) && $t > $windowStart));
        }
    }
    if (count($timestamps) >= $limitPerMin) {
        return false;
    }
    $timestamps[] = $now;
    file_put_contents($file, json_encode($timestamps), LOCK_EX);
    return true;
}

function generateCsrfToken(): string
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function verifyCsrfToken(?string $token): bool
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    return is_string($token) && !empty($_SESSION['csrf_token']) && hash_equals($_SESSION['csrf_token'], $token);
}
