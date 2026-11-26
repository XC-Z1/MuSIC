import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampVolume,
  createInitialBotState,
  formatBangladeshDateTime,
  processBotInput,
  renderProgressBar,
  simulateNewUserJoin,
  tickPlayback,
} from './botEngine';

test('clampVolume enforces 10% to 200% range', () => {
  assert.equal(clampVolume(0), 10);
  assert.equal(clampVolume(-50), 10);
  assert.equal(clampVolume(150), 150);
  assert.equal(clampVolume(280), 200);
});

test('renderProgressBar moves indicator smoothly across track duration', () => {
  const start = renderProgressBar(0, 100, 10);
  const mid = renderProgressBar(50, 100, 10);
  const end = renderProgressBar(100, 100, 10);
  assert.equal(start.indexOf('●'), 0);
  assert.equal(mid.indexOf('●'), 5);
  assert.equal(end.indexOf('●'), 9);
});

test('formatBangladeshDateTime uses Asia/Dhaka 12-hour AM/PM schedule', () => {
  // 2026-11-26T13:30:00Z is 07:30:00 PM in Asia/Dhaka (UTC+6)
  const bd = formatBangladeshDateTime('2026-11-26T13:30:00Z');
  assert.ok(bd.timeStr.includes('07:30:00 PM'), `Expected 07:30:00 PM, got ${bd.timeStr}`);
  assert.ok(bd.dateStr.includes('26') && bd.dateStr.includes('Nov') && bd.dateStr.includes('2026'));
});

test('/start keeps equalizer animation and reference blockquote card while hiding Admin button from non-admins', () => {
  const initial = createInitialBotState();
  assert.equal(initial.botUsername, 'MUSIC SPAM BOT');
  assert.deepEqual(
    initial.messages[0].inlineKeyboard?.map((row) => row.length),
    [2, 2, 2, 2],
  );
  assert.ok(initial.messages[0].text.includes('<blockquote>'));
  assert.ok(initial.messages[0].text.includes('━━━━━━━━━━━━━━━━━━━━'));

  // Admin /start shows equalizer + Admin Panel button
  const adminStart = processBotInput(initial, '/start', { senderRole: 'owner' });
  const adminMsg = adminStart.messages[adminStart.messages.length - 1];
  assert.equal(adminMsg.animationFrames?.length, 6);
  assert.ok(adminMsg.animationFrames?.[0]?.includes('▁▂▃▄▅▆▇  ▰▱▱▱▱'));
  assert.ok(adminMsg.animationFrames?.[4]?.includes('▇▆▅▄▃▂▁  ▰▰▰▰▰'));
  assert.equal(
    adminMsg.inlineKeyboard?.flat().some((b) => b.callbackData === 'cmd:owner'),
    true,
  );

  // Member /start hides Admin Panel button completely
  const memberStart = processBotInput(initial, '/start', { senderRole: 'member' });
  const memberMsg = memberStart.messages[memberStart.messages.length - 1];
  assert.equal(
    memberMsg.inlineKeyboard?.flat().some((b) => b.callbackData === 'cmd:owner'),
    false,
  );
  assert.deepEqual(
    memberMsg.inlineKeyboard?.map((row) => row.length),
    [2, 2, 2, 1],
  );
});

test('Play Music uses upgraded professional Studio Deck animation distinct from /start equalizer', () => {
  let state = createInitialBotState();
  state = processBotInput(state, 'cmd:play_prompt', { isCallback: true });
  const promptMsg = state.messages[state.messages.length - 1];
  assert.equal(promptMsg.animationFrames?.length, 5);
  assert.ok(promptMsg.animationFrames?.[0]?.includes('25%'));
  assert.ok(promptMsg.animationFrames?.[3]?.includes('100%'));
  assert.equal(promptMsg.animationFrames?.some((f) => f.includes('▁▂▃▄▅▆▇') || f.includes('▰▱▱▱▱')), false);

  state = processBotInput(state, '/play Midnight Signal');
  assert.equal(state.playback.status, 'playing');
  const playMsg = state.messages[state.messages.length - 1];
  assert.equal(playMsg.animationFrames?.length, 5);
  assert.equal(playMsg.animationFrames?.some((f) => f.includes('▁▂▃▄▅▆▇') || f.includes('▰▱▱▱▱')), false);
});

