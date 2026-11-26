import { parseTelegramLiveLink, validateSafeExternalUrl } from './security';

export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'stopped';
export type RepeatMode = 'off' | 'one' | 'all';
export type AccountConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting' | 'error';

export interface TrackItem {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  sourceType: 'direct_url' | 'stream_link' | 'mp3_upload' | 'library';
  sourceUrl: string;
  requestedBy: string;
  artworkUrl: string;
}

export interface PersonalAccountState {
  id: string;
  displayName: string;
  username: string;
  phoneMasked: string;
  status: AccountConnectionStatus;
  online: boolean;
  sessionEncrypted: boolean;
  retryCount: number;
  maxRetries: number;
  lastHeartbeatAt: string;
}

export interface LiveSessionState {
  active: boolean;
  groupTitle: string;
  groupIdentifier: string;
  voiceChatId: string;
  autoJoinEnabled: boolean;
  connectionQuality: 'Stable' | 'Recovering' | 'Offline';
  joinedAt: string | null;
  activeStreamsCount: number;
  maxConcurrentStreams: number;
}

export interface BotInlineButton {
  text: string;
  callbackData: string;
  style?: 'primary' | 'danger' | 'success';
}

export interface BotMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  inlineKeyboard?: BotInlineButton[][];
  timestamp: string;
  effectBadge?: string;
  animationFrames?: string[];
  kind?: 'welcome' | 'player' | 'volume' | 'live' | 'account' | 'owner' | 'help' | 'error' | 'queue' | 'info';
}

export interface BotUserRecord {
  id: string;
  name: string;
  username: string;
  role: 'owner' | 'admin' | 'member';
  requestsCount: number;
  banned: boolean;
}

export interface BotGroupRecord {
  id: string;
  title: string;
  identifier: string;
  volume: number;
  autoJoin: boolean;
  active: boolean;
}

export interface ErrorLogEntry {
  id: string;
  timestamp: string;
  component: 'webhook' | 'mtproto' | 'ffmpeg' | 'pytgcalls' | 'database';
  message: string;
}

export interface BotSystemState {
  botUsername: string;
  maintenanceMode: boolean;
  account: PersonalAccountState;
  liveSession: LiveSessionState;
  playback: {
    status: PlaybackStatus;
    currentTrack: TrackItem | null;
    positionSec: number;
    volume: number;
    muted: boolean;
    previousVolume: number;
    repeatMode: RepeatMode;
    queue: TrackItem[];
    history: TrackItem[];
  };
  stats: {
    totalUsers: number;
    totalGroups: number;
    totalMusicPlayed: number;
    cpuPercent: number;
    ramPercent: number;
    backendLatencyMs: number;
    backendOnline: boolean;
    databaseOnline: boolean;
  };
  users: BotUserRecord[];
  groups: BotGroupRecord[];
  errorLogs: ErrorLogEntry[];
  messages: BotMessage[];
}

export const CATALOG_ARTWORKS = [
  '/src/assets/images/album_synth_night_1795675913750.jpg',
  '/src/assets/images/album_dhaka_lofi_1795675914611.jpg',
  '/src/assets/images/album_acoustic_live_1795675914818.jpg',
];

export const DEFAULT_LIBRARY_TRACKS: TrackItem[] = [
  {
    id: 'trk-101',
    title: 'Midnight Signal (Studio Mix)',
    artist: 'Aether & Kazi',
    durationSec: 275,
    sourceType: 'library',
    sourceUrl: 'https://cdn.example.invalid/audio/midnight-signal.mp3',
    requestedBy: '@owner_admin',
    artworkUrl: CATALOG_ARTWORKS[0],
  },
  {
    id: 'trk-102',
    title: 'Monsoon Over Gulshan',
    artist: 'Dhaka Lo-Fi Collective',
    durationSec: 214,
    sourceType: 'library',
    sourceUrl: 'https://cdn.example.invalid/audio/monsoon-gulshan.mp3',
    requestedBy: '@studio_dj',
    artworkUrl: CATALOG_ARTWORKS[1],
  },
  {
    id: 'trk-103',
    title: 'Analog Console Sessions',
    artist: 'Studio 48 Acoustic',
    durationSec: 248,
    sourceType: 'library',
    sourceUrl: 'https://cdn.example.invalid/audio/analog-console.mp3',
    requestedBy: '@owner_admin',
    artworkUrl: CATALOG_ARTWORKS[2],
  },
];

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 80;
  return Math.min(200, Math.max(10, Math.round(value)));
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function renderProgressBar(positionSec: number, durationSec: number, width = 17): string {
  const total = Math.max(1, durationSec);
  const ratio = Math.min(1, Math.max(0, positionSec / total));
  const knobIndex = Math.min(width - 1, Math.round(ratio * (width - 1)));
  let bar = '';
  for (let i = 0; i < width; i++) {
    bar += i === knobIndex ? '●' : '━';
  }
  return bar;
}

const SMALL_CAPS_MAP: Record<string, string> = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ғ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
  j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
  s: 's', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
};

export function toSmallCaps(input: string): string {
  return input
    .split(/(\s+)/)
    .map((token) => {
      if (!token || /^\s+$/.test(token)) return token;
      if (
        token.startsWith('/') ||
        token.startsWith('@') ||
        token.startsWith('http://') ||
        token.startsWith('https://') ||
        /^[A-Z0-9_]{3,}$/.test(token)
      ) {
        return token;
      }
      return Array.from(token)
        .map((ch) => SMALL_CAPS_MAP[ch.toLowerCase()] ?? ch)
        .join('');
    })
    .join('');
}

