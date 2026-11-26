<?php
declare(strict_types=1);

$config = require dirname(__DIR__) . '/config/config.php';
require_once dirname(__DIR__) . '/config/database.php';
require_once dirname(__DIR__) . '/includes/security.php';
require_once dirname(__DIR__) . '/includes/permissions.php';
require_once dirname(__DIR__) . '/includes/functions.php';
require_once dirname(__DIR__) . '/modules/statistics.php';

$csrf = generateCsrfToken();
$stats = ['users' => 0, 'groups' => 0, 'played' => 0, 'active_sessions' => 0, 'maintenance' => false, 'backend_status' => 'Offline'];
$dbStatus = 'Offline';

try {
    $pdo = getDatabaseConnection($config);
    $dbStatus = 'Connected';
    $stats = getSystemDashboardStats($pdo, $config);
} catch (Throwable $e) {
    $dbStatus = 'Configuration Required';
}
?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Owner Dashboard — Premium Music Bot</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0b1120; color: #f8fafc; margin: 0; padding: 32px; }
    .container { max-width: 960px; margin: 0 auto; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-top: 24px; }
    .card { background: #111827; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px; }
    .label { color: #94a3b8; font-size: 13px; }
    .val { font-size: 28px; font-weight: 700; margin-top: 6px; font-variant-numeric: tabular-nums; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Premium Music Bot — Owner Control Panel</h1>
    <p class="label">Database: <?php echo htmlspecialchars($dbStatus, ENT_QUOTES, 'UTF-8'); ?> · Audio Backend: <?php echo htmlspecialchars($stats['backend_status'], ENT_QUOTES, 'UTF-8'); ?></p>
    <div class="grid">
      <div class="card"><div class="label">Total Users</div><div class="val"><?php echo (int) $stats['users']; ?></div></div>
      <div class="card"><div class="label">Total Groups</div><div class="val"><?php echo (int) $stats['groups']; ?></div></div>
      <div class="card"><div class="label">Tracks Played</div><div class="val"><?php echo (int) $stats['played']; ?></div></div>
      <div class="card"><div class="label">Active Live Sessions</div><div class="val"><?php echo (int) $stats['active_sessions']; ?></div></div>
    </div>
    <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8'); ?>" />
  </div>
</body>
</html>