test('Admin-only access control, Maintenance mode, User block/unblock, and New User Joined BD alert', () => {
  let state = createInitialBotState();

  // Regular user cannot open Admin panel or run admin commands
  const deniedCallback = processBotInput(state, 'cmd:owner', { isCallback: true, senderRole: 'member' });
  assert.ok(deniedCallback.messages[deniedCallback.messages.length - 1].text.includes('ACCESS DENIED') ||
    deniedCallback.messages[deniedCallback.messages.length - 1].text.includes('ᴀᴄᴄᴇss ᴅᴇɴɪᴇᴅ'));

  const deniedCmd = processBotInput(state, '/broadcast hello', { senderRole: 'member' });
  assert.ok(deniedCmd.messages[deniedCmd.messages.length - 1].text.includes('ACCESS DENIED'));

  // Admin turns Bot OFF (Maintenance Mode ON)
  state = processBotInput(state, 'owner:toggle_maintenance', { isCallback: true, senderRole: 'owner' });
  assert.equal(state.maintenanceMode, true);

  // Regular member gets formatted Maintenance card on /start
  const memberMaint = processBotInput(state, '/start', { senderRole: 'member' });
  const maintMsg = memberMaint.messages[memberMaint.messages.length - 1];
  assert.equal(maintMsg.kind, 'maintenance');
  assert.ok(maintMsg.text.includes('ᴍᴀɪɴᴛᴇɴᴀɴᴄᴇ'));

  // Admin turns Bot back ON
  state = processBotInput(state, '/boton', { senderRole: 'owner' });
  assert.equal(state.maintenanceMode, false);

  // Admin blocks member u-3 (@nadia_k)
  state = processBotInput(state, 'admin:block:u-3:0', { isCallback: true, senderRole: 'owner' });
  assert.equal(state.users.find((u) => u.id === 'u-3')?.banned, true);

  const blockedAttempt = processBotInput(state, '/start', { senderUsername: '@nadia_k', senderRole: 'member' });
  assert.ok(blockedAttempt.messages[blockedAttempt.messages.length - 1].text.includes('ʙʟᴏᴄᴋᴇᴅ'));

  // Admin unblocks member u-3
  state = processBotInput(state, 'admin:unblock:u-3:0', { isCallback: true, senderRole: 'owner' });
  assert.equal(state.users.find((u) => u.id === 'u-3')?.banned, false);

  // First-time New User Join triggers Admin notification with BD 12-hour time & photo badge
  state = simulateNewUserJoin(state, {
    chatId: 6743390968,
    name: 'XC',
    username: '@xc_music',
    joinedAt: '2026-11-26T13:30:00Z',
  });
  const alertMsg = state.messages[state.messages.length - 1];
  assert.equal(alertMsg.kind, 'admin_alert');
  assert.ok(alertMsg.text.includes('6743390968'));
  assert.ok(alertMsg.text.includes('07:30:00 PM'));
  assert.ok(alertMsg.photoBadge?.includes('Photo'));
});

test('/joinlive, volume up to 200%, and tickPlayback work cleanly', () => {
  let state = createInitialBotState();
  state = processBotInput(state, '/joinlive https://t.me/dhaka_chill_vc/88');
  assert.equal(state.liveSession.active, true);
  assert.equal(state.liveSession.groupIdentifier, '@dhaka_chill_vc');

  state = processBotInput(state, 'vol:200', { isCallback: true });
  assert.equal(state.playback.volume, 200);

  state = processBotInput(state, '/play Midnight Signal');
  const firstId = state.playback.currentTrack?.id;
  const duration = state.playback.currentTrack?.durationSec ?? 275;
  state = tickPlayback(state, duration);
  assert.notEqual(state.playback.currentTrack?.id, firstId);
  assert.equal(state.playback.status, 'playing');
});
