<?php
declare(strict_types=1);

function handleAdminCommand(PDO $pdo, array $config, int|string $chatId, int $fromId, string $cmd, string $arg, ?int $editMessageId = null): void
{
    if (!isBotAdmin($pdo, $fromId, $config)) {
        sendTelegramMessage($config, $chatId, '⛔ Admin or Owner permissions required.');
        return;
    }

    switch ($cmd) {
        case '/owner':
        case '/stats':
        case '/status':
            $summary = getSystemDashboardStats($pdo, $config);
            $text = implode("\n", [
                '👑 𝐎𝐖𝐍𝐄𝐑 𝐃𝐀𝐒𝐇𝐁𝐎𝐀𝐑𝐃',
                '',
                "👥 Total Users: {$summary['users']}",
                "💬 Total Groups: {$summary['groups']}",
                "🎵 Total Music Played: {$summary['played']}",
                "📡 Active Live Sessions: {$summary['active_sessions']}",
                "⚡ Audio Backend: {$summary['backend_status']}",
                "🗄️ Database: Connected",
                "🛡️ Maintenance: " . ($summary['maintenance'] ? 'ENABLED' : 'OFF'),
            ]);
            if ($editMessageId !== null) {
                editTelegramMessage($config, $chatId, $editMessageId, $text, buildMainWelcomeKeyboard());
            } else {
                sendTelegramMessage($config, $chatId, $text, buildMainWelcomeKeyboard());
            }
            break;

        case '/maintenance':
            $current = isMaintenanceEnabled($pdo);
            $next = $current ? 0 : 1;
            $pdo->prepare('UPDATE owner_settings SET maintenance_mode = :m')->execute([':m' => $next]);
            sendTelegramMessage($config, $chatId, '🛠️ Maintenance Mode: ' . ($next ? 'ENABLED' : 'DISABLED'));
            break;

        case '/broadcast':
            if ($arg === '') {
                sendTelegramMessage($config, $chatId, '📢 Usage: /broadcast <message>');
                return;
            }
            $groups = $pdo->query('SELECT chat_id FROM `groups` WHERE is_active = 1')->fetchAll();
            $sent = 0;
            foreach ($groups as $g) {
                $r = sendTelegramMessage($config, (int) $g['chat_id'], "📢 𝐁𝐑𝐎𝐀𝐃𝐂𝐀𝐒𝐓\n\n{$arg}");
                if (!empty($r['ok'])) {
                    $sent++;
                }
            }
            sendTelegramMessage($config, $chatId, "✅ Broadcast delivered to {$sent} active chats.");
            break;

        case '/users':
            $rows = $pdo->query('SELECT username, first_name, total_requests FROM users ORDER BY id DESC LIMIT 15')->fetchAll();
            $lines = ['👥 𝐑𝐄𝐆𝐈𝐒𝐓𝐄𝐑𝐄𝐃 𝐔𝐒𝐄𝐑𝐒', ''];
            foreach ($rows as $r) {
                $uname = $r['username'] ? '@' . $r['username'] : $r['first_name'];
                $lines[] = "• {$uname} — {$r['total_requests']} plays";
            }
            sendTelegramMessage($config, $chatId, implode("\n", $lines));
            break;

        case '/groups':
            $rows = $pdo->query('SELECT title, chat_id, auto_join FROM `groups` ORDER BY id DESC LIMIT 15')->fetchAll();
            $lines = ['💬 𝐆𝐑𝐎𝐔𝐏𝐒', ''];
            foreach ($rows as $r) {
                $aj = $r['auto_join'] ? 'ON' : 'OFF';
                $lines[] = "• {$r['title']} ({$r['chat_id']}) · AutoJoin: {$aj}";
            }
            sendTelegramMessage($config, $chatId, implode("\n", $lines));
            break;

        case '/reload':
        case '/restart':
            $res = callPythonAudioBackend($config, '/system/restart', []);
            sendTelegramMessage($config, $chatId, $res['ok'] ? '🔄 Audio backend services reloaded cleanly.' : '❌ ' . $res['error']);
            break;
    }
}
