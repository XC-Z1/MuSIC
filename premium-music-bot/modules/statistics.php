<?php
declare(strict_types=1);

function getSystemDashboardStats(PDO $pdo, array $config): array
{
    $users = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    $groups = (int) $pdo->query('SELECT COUNT(*) FROM `groups`')->fetchColumn();
    $played = (int) ($pdo->query('SELECT COALESCE(SUM(tracks_played), 0) FROM statistics')->fetchColumn() ?: 0);
    $sessions = (int) $pdo->query("SELECT COUNT(*) FROM live_sessions WHERE status = 'active'")->fetchColumn();
    $maintenance = isMaintenanceEnabled($pdo);

    $health = callPythonAudioBackend($config, '/health', [], 'GET');
    $backendStatus = $health['ok'] ? 'Online' : 'Offline';

    return [
        'users' => $users,
        'groups' => $groups,
        'played' => $played,
        'active_sessions' => $sessions,
        'maintenance' => $maintenance,
        'backend_status' => $backendStatus,
        'backend_metrics' => $health['data'] ?? [],
    ];
}