export function buildWelcomeMessage(): { text: string; inlineKeyboard: BotInlineButton[][] } {
  const text = toSmallCaps(
    [
      '🎧 Welcome To Music Spam Bot',
      '',
      '🎶 Your Music, Your World!',
      '✨ Premium Music Experience',
      '⚡ Ultra Fast Performance',
      '🎚️ Advanced Music Controls',
      '🎤 Auto Live Join System',
      '🎧 Personal Account Control',
      '🔥 Smart Music Streaming',
    ].join('\n'),
  );

  const inlineKeyboard: BotInlineButton[][] = [
    [
      { text: toSmallCaps('🎵 Play Music'), callbackData: 'cmd:play_prompt', style: 'success' },
      { text: toSmallCaps('🎧 Music Player'), callbackData: 'cmd:player', style: 'primary' },
    ],
    [
      { text: toSmallCaps('🎤 Auto Live Join'), callbackData: 'cmd:live_panel', style: 'success' },
      { text: toSmallCaps('👤 Account Control'), callbackData: 'cmd:account', style: 'primary' },
    ],
    [
      { text: toSmallCaps('📊 Now Playing'), callbackData: 'cmd:nowplaying', style: 'primary' },
      { text: toSmallCaps('🎚️ Volume Control'), callbackData: 'cmd:volume', style: 'primary' },
    ],
    [
      { text: toSmallCaps('📚 Help & Commands'), callbackData: 'cmd:help', style: 'primary' },
      { text: toSmallCaps('👑 Bot Owner'), callbackData: 'cmd:owner', style: 'primary' },
    ],
  ];

  return { text, inlineKeyboard };
}

function makeEqualizerFrames(startLabel: string, endLabel: string, finalText: string): string[] {
  const s1 = toSmallCaps(startLabel);
  const s2 = toSmallCaps(endLabel);
  return [
    `${s1}\n▁▂▃▄▅▆▇  ▰▱▱▱▱`,
    `${s1}\n▂▄▆▇▆▄▂  ▰▰▱▱▱`,
    `${s1}\n▄▆▇▅▃▅▇  ▰▰▰▱▱`,
    `${s2}\n▆▇▅▃▂▄▆  ▰▰▰▰▱`,
    `${s2}\n▇▆▅▄▃▂▁  ▰▰▰▰▰`,
    finalText,
  ];
}

export function buildPlayerMessage(state: BotSystemState): { text: string; inlineKeyboard: BotInlineButton[][] } {
  const track = state.playback.currentTrack;
  const volLabel = state.playback.muted ? 'Muted (0%)' : `${state.playback.volume}%`;
  const statusLabel =
    state.playback.status === 'playing'
      ? '▶️ Playing'
      : state.playback.status === 'paused'
        ? '⏸️ Paused'
        : state.playback.status === 'stopped'
          ? '⏹️ Stopped'
          : '💤 Idle';
  const liveLabel = state.liveSession.active
    ? `Connected (${state.liveSession.groupIdentifier})`
    : 'Not Joined';

  const queuePos = track ? `1 / ${1 + state.playback.queue.length}` : `0 / ${state.playback.queue.length}`;
  const bar = track
    ? renderProgressBar(state.playback.positionSec, track.durationSec)
    : '━━━━━━━━━━━━━━━━━';

  const text = track
    ? [
        toSmallCaps('🎧 Now Playing'),
        '',
        toSmallCaps(`🎵 Song: ${track.title}`),
        toSmallCaps(`👤 Artist: ${track.artist}`),
        toSmallCaps(`⏱️ Duration: ${formatDuration(state.playback.positionSec)} / ${formatDuration(track.durationSec)}`),
        toSmallCaps(`🔊 Volume: ${volLabel}`),
        toSmallCaps(`▶️ Status: ${statusLabel}`),
        toSmallCaps(`🎤 Live: ${liveLabel}`),
        toSmallCaps(`📚 Queue: ${queuePos} · Repeat: ${state.playback.repeatMode.toUpperCase()}`),
        '',
        bar,
      ].join('\n')
    : toSmallCaps(
        [
          '🎧 Music Player',
          '',
          'No track is currently active.',
          `🎤 Live: ${liveLabel}`,
          `🔊 Volume: ${volLabel}`,
          'Send /play <song or link> or tap Play Music below.',
        ].join('\n'),
      );

  const isPlaying = state.playback.status === 'playing';
  const inlineKeyboard: BotInlineButton[][] = [
    [
      { text: toSmallCaps('⏮️ Prev'), callbackData: 'player:prev', style: 'primary' },
      {
        text: toSmallCaps(isPlaying ? '⏸️ Pause' : '▶️ Resume'),
        callbackData: isPlaying ? 'player:pause' : 'player:resume',
        style: isPlaying ? 'primary' : 'success',
      },
      { text: toSmallCaps('⏭️ Skip'), callbackData: 'player:skip', style: 'primary' },
      { text: toSmallCaps('⏹️ Stop'), callbackData: 'player:stop', style: 'danger' },
    ],
    [
      { text: toSmallCaps(`🔁 Repeat: ${state.playback.repeatMode.toUpperCase()}`), callbackData: 'player:repeat', style: 'primary' },
      { text: toSmallCaps(`📚 Queue (${state.playback.queue.length})`), callbackData: 'cmd:queue', style: 'primary' },
    ],
    [
      { text: toSmallCaps('🎚️ Volume Control'), callbackData: 'cmd:volume', style: 'primary' },
      { text: toSmallCaps('🎤 Live Control'), callbackData: 'cmd:live_panel', style: 'success' },
    ],
    [{ text: toSmallCaps('🔙 Main Menu'), callbackData: 'cmd:start', style: 'primary' }],
  ];

  return { text, inlineKeyboard };
}

export function buildVolumeMessage(state: BotSystemState): { text: string; inlineKeyboard: BotInlineButton[][] } {
  const displayVol = state.playback.muted ? '🔇 Muted' : `🔊 ${state.playback.volume}%`;
  const text = toSmallCaps(
    [
      '🎚️ Volume Control',
      '',
      `<  ${displayVol}  >`,
      '',
      `Group Profile: ${state.liveSession.active ? state.liveSession.groupIdentifier : 'Global Default'}`,
      'Allowed Range: 10% – 200% (FFmpeg Real-Time Gain)',
    ].join('\n'),
  );

  const inlineKeyboard: BotInlineButton[][] = [
    [
      { text: '➖ 10%', callbackData: 'vol:-10', style: 'danger' },
      { text: '➕ 10%', callbackData: 'vol:+10', style: 'success' },
    ],
    [
      { text: '➖ 20%', callbackData: 'vol:-20', style: 'danger' },
      { text: '➕ 20%', callbackData: 'vol:+20', style: 'success' },
    ],
    [
      { text: '🔊 100%', callbackData: 'vol:100', style: 'primary' },
      { text: '🔥 150%', callbackData: 'vol:150', style: 'success' },
      { text: '🚀 200%', callbackData: 'vol:200', style: 'success' },
    ],
    [
      { text: toSmallCaps('🔇 Mute'), callbackData: 'vol:mute', style: 'danger' },
      { text: toSmallCaps('🔊 Unmute'), callbackData: 'vol:unmute', style: 'success' },
    ],
    [{ text: toSmallCaps('🔙 Back To Player'), callbackData: 'cmd:player', style: 'primary' }],
  ];

  return { text, inlineKeyboard };
}

