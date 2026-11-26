<?php
declare(strict_types=1);

function isBotOwner(int $telegramId, array $config): bool
{
    return $telegramId > 0 && $telegramId === (int) ($config['owner_telegram_id'] ?? 0);
}

function isBotAdmin(PDO $pdo, int $telegramId, array $config): bool
{
    if (isBotOwner($telegramId, $config)) {
        return true;
    }
    $stmt = $pdo->prepare(
        'SELECT a.id FROM admins a INNER JOIN users u ON u.id = a.user_id WHERE u.telegram_id = :tid LIMIT 1'
    );
    $stmt->execute([':tid' => $telegramId]);
    return (bool) $stmt->fetchColumn();
}

function isMaintenanceEnabled(PDO $pdo): bool
{
    $stmt = $pdo->query('SELECT maintenance_mode FROM owner_settings LIMIT 1');
    $val = $stmt->fetchColumn();
    return (int) $val === 1;
}

function isUserBanned(PDO $pdo, int $telegramId): bool
{
    $stmt = $pdo->prepare('SELECT is_banned FROM users WHERE telegram_id = :tid LIMIT 1');
    $stmt->execute([':tid' => $telegramId]);
    return (int) $stmt->fetchColumn() === 1;
}
