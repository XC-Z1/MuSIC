import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampVolume,
  createInitialBotState,
  processBotInput,
  renderProgressBar,
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

test('/joinlive validates link and connects personal account to voice chat with animation frames', () => {
  const initial = createInitialBotState();
  const joined = processBotInput(initial, '/joinlive https://t.me/dhaka_chill_vc/88');
  assert.equal(joined.liveSession.active, true);
  assert.equal(joined.liveSession.groupIdentifier, '@dhaka_chill_vc');
  assert.equal(joined.liveSession.voiceChatId, '88');
  const lastMsg = joined.messages[joined.messages.length - 1];
  assert.equal(lastMsg.isAnimated, true);
  assert.ok((lastMsg.animationFrames?.length ?? 0) >= 3);
});

test('/play starts streaming and volume/mute callbacks adjust state accurately', () => {
  let state = createInitialBotState();
  state = processBotInput(state, '/play Midnight Signal');
  assert.equal(state.playback.status, 'playing');
  assert.ok(state.playback.currentTrack?.title.includes('Midnight Signal'));

  state = processBotInput(state, 'vol:+20', { isCallback: true });
  assert.equal(state.playback.volume, 100);

  state = processBotInput(state, 'vol:mute', { isCallback: true });
  assert.equal(state.playback.muted, true);

  state = processBotInput(state, 'vol:unmute', { isCallback: true });
  assert.equal(state.playback.muted, false);
  assert.equal(state.playback.volume, 100);
});

test('tickPlayback advances track and auto-skips to queued song upon completion', () => {
  let state = createInitialBotState();
  state = processBotInput(state, '/play Midnight Signal');
  const firstId = state.playback.currentTrack?.id;
  const duration = state.playback.currentTrack?.durationSec ?? 275;
  state = tickPlayback(state, duration);
  assert.notEqual(state.playback.currentTrack?.id, firstId);
  assert.equal(state.playback.status, 'playing');
});