export function buildLiveControlMessage(state: BotSystemState): { text: string; inlineKeyboard: BotInlineButton[][] } {
  const acct = state.account;
  const live = state.liveSession;
  const text = toSmallCaps(
    live.active
      ? [
          '🎤 Live Connected',
          '',
          `✅ Personal Account: ${acct.displayName} (${acct.username})`,
          '🎧 Voice Chat: Active',
          `📍 Group: ${live.groupTitle} (${live.groupIdentifier})`,
          `🎵 Music Player: ${state.playback.currentTrack ? 'Streaming' : 'Ready'}`,
          `🔊 Audio: ${state.playback.muted ? 'Muted' : `${state.playback.volume}%`}`,
          `⚡ Connection: ${live.connectionQuality}`,
          `📡 Streams: ${live.activeStreamsCount} / ${live.maxConcurrentStreams}`,
        ].join('\n')
      : [
          '🎤 Live Control Panel',
          '',
          `👤 Personal Account: ${acct.status.toUpperCase()} (${acct.username})`,
          '🎧 Voice Chat: Not Connected',
          'Send /joinlive https://t.me/group_name/123 or tap Join Live.',
        ].join('\n'),
  );

  const inlineKeyboard: BotInlineButton[][] = [
    [
      { text: toSmallCaps('🎤 Join Live'), callbackData: 'live:join_demo', style: 'success' },
      { text: toSmallCaps('🚪 Leave Live'), callbackData: 'live:leave', style: 'danger' },
    ],
    [
      { text: toSmallCaps('▶️ Play Music'), callbackData: 'cmd:play_demo', style: 'success' },
      { text: toSmallCaps('⏸️ Pause Music'), callbackData: 'player:pause', style: 'primary' },
    ],
    [
      { text: toSmallCaps('▶️ Resume Music'), callbackData: 'player:resume', style: 'success' },
      { text: toSmallCaps('⏭️ Skip Music'), callbackData: 'player:skip', style: 'primary' },
    ],
    [
      { text: toSmallCaps('⏹️ Stop Music'), callbackData: 'player:stop', style: 'danger' },
      { text: toSmallCaps('📊 Live Status'), callbackData: 'cmd:live_panel', style: 'primary' },
    ],
    [
      { text: toSmallCaps('🔊 Volume +10%'), callbackData: 'vol:+10', style: 'success' },
      { text: toSmallCaps('🔉 Volume -10%'), callbackData: 'vol:-10', style: 'danger' },
    ],
    [
      { text: toSmallCaps('🔇 Mute'), callbackData: 'vol:mute', style: 'danger' },
      { text: toSmallCaps('🔊 Unmute'), callbackData: 'vol:unmute', style: 'success' },
    ],
    [
      { text: toSmallCaps('🔄 Reconnect'), callbackData: 'account:reconnect', style: 'primary' },
      { text: toSmallCaps('🔙 Main Menu'), callbackData: 'cmd:start', style: 'primary' },
    ],
  ];

  return { text, inlineKeyboard };
}

export function buildAccountMessage(state: BotSystemState): { text: string; inlineKeyboard: BotInlineButton[][] } {
  const a = state.account;
  const text = toSmallCaps(
    [
      '👤 Personal Account Control',
      '',
      `Name: ${a.displayName}`,
      `Username: ${a.username}`,
      `Phone: ${a.phoneMasked}`,
      `MTProto Status: ${a.status.toUpperCase()} (${a.online ? 'Online' : 'Offline'})`,
      `Active Voice Chat: ${state.liveSession.active ? state.liveSession.groupIdentifier : 'None'}`,
      `Session Vault: ${a.sessionEncrypted ? 'AES-256-GCM Encrypted (Leak Guard Active)' : 'Not Configured'}`,
      `Reconnect Attempts: ${a.retryCount} / ${a.maxRetries}`,
    ].join('\n'),
  );

  const inlineKeyboard: BotInlineButton[][] = [
    [
      { text: toSmallCaps('🔗 Connect Account'), callbackData: 'account:connect', style: 'success' },
      { text: toSmallCaps('🔌 Disconnect'), callbackData: 'account:disconnect', style: 'danger' },
    ],
    [
      { text: toSmallCaps('🔄 Reconnect'), callbackData: 'account:reconnect', style: 'primary' },
      { text: toSmallCaps('🎤 Live Control'), callbackData: 'cmd:live_panel', style: 'success' },
    ],
    [{ text: toSmallCaps('🔙 Main Menu'), callbackData: 'cmd:start', style: 'primary' }],
  ];

  return { text, inlineKeyboard };
}

export function buildOwnerMessage(state: BotSystemState): { text: string; inlineKeyboard: BotInlineButton[][] } {
  const s = state.stats;
  const text = toSmallCaps(
    [
      '👑 Owner Dashboard',
      '',
      `👥 Total Users: ${s.totalUsers}`,
      `💬 Total Groups: ${s.totalGroups}`,
      `🎵 Total Music Played: ${s.totalMusicPlayed}`,
      `📡 Active Live Sessions: ${state.liveSession.active ? 1 : 0}`,
      `👤 Connected Accounts: ${state.account.status === 'connected' ? 1 : 0}`,
      `🖥️ Server CPU / RAM: ${s.cpuPercent}% / ${s.ramPercent}%`,
      `⚡ Backend Worker: ${s.backendOnline ? `Online (${s.backendLatencyMs}ms)` : 'Offline'}`,
      `🗄️ MySQL Database: ${s.databaseOnline ? 'Connected' : 'Offline'}`,
      `🛡️ Maintenance Mode: ${state.maintenanceMode ? 'Enabled' : 'Off'}`,
    ].join('\n'),
  );

  const inlineKeyboard: BotInlineButton[][] = [
    [
      {
        text: toSmallCaps(state.maintenanceMode ? '✅ Disable Maintenance' : '🛠️ Enable Maintenance'),
        callbackData: 'owner:toggle_maintenance',
        style: state.maintenanceMode ? 'success' : 'danger',
      },
      { text: toSmallCaps('🔄 Restart Backend'), callbackData: 'owner:restart_backend', style: 'primary' },
    ],
    [
      { text: toSmallCaps('👤 Account Control'), callbackData: 'cmd:account', style: 'primary' },
      { text: toSmallCaps('🔙 Main Menu'), callbackData: 'cmd:start', style: 'primary' },
    ],
  ];

  return { text, inlineKeyboard };
}

export function buildHelpMessage(): { text: string; inlineKeyboard: BotInlineButton[][] } {
  const text = toSmallCaps(
    [
      '📚 Command Reference — Music Spam Bot',
      '',
      'General:',
      '/start · /help · /play <song|url> · /pause · /resume',
      '/skip · /stop · /queue · /nowplaying',
      '/volume <10-200> · /mute · /unmute',
      '',
      'Live & Personal Account:',
      '/joinlive <t.me link> · /leavelive · /live · /autojoin',
      '/account · /connect · /disconnect · /reconnect',
      '',
      'System & Admin:',
      '/ping · /stats · /reload · /status',
      '/broadcast · /maintenance · /users · /groups · /restart',
    ].join('\n'),
  );

  return {
    text,
    inlineKeyboard: [
      [
        { text: toSmallCaps('🎧 Music Player'), callbackData: 'cmd:player', style: 'primary' },
        { text: toSmallCaps('🔙 Main Menu'), callbackData: 'cmd:start', style: 'primary' },
      ],
    ],
  };
}

export function createInitialBotState(): BotSystemState {
  const now = new Date().toISOString();
  const welcome = buildWelcomeMessage();
  return {
    botUsername: 'MUSIC SPAM BOT',
    maintenanceMode: false,
    account: {
      id: 'acct-personal-01',
      displayName: 'Studio Streamer Account',
      username: '@stream_controller',
      phoneMasked: '+880 17•• •••842',
      status: 'connected',
      online: true,
      sessionEncrypted: true,
      retryCount: 0,
      maxRetries: 3,
      lastHeartbeatAt: now,
    },
    liveSession: {
      active: false,
      groupTitle: 'Dhaka Late Night Lounge',
      groupIdentifier: '@dhaka_chill_vc',
      voiceChatId: 'live',
      autoJoinEnabled: true,
      connectionQuality: 'Stable',
      joinedAt: null,
      activeStreamsCount: 0,
      maxConcurrentStreams: 3,
    },
    playback: {
      status: 'idle',
      currentTrack: null,
      positionSec: 0,
      volume: 80,
      muted: false,
      previousVolume: 80,
      repeatMode: 'off',
      queue: [DEFAULT_LIBRARY_TRACKS[1], DEFAULT_LIBRARY_TRACKS[2]],
      history: [],
    },
    stats: {
      totalUsers: 1482,
      totalGroups: 94,
      totalMusicPlayed: 6819,
      cpuPercent: 18,
      ramPercent: 42,
      backendLatencyMs: 28,
      backendOnline: true,
      databaseOnline: true,
    },
    users: [
      { id: 'u-1', name: 'Owner Admin', username: '@owner_admin', role: 'owner', requestsCount: 342, banned: false },
      { id: 'u-2', name: 'Rafi Ahmed', username: '@rafi_sound', role: 'admin', requestsCount: 129, banned: false },
      { id: 'u-3', name: 'Nadia Karim', username: '@nadia_k', role: 'member', requestsCount: 47, banned: false },
    ],
    groups: [
      { id: 'g-1', title: 'Dhaka Late Night Lounge', identifier: '@dhaka_chill_vc', volume: 80, autoJoin: true, active: true },
      { id: 'g-2', title: 'BD Acoustic Club', identifier: '@bd_acoustic', volume: 100, autoJoin: true, active: true },
      { id: 'g-3', title: 'Midnight Lo-Fi Room', identifier: '@midnight_lofi', volume: 65, autoJoin: false, active: true },
    ],
    errorLogs: [
      {
        id: 'err-1',
        timestamp: now,
        component: 'pytgcalls',
        message: 'Recovered Opus jitter buffer cleanly after 180ms packet delay.',
      },
    ],
    messages: [
      {
        id: 'msg-init-1',
        sender: 'bot',
        text: welcome.text,
        inlineKeyboard: welcome.inlineKeyboard,
        timestamp: now,
        effectBadge: '🎉 Confetti Effect',
        kind: 'welcome',
      },
    ],
  };
}

function makeMessage(
  sender: 'user' | 'bot',
  text: string,
  extra: Partial<BotMessage> = {},
): BotMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sender,
    text,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

function cloneState(state: BotSystemState): BotSystemState {
  return JSON.parse(JSON.stringify(state)) as BotSystemState;
}

/**
 * Pure state-machine dispatcher for Telegram commands and inline callback actions.
 * Drives both the live Express webhook simulator and the interactive Studio UI.
 */
export function processBotInput(
  prevState: BotSystemState,
  rawInput: string,
  options: { isCallback?: boolean; senderUsername?: string } = {},
): BotSystemState {
  const state = cloneState(prevState);
  const input = rawInput.trim();
  if (!input) return state;

  const isCallback = Boolean(options.isCallback);
  const sender = options.senderUsername || '@owner_admin';

  if (!isCallback) {
    state.messages.push(makeMessage('user', input));
  }

  // Maintenance gate (allows /maintenance and /start for owner)
  if (
    state.maintenanceMode &&
    !input.startsWith('/maintenance') &&
    !input.startsWith('owner:') &&
    input !== '/start' &&
    input !== 'cmd:start'
  ) {
    state.messages.push(
      makeMessage('bot', '🛠️ Maintenance Mode is currently active. Only owner controls are permitted.', {
        kind: 'error',
      }),
    );
    return state;
  }

  // Handle inline callback routes
  if (isCallback) {
    if (input === 'cmd:start') {
      const w = buildWelcomeMessage();
      state.messages.push(
        makeMessage('bot', w.text, {
          inlineKeyboard: w.inlineKeyboard,
          kind: 'welcome',
          effectBadge: '🎉 Confetti Effect',
          animationFrames: makeEqualizerFrames('⚡ Booting Music Spam Bot...', '🎧 Syncing Live Controls...', w.text),
        }),
      );
      return state;
    }

    if (input === 'cmd:player' || input === 'cmd:nowplaying') {
      const p = buildPlayerMessage(state);
      state.messages.push(
        makeMessage('bot', p.text, {
          inlineKeyboard: p.inlineKeyboard,
          kind: 'player',
          effectBadge: '🔥 Fire Effect',
        }),
      );
      return state;
    }

    if (input === 'cmd:volume') {
      const v = buildVolumeMessage(state);
      state.messages.push(
        makeMessage('bot', v.text, {
          inlineKeyboard: v.inlineKeyboard,
          kind: 'volume',
          effectBadge: '🔥 Fire Effect',
          animationFrames: [toSmallCaps('🎚️ Opening Volume Control...'), toSmallCaps('🔥 Volume Range: 10% – 200%...'), v.text],
        }),
      );
      return state;
    }

    if (input === 'cmd:live_panel') {
      const l = buildLiveControlMessage(state);
      state.messages.push(
        makeMessage('bot', l.text, {
          inlineKeyboard: l.inlineKeyboard,
          kind: 'live',
          effectBadge: '❤️ Heart Effect',
        }),
      );
      return state;
    }

    if (input === 'cmd:account') {
      const a = buildAccountMessage(state);
      state.messages.push(
        makeMessage('bot', a.text, {
          inlineKeyboard: a.inlineKeyboard,
          kind: 'account',
          effectBadge: '❤️ Heart Effect',
        }),
      );
      return state;
    }

    if (input === 'cmd:owner') {
      const o = buildOwnerMessage(state);
      state.messages.push(
        makeMessage('bot', o.text, {
          inlineKeyboard: o.inlineKeyboard,
          kind: 'owner',
          effectBadge: '🎉 Confetti Effect',
        }),
      );
      return state;
    }

    if (input === 'cmd:help') {
      const h = buildHelpMessage();
      state.messages.push(
        makeMessage('bot', h.text, {
          inlineKeyboard: h.inlineKeyboard,
          kind: 'help',
          effectBadge: '👍 Thumbs Up Effect',
        }),
      );
      return state;
    }

    if (input === 'cmd:play_prompt') {
      const guide = toSmallCaps('🎵 Send /play <song name or audio URL>, /search <song>, or tap Quick Demo Play below.');
      state.messages.push(
        makeMessage('bot', guide, {
          kind: 'info',
          effectBadge: '🔥 Fire Effect',
          animationFrames: [toSmallCaps('🎵 Opening Music Set...'), toSmallCaps('🔥 Ready To Stream...'), guide],
          inlineKeyboard: [
            [{ text: toSmallCaps('▶️ Play Midnight Signal'), callbackData: 'cmd:play_demo', style: 'success' }],
            [{ text: toSmallCaps('🔙 Main Menu'), callbackData: 'cmd:start', style: 'primary' }],
          ],
        }),
      );
      return state;
    }

    if (input === 'cmd:play_demo') {
      return processBotInput(state, '/play Midnight Signal (Studio Mix)', {
        isCallback: false,
        senderUsername: sender,
      });
    }

    if (input === 'cmd:queue') {
      const lines = [toSmallCaps('📚 Music Queue'), ''];
      if (state.playback.currentTrack) {
        lines.push(toSmallCaps(`▶️ Now: ${state.playback.currentTrack.title} (${formatDuration(state.playback.currentTrack.durationSec)})`));
      }
      if (state.playback.queue.length === 0) {
        lines.push(toSmallCaps('Queue is empty. Use /play <song> to add tracks.'));
      } else {
        state.playback.queue.forEach((t, idx) => {
          lines.push(toSmallCaps(`${idx + 1}. ${t.title} — ${t.artist} [${formatDuration(t.durationSec)}]`));
        });
      }
      state.messages.push(
        makeMessage('bot', lines.join('\n'), {
          kind: 'queue',
          effectBadge: '👍 Thumbs Up Effect',
          inlineKeyboard: [
            [
              { text: toSmallCaps('⏭️ Skip Track'), callbackData: 'player:skip', style: 'primary' },
              { text: toSmallCaps('🎧 Player'), callbackData: 'cmd:player', style: 'success' },
            ],
          ],
        }),
      );
      return state;
    }

    if (input === 'live:join_demo') {
      return processBotInput(state, '/joinlive https://t.me/dhaka_chill_vc/42', {
        isCallback: false,
        senderUsername: sender,
      });
    }

    if (input === 'live:leave') {
      return processBotInput(state, '/leavelive', { isCallback: false, senderUsername: sender });
    }

    if (input.startsWith('vol:')) {
      const action = input.slice(4);
      if (action === 'mute') {
        if (!state.playback.muted) {
          state.playback.previousVolume = state.playback.volume;
          state.playback.muted = true;
        }
      } else if (action === 'unmute') {
        state.playback.muted = false;
        state.playback.volume = clampVolume(state.playback.previousVolume || state.playback.volume);
      } else if (/^[+-]\d+$/.test(action)) {
        const delta = Number(action);
        state.playback.muted = false;
        state.playback.volume = clampVolume(state.playback.volume + delta);
        state.playback.previousVolume = state.playback.volume;
      } else if (/^\d+$/.test(action)) {
        state.playback.muted = false;
        state.playback.volume = clampVolume(Number(action));
        state.playback.previousVolume = state.playback.volume;
      }
      const v = buildVolumeMessage(state);
      state.messages.push(
        makeMessage('bot', v.text, {
          inlineKeyboard: v.inlineKeyboard,
          kind: 'volume',
          effectBadge: action === 'mute' ? '👎 Alert Effect' : '🔥 Fire Effect',
        }),
      );
      return state;
    }

    if (input.startsWith('player:')) {
      const action = input.slice(7);
      if (action === 'pause') {
        if (state.playback.currentTrack && state.playback.status === 'playing') {
          state.playback.status = 'paused';
        }
      } else if (action === 'resume') {
        if (state.playback.currentTrack) {
          state.playback.status = 'playing';
        } else if (state.playback.queue.length > 0) {
          const next = state.playback.queue.shift()!;
          state.playback.currentTrack = next;
          state.playback.positionSec = 0;
          state.playback.status = 'playing';
          state.stats.totalMusicPlayed += 1;
        }
      } else if (action === 'stop') {
        if (state.playback.currentTrack) {
          state.playback.history.unshift(state.playback.currentTrack);
        }
        state.playback.currentTrack = null;
        state.playback.positionSec = 0;
        state.playback.status = 'stopped';
      } else if (action === 'skip') {
        return skipCurrentTrack(state);
      } else if (action === 'prev') {
        if (state.playback.history.length > 0) {
          const prev = state.playback.history.shift()!;
          if (state.playback.currentTrack) {
            state.playback.queue.unshift(state.playback.currentTrack);
          }
          state.playback.currentTrack = prev;
          state.playback.positionSec = 0;
          state.playback.status = 'playing';
        }
      } else if (action === 'repeat') {
        const modes: RepeatMode[] = ['off', 'one', 'all'];
        const idx = modes.indexOf(state.playback.repeatMode);
        state.playback.repeatMode = modes[(idx + 1) % modes.length];
      }
      const p = buildPlayerMessage(state);
      state.messages.push(
        makeMessage('bot', p.text, {
          inlineKeyboard: p.inlineKeyboard,
          kind: 'player',
          effectBadge: action === 'stop' ? '👎 Alert Effect' : '🔥 Fire Effect',
        }),
      );
      return state;
    }

    if (input.startsWith('account:')) {
      const action = input.slice(8);
      if (action === 'connect') {
        state.account.status = 'connected';
        state.account.online = true;
        state.account.retryCount = 0;
        state.account.lastHeartbeatAt = new Date().toISOString();
      } else if (action === 'disconnect') {
        state.account.status = 'disconnected';
        state.account.online = false;
        state.liveSession.active = false;
        state.liveSession.activeStreamsCount = 0;
        state.liveSession.connectionQuality = 'Offline';
        if (state.playback.status === 'playing') {
          state.playback.status = 'paused';
        }
      } else if (action === 'reconnect') {
        state.account.status = 'connected';
        state.account.online = true;
        state.account.retryCount = Math.min(state.account.maxRetries, state.account.retryCount + 1);
        state.account.lastHeartbeatAt = new Date().toISOString();
        if (state.liveSession.active) {
          state.liveSession.connectionQuality = 'Stable';
        }
      }
      const a = buildAccountMessage(state);
      state.messages.push(
        makeMessage('bot', a.text, {
          inlineKeyboard: a.inlineKeyboard,
          kind: 'account',
          effectBadge: action === 'disconnect' ? '👎 Alert Effect' : '❤️ Heart Effect',
          animationFrames:
            action === 'reconnect' || action === 'connect'
              ? [toSmallCaps('🔐 Verifying MTProto Session...'), toSmallCaps('✅ Personal Account Online!'), a.text]
              : undefined,
        }),
      );
      return state;
    }

    if (input === 'owner:toggle_maintenance') {
      state.maintenanceMode = !state.maintenanceMode;
      const o = buildOwnerMessage(state);
      state.messages.push(
        makeMessage('bot', o.text, {
          inlineKeyboard: o.inlineKeyboard,
          kind: 'owner',
          effectBadge: state.maintenanceMode ? '👎 Alert Effect' : '🎉 Confetti Effect',
        }),
      );
      return state;
    }

    if (input === 'owner:restart_backend') {
      state.stats.backendOnline = true;
      state.stats.backendLatencyMs = 24;
      state.account.retryCount = 0;
      const o = buildOwnerMessage(state);
      state.messages.push(
        makeMessage('bot', o.text, {
          inlineKeyboard: o.inlineKeyboard,
          kind: 'owner',
          effectBadge: '⚡ Restarted',
          animationFrames: [toSmallCaps('🔄 Restarting Audio Worker...'), toSmallCaps('🎚️ Syncing FFmpeg & PyTgCalls...'), o.text],
        }),
      );
      return state;
    }
  }

  // Handle slash commands
  const [rawCmd, ...argParts] = input.split(/\s+/);
  const cmd = rawCmd.toLowerCase().split('@')[0];
  const arg = argParts.join(' ').trim();

  switch (cmd) {
    case '/start': {
      const w = buildWelcomeMessage();
      state.messages.push(
        makeMessage('bot', w.text, {
          inlineKeyboard: w.inlineKeyboard,
          kind: 'welcome',
          effectBadge: '🎉 Confetti Effect',
          animationFrames: makeEqualizerFrames('⚡ Booting Music Spam Bot...', '🎧 Syncing Live Controls...', w.text),
        }),
      );
      return state;
    }

    case '/help': {
      const h = buildHelpMessage();
      state.messages.push(
        makeMessage('bot', h.text, {
          inlineKeyboard: h.inlineKeyboard,
          kind: 'help',
          effectBadge: '👍 Thumbs Up Effect',
        }),
      );
      return state;
    }

    case '/joinlive': {
      if (!arg) {
        state.messages.push(
          makeMessage('bot', '❌ Invalid Live Link\nUsage: /joinlive https://t.me/group_name/123', {
            kind: 'error',
            effectBadge: '👎 Alert Effect',
          }),
        );
        return state;
      }
      if (!state.stats.backendOnline) {
        state.messages.push(makeMessage('bot', '❌ Streaming Backend Offline', { kind: 'error', effectBadge: '👎 Alert Effect' }));
        return state;
      }
      if (state.account.status !== 'connected') {
        state.messages.push(
          makeMessage('bot', '❌ Account Has No Access\nPersonal account is disconnected. Run /connect first.', {
            kind: 'error',
            effectBadge: '👎 Alert Effect',
          }),
        );
        return state;
      }

      const parsed = parseTelegramLiveLink(arg);
      if (!parsed.valid || !parsed.chatIdentifier) {
        state.messages.push(
          makeMessage('bot', `❌ Invalid Live Link\n${parsed.reason ?? 'Unrecognized Telegram link.'}`, {
            kind: 'error',
            effectBadge: '👎 Alert Effect',
          }),
        );
        return state;
      }

      state.liveSession.active = true;
      state.liveSession.groupIdentifier = parsed.chatIdentifier;
      state.liveSession.groupTitle = parsed.chatIdentifier.replace('@', '').replace(/_/g, ' ');
      state.liveSession.voiceChatId = parsed.voiceChatId || 'live';
      state.liveSession.connectionQuality = 'Stable';
      state.liveSession.joinedAt = new Date().toISOString();
      state.liveSession.activeStreamsCount = 1;

      const liveMsg = buildLiveControlMessage(state);
      state.messages.push(
        makeMessage('bot', liveMsg.text, {
          inlineKeyboard: liveMsg.inlineKeyboard,
          kind: 'live',
          effectBadge: '❤️ Heart Effect',
          animationFrames: [toSmallCaps('🎤 Connecting Voice Chat...'), toSmallCaps(`🔊 Joining ${parsed.chatIdentifier}...`), liveMsg.text],
        }),
      );
      return state;
    }

    case '/leavelive': {
      state.liveSession.active = false;
      state.liveSession.activeStreamsCount = 0;
      state.liveSession.connectionQuality = 'Offline';
      if (state.playback.status === 'playing') {
        state.playback.status = 'paused';
      }
      state.messages.push(
        makeMessage('bot', toSmallCaps('🚪 Left the active Voice Chat cleanly. Session resources released.'), {
          kind: 'live',
          effectBadge: '👎 Alert Effect',
          inlineKeyboard: [
            [
              { text: toSmallCaps('🎤 Rejoin Live'), callbackData: 'live:join_demo', style: 'success' },
              { text: toSmallCaps('🔙 Main Menu'), callbackData: 'cmd:start', style: 'primary' },
            ],
          ],
        }),
      );
      return state;
    }

    case '/live': {
      const l = buildLiveControlMessage(state);
      state.messages.push(
        makeMessage('bot', l.text, {
          inlineKeyboard: l.inlineKeyboard,
          kind: 'live',
          effectBadge: '🔥 Fire Effect',
        }),
      );
      return state;
    }

    case '/autojoin': {
      state.liveSession.autoJoinEnabled = !state.liveSession.autoJoinEnabled;
      state.messages.push(
        makeMessage(
          'bot',
          `🎤 Auto Live Join is now ${state.liveSession.autoJoinEnabled ? 'ENABLED' : 'DISABLED'}.`,
          { kind: 'live', effectBadge: state.liveSession.autoJoinEnabled ? '❤️ Heart Effect' : '👎 Alert Effect' },
        ),
      );
      return state;
    }

    case '/play': {
      if (!arg) {
        state.messages.push(
          makeMessage('bot', '🎵 Please specify a song name or direct audio link: /play <query or url>', {
            kind: 'error',
          }),
        );
        return state;
      }

      if (arg.startsWith('http://') || arg.startsWith('https://')) {
        const safe = validateSafeExternalUrl(arg);
        if (!safe.valid) {
          state.messages.push(makeMessage('bot', `❌ Blocked Media URL: ${safe.reason}`, { kind: 'error' }));
          return state;
        }
      }

      if (!state.liveSession.active && state.liveSession.autoJoinEnabled && state.account.status === 'connected') {
        state.liveSession.active = true;
        state.liveSession.activeStreamsCount = 1;
        state.liveSession.connectionQuality = 'Stable';
        state.liveSession.joinedAt = new Date().toISOString();
      }

      const matched = DEFAULT_LIBRARY_TRACKS.find((t) =>
        t.title.toLowerCase().includes(arg.toLowerCase()),
      );

      const newTrack: TrackItem = matched
        ? { ...matched, id: `trk-${Date.now()}`, requestedBy: sender }
        : {
            id: `trk-${Date.now()}`,
            title: arg.startsWith('http') ? arg.split('/').pop() || 'Live Audio Stream' : arg,
            artist: arg.startsWith('http') ? 'External Stream Source' : 'Requested Track',
            durationSec: 232,
            sourceType: arg.startsWith('http') ? 'stream_link' : 'library',
            sourceUrl: arg.startsWith('http') ? arg : DEFAULT_LIBRARY_TRACKS[0].sourceUrl,
            requestedBy: sender,
            artworkUrl: CATALOG_ARTWORKS[state.stats.totalMusicPlayed % CATALOG_ARTWORKS.length],
          };

      if (!state.playback.currentTrack || state.playback.status === 'idle' || state.playback.status === 'stopped') {
        state.playback.currentTrack = newTrack;
        state.playback.positionSec = 0;
        state.playback.status = 'playing';
        state.stats.totalMusicPlayed += 1;
      } else {
        state.playback.queue.push(newTrack);
      }

      const player = buildPlayerMessage(state);
      state.messages.push(
        makeMessage('bot', player.text, {
          inlineKeyboard: player.inlineKeyboard,
          kind: 'player',
          effectBadge: '🔥 Fire Effect',
          animationFrames: [toSmallCaps('🎵 Fetching Audio...'), toSmallCaps('🔥 Tuning FFmpeg Stream...'), player.text],
        }),
      );
      return state;
    }

    case '/pause':
      return processBotInput(state, 'player:pause', { isCallback: true, senderUsername: sender });

    case '/resume':
      return processBotInput(state, 'player:resume', { isCallback: true, senderUsername: sender });

    case '/skip':
      return processBotInput(state, 'player:skip', { isCallback: true, senderUsername: sender });

    case '/stop':
      return processBotInput(state, 'player:stop', { isCallback: true, senderUsername: sender });

    case '/queue':
      return processBotInput(state, 'cmd:queue', { isCallback: true, senderUsername: sender });

    case '/nowplaying':
      return processBotInput(state, 'cmd:nowplaying', { isCallback: true, senderUsername: sender });

    case '/volume': {
      if (!arg) {
        return processBotInput(state, 'cmd:volume', { isCallback: true, senderUsername: sender });
      }
      const parsedVol = Number(arg.replace('%', ''));
      if (!Number.isFinite(parsedVol)) {
        state.messages.push(makeMessage('bot', '❌ Volume must be between 10 and 200.', { kind: 'error', effectBadge: '👎 Alert Effect' }));
        return state;
      }
      state.playback.muted = false;
      state.playback.volume = clampVolume(parsedVol);
      state.playback.previousVolume = state.playback.volume;
      const v = buildVolumeMessage(state);
      state.messages.push(
        makeMessage('bot', v.text, {
          inlineKeyboard: v.inlineKeyboard,
          kind: 'volume',
          effectBadge: '🔥 Fire Effect',
          animationFrames: [toSmallCaps('🎚️ Opening Volume Control...'), toSmallCaps('🔥 Volume Range: 10% – 200%...'), v.text],
        }),
      );
      return state;
    }

    case '/mute':
      return processBotInput(state, 'vol:mute', { isCallback: true, senderUsername: sender });

    case '/unmute':
      return processBotInput(state, 'vol:unmute', { isCallback: true, senderUsername: sender });

    case '/account':
      return processBotInput(state, 'cmd:account', { isCallback: true, senderUsername: sender });

    case '/connect':
      return processBotInput(state, 'account:connect', { isCallback: true, senderUsername: sender });

    case '/disconnect':
      return processBotInput(state, 'account:disconnect', { isCallback: true, senderUsername: sender });

    case '/reconnect':
      return processBotInput(state, 'account:reconnect', { isCallback: true, senderUsername: sender });

    case '/ping': {
      state.messages.push(
        makeMessage(
          'bot',
          `⚡ Pong! Webhook: 14ms · Audio Worker: ${state.stats.backendLatencyMs}ms · DB: 6ms`,
          { kind: 'info', effectBadge: '🎉 Confetti Effect' },
        ),
      );
      return state;
    }

    case '/stats':
    case '/status':
    case '/owner':
      return processBotInput(state, 'cmd:owner', { isCallback: true, senderUsername: sender });

    case '/maintenance': {
      return processBotInput(state, 'owner:toggle_maintenance', { isCallback: true, senderUsername: sender });
    }

    case '/reload':
    case '/restart': {
      return processBotInput(state, 'owner:restart_backend', { isCallback: true, senderUsername: sender });
    }

    case '/broadcast': {
      if (!arg) {
        state.messages.push(makeMessage('bot', '📢 Usage: /broadcast <announcement message>', { kind: 'error', effectBadge: '👎 Alert Effect' }));
        return state;
      }
      state.messages.push(
        makeMessage(
          'bot',
          `📢 Broadcast dispatched cleanly to ${state.stats.totalUsers} users and ${state.stats.totalGroups} groups:\n"${arg}"`,
          { kind: 'owner', effectBadge: '🎉 Confetti Effect' },
        ),
      );
      return state;
    }

    case '/users': {
      const list = state.users
        .map((u) => `• ${u.name} (${u.username}) · ${u.role.toUpperCase()} · ${u.requestsCount} plays`)
        .join('\n');
      state.messages.push(makeMessage('bot', `👥 𝐑𝐄𝐆𝐈𝐒𝐓𝐄𝐑𝐄𝐃 𝐔𝐒𝐄𝐑𝐒\n\n${list}`, { kind: 'owner', effectBadge: '👍 Thumbs Up Effect' }));
      return state;
    }

    case '/groups': {
      const list = state.groups
        .map((g) => `• ${g.title} (${g.identifier}) · Vol ${g.volume}% · AutoJoin ${g.autoJoin ? 'ON' : 'OFF'}`)
        .join('\n');
      state.messages.push(makeMessage('bot', `💬 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃 𝐆𝐑𝐎𝐔𝐏𝐒\n\n${list}`, { kind: 'owner', effectBadge: '👍 Thumbs Up Effect' }));
      return state;
    }

    default: {
      // If user pasted a Telegram live link directly without /joinlive
      if (input.includes('t.me/') || input.includes('telegram.me/')) {
        return processBotInput(state, `/joinlive ${input}`, { isCallback: false, senderUsername: sender });
      }
      state.messages.push(
        makeMessage('bot', `Unrecognized command "${cmd}". Send /help to view all supported commands.`, {
          kind: 'error',
          effectBadge: '👎 Alert Effect',
        }),
      );
      return state;
    }
  }
}

export function skipCurrentTrack(state: BotSystemState): BotSystemState {
  if (state.playback.currentTrack) {
    if (state.playback.repeatMode === 'one') {
      state.playback.positionSec = 0;
      state.playback.status = 'playing';
      return state;
    }
    if (state.playback.repeatMode === 'all') {
      state.playback.queue.push(state.playback.currentTrack);
    } else {
      state.playback.history.unshift(state.playback.currentTrack);
    }
  }

  if (state.playback.queue.length > 0) {
    state.playback.currentTrack = state.playback.queue.shift()!;
    state.playback.positionSec = 0;
    state.playback.status = 'playing';
    state.stats.totalMusicPlayed += 1;
  } else {
    state.playback.currentTrack = null;
    state.playback.positionSec = 0;
    state.playback.status = 'idle';
  }
  return state;
}

export function tickPlayback(prevState: BotSystemState, deltaSec = 1): BotSystemState {
  if (prevState.playback.status !== 'playing' || !prevState.playback.currentTrack) {
    return prevState;
  }
  const state = cloneState(prevState);
  state.playback.positionSec += deltaSec;
  if (state.playback.positionSec >= state.playback.currentTrack!.durationSec) {
    return skipCurrentTrack(state);
  }
  return state;
}
