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
  photoBadge?: string;
  kind?: 'welcome' | 'player' | 'volume' | 'live' | 'account' | 'owner' | 'help' | 'error' | 'queue' | 'info' | 'maintenance' | 'admin_alert';
}

export interface BotUserRecord {
  id: string;
  chatId: number;
  name: string;
  username: string;
  role: 'owner' | 'admin' | 'member';
  requestsCount: number;
  banned: boolean;
  joinedAt: string;
  lastSeenAt: string;
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

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatBangladeshDateTime(dateInput: Date | string | number = new Date()): {
  dateStr: string;
  timeStr: string;
  fullStr: string;
} {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const dateStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(safeDate);
  const timeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(safeDate);
  return {
    dateStr,
    timeStr,
    fullStr: `${dateStr} · ${timeStr} (BD)`,
  };
}

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
        token.startsWith('tg://') ||
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

const DIVIDER = '━━━━━━━━━━━━━━━━━━━━';

export function buildWelcomeMessage(options: {
  userId?: number | string;
  userName?: string;
  isAdmin?: boolean;
  liveActive?: boolean;
  volume?: number;
  muted?: boolean;
  maintenanceMode?: boolean;
} = {}): { text: string; inlineKeyboard: BotInlineButton[][] } {
  const userId = String(options.userId ?? 100001);
  const userName = escapeHtml(options.userName || 'Music Lover');
  const isAdmin = Boolean(options.isAdmin);
  const volLabel = options.muted ? 'ᴍᴜᴛᴇᴅ' : `${options.volume ?? 80}%`;
  const liveLabel = options.liveActive ? '🟢 ᴄᴏɴɴᴇᴄᴛᴇᴅ' : '⚪ ɪᴅʟᴇ';
  const statusBadge = isAdmin ? '👑 ᴀᴅᴍɪɴ' : '✅ ᴠᴇʀɪғɪᴇᴅ';
  const maintNote =
    isAdmin && options.maintenanceMode
      ? `\n⚠️ <b>ʙᴏᴛ ᴍᴏᴅᴇ:</b> 🔴 ᴍᴀɪɴᴛᴇɴᴀɴᴄᴇ (ᴏғғ ғᴏʀ ᴜsᴇʀs)`
      : '';

  const text = [
    `🎧 <b>${toSmallCaps('MUSIC SPAM BOT')}</b>`,
    DIVIDER,
    '',
    `👋 <b>${toSmallCaps('WELCOME')}, <a href="tg://user?id=${userId}">${userName}</a>!</b>`,
    '',
    `<blockquote>🪪 <b>${toSmallCaps('USER ID')}:</b> <code>${userId}</code>\n🔗 <b>${toSmallCaps('STATUS')}:</b> ${statusBadge}\n🎤 <b>${toSmallCaps('LIVE VC')}:</b> ${liveLabel}\n🔊 <b>${toSmallCaps('VOLUME')}:</b> ${volLabel} · <b>${toSmallCaps('ALERTS')}:</b> 🟢 ${toSmallCaps('ACTIVE')}${maintNote}</blockquote>`,
    '',
    `🎶 <b>${toSmallCaps('Stream HD music, auto-join live voice chats, boost ffmpeg volume 10%–200%, and manage personal playback seamlessly.')}</b>`,
    '',
    `🔐 <b>${toSmallCaps('SELECT AN OPTION BELOW')}:</b>`,
  ].join('\n');

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
    isAdmin
      ? [
          { text: toSmallCaps('📚 Help & Commands'), callbackData: 'cmd:help', style: 'primary' },
          { text: toSmallCaps('👑 Admin Panel'), callbackData: 'cmd:owner', style: 'danger' },
        ]
      : [{ text: toSmallCaps('📚 Help & Commands'), callbackData: 'cmd:help', style: 'primary' }],
  ];

  return { text, inlineKeyboard };
}

export function buildMaintenanceMessage(options: {
  userId?: number | string;
  userName?: string;
} = {}): { text: string; inlineKeyboard: BotInlineButton[][] } {
  const userId = String(options.userId ?? 100002);
  const userName = escapeHtml(options.userName || 'Friend');
  const bd = formatBangladeshDateTime();
  const text = [
    `🛠️ <b>${toSmallCaps('MAINTENANCE MODE')}</b>`,
    DIVIDER,
    '',
    `👋 <b>${toSmallCaps('HELLO')}, <a href="tg://user?id=${userId}">${userName}</a>!</b>`,
    '',
    `<blockquote>🚦 <b>${toSmallCaps('BOT STATUS')}:</b> 🔴 ${toSmallCaps('OFFLINE (MAINTENANCE)')}\n🪪 <b>${toSmallCaps('YOUR ID')}:</b> <code>${userId}</code>\n📅 <b>${toSmallCaps('DATE (BD)')}:</b> ${bd.dateStr}\n🕒 <b>${toSmallCaps('TIME (BD 12H)')}:</b> ${bd.timeStr}</blockquote>`,
    '',
    `⚙️ <b>${toSmallCaps('The bot is currently under scheduled maintenance and studio upgrades.')}</b>`,
    `✨ <i>${toSmallCaps('Please try again shortly — service will resume soon!')}</i>`,
  ].join('\n');

  return {
    text,
    inlineKeyboard: [[{ text: toSmallCaps('🔄 Check Status'), callbackData: 'cmd:start', style: 'primary' }]],
  };
}

export function buildNewUserAdminAlert(user: {
  userId: number | string;
  chatId: number | string;
  name: string;
  username?: string;
  joinedAt?: string;
  totalUsers: number;
}): { text: string; inlineKeyboard: BotInlineButton[][] } {
  const bd = formatBangladeshDateTime(user.joinedAt || new Date());
  const cleanName = escapeHtml(user.name || 'Telegram User');
  const handle = user.username
    ? user.username.startsWith('@')
      ? escapeHtml(user.username)
      : `@${escapeHtml(user.username)}`
    : toSmallCaps('No Username');
  const text = [
    `🆕 <b>${toSmallCaps('NEW USER JOINED BOT')}</b>`,
    DIVIDER,
    '',
    `<blockquote>👤 <b>${toSmallCaps('NAME')}:</b> <a href="tg://user?id=${user.userId}">${cleanName}</a>\n🔗 <b>${toSmallCaps('USERNAME')}:</b> ${handle}\n🪪 <b>${toSmallCaps('CHAT ID')}:</b> <code>${user.chatId}</code>\n📅 <b>${toSmallCaps('DATE (BD)')}:</b> ${bd.dateStr}\n🕒 <b>${toSmallCaps('TIME (BD 12H)')}:</b> ${bd.timeStr}\n👥 <b>${toSmallCaps('TOTAL USERS')}:</b> #${user.totalUsers}</blockquote>`,
    '',
    `🔐 <b>${toSmallCaps('QUICK ADMIN ACTIONS')}:</b>`,
  ].join('\n');

  return {
    text,
    inlineKeyboard: [
      [
        { text: toSmallCaps('🚫 Block User'), callbackData: `admin:block:${user.userId}:0`, style: 'danger' },
        { text: toSmallCaps('👑 Admin Panel'), callbackData: 'cmd:owner', style: 'primary' },
      ],
    ],
  };
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

export function makePlayDeckFrames(finalText: string): string[] {
  return [
    `🎧 <b>${toSmallCaps('MUSIC STUDIO DECK')}</b>\n${DIVIDER}\n<blockquote>⚡ <b>${toSmallCaps('INITIALIZING AUDIO ENGINE...')}</b>\n◈──────────  <b>25%</b>  [ʟ/ʀ sʏɴᴄ]</blockquote>`,
    `🎧 <b>${toSmallCaps('MUSIC STUDIO DECK')}</b>\n${DIVIDER}\n<blockquote>🎛️ <b>${toSmallCaps('CALIBRATING FFMPEG DSP...')}</b>\n━━━◈───────  <b>50%</b>  [▮▮▮▯▯▯]</blockquote>`,
    `🎧 <b>${toSmallCaps('MUSIC STUDIO DECK')}</b>\n${DIVIDER}\n<blockquote>🔥 <b>${toSmallCaps('LOADING HD STREAM CHANNELS...')}</b>\n━━━━━━◈────  <b>75%</b>  [▮▮▮▮▮▯]</blockquote>`,
    `🎧 <b>${toSmallCaps('MUSIC STUDIO DECK')}</b>\n${DIVIDER}\n<blockquote>✨ <b>${toSmallCaps('STUDIO READY · 48KHZ HI-FI')}</b>\n━━━━━━━━━━◈  <b>100%</b> [▮▮▮▮▮▮]</blockquote>`,
    finalText,
  ];
}

export function buildPlayerMessage(state: BotSystemState): { text: string; inlineKeyboard: BotInlineButton[][] } {
  const track = state.playback.currentTrack;
  const volLabel = state.playback.muted ? toSmallCaps('Muted (0%)') : `${state.playback.volume}%`;
  const statusLabel =
    state.playback.status === 'playing'
      ? `▶️ ${toSmallCaps('Playing')}`
      : state.playback.status === 'paused'
        ? `⏸️ ${toSmallCaps('Paused')}`
        : state.playback.status === 'stopped'
          ? `⏹️ ${toSmallCaps('Stopped')}`
          : `💤 ${toSmallCaps('Idle')}`;
  const liveLabel = state.liveSession.active
    ? `${toSmallCaps('Connected')} (${escapeHtml(state.liveSession.groupIdentifier)})`
    : toSmallCaps('Not Joined');

  const queuePos = track ? `1 / ${1 + state.playback.queue.length}` : `0 / ${state.playback.queue.length}`;
  const bar = track
    ? renderProgressBar(state.playback.positionSec, track.durationSec)
    : '━━━━━━━━━━━━━━━━━';

  const text = track
    ? [
        `🎧 <b>${toSmallCaps('NOW PLAYING')}</b>`,
        DIVIDER,
        '',
        `<blockquote>🎵 <b>${toSmallCaps('SONG')}:</b> ${escapeHtml(track.title)}\n👤 <b>${toSmallCaps('ARTIST')}:</b> ${escapeHtml(track.artist)}\n⏱️ <b>${toSmallCaps('DURATION')}:</b> <code>${formatDuration(state.playback.positionSec)} / ${formatDuration(track.durationSec)}</code>\n🔊 <b>${toSmallCaps('VOLUME')}:</b> <code>${volLabel}</code>\n▶️ <b>${toSmallCaps('STATUS')}:</b> ${statusLabel}\n🎤 <b>${toSmallCaps('LIVE')}:</b> ${liveLabel}\n📚 <b>${toSmallCaps('QUEUE')}:</b> ${queuePos} · ${toSmallCaps('REPEAT')}: ${state.playback.repeatMode.toUpperCase()}</blockquote>`,
        '',
        `<code>${bar}</code>`,
      ].join('\n')
    : [
        `🎧 <b>${toSmallCaps('MUSIC PLAYER')}</b>`,
        DIVIDER,
        '',
        `<blockquote>💤 <b>${toSmallCaps('STATUS')}:</b> ${toSmallCaps('No active track')}\n🎤 <b>${toSmallCaps('LIVE VC')}:</b> ${liveLabel}\n🔊 <b>${toSmallCaps('VOLUME')}:</b> <code>${volLabel}</code></blockquote>`,
        '',
        `🎵 <b>${toSmallCaps('Send /play <song or link> or tap Play Music below.')}</b>`,
      ].join('\n');

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
  const displayVol = state.playback.muted ? `🔇 ${toSmallCaps('Muted')}` : `🔊 ${state.playback.volume}%`;
  const text = [
    `🎚️ <b>${toSmallCaps('VOLUME CONTROL')}</b>`,
    DIVIDER,
    '',
    `<blockquote>🔊 <b>${toSmallCaps('CURRENT GAIN')}:</b> <code>&lt;  ${displayVol}  &gt;</code>\n📍 <b>${toSmallCaps('PROFILE')}:</b> ${escapeHtml(state.liveSession.active ? state.liveSession.groupIdentifier : 'Global Default')}\n⚡ <b>${toSmallCaps('RANGE')}:</b> 10% – 200% (FFmpeg Real-Time)</blockquote>`,
  ].join('\n');

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
  const text = live.active
    ? [
        `🎤 <b>${toSmallCaps('LIVE CONNECTED')}</b>`,
        DIVIDER,
        '',
        `<blockquote>✅ <b>${toSmallCaps('ACCOUNT')}:</b> ${escapeHtml(acct.displayName)} (${escapeHtml(acct.username)})\n🎧 <b>${toSmallCaps('VOICE CHAT')}:</b> 🟢 ${toSmallCaps('Active')}\n📍 <b>${toSmallCaps('GROUP')}:</b> ${escapeHtml(live.groupTitle)} (${escapeHtml(live.groupIdentifier)})\n🎵 <b>${toSmallCaps('PLAYER')}:</b> ${state.playback.currentTrack ? toSmallCaps('Streaming') : toSmallCaps('Ready')}\n🔊 <b>${toSmallCaps('AUDIO')}:</b> <code>${state.playback.muted ? 'Muted' : `${state.playback.volume}%`}</code>\n⚡ <b>${toSmallCaps('CONNECTION')}:</b> ${live.connectionQuality} (${live.activeStreamsCount}/${live.maxConcurrentStreams})</blockquote>`,
      ].join('\n')
    : [
        `🎤 <b>${toSmallCaps('LIVE CONTROL PANEL')}</b>`,
        DIVIDER,
        '',
        `<blockquote>👤 <b>${toSmallCaps('ACCOUNT')}:</b> ${acct.status.toUpperCase()} (${escapeHtml(acct.username)})\n🎧 <b>${toSmallCaps('VOICE CHAT')}:</b> ⚪ ${toSmallCaps('Not Connected')}</blockquote>`,
        '',
        `👉 <b>${toSmallCaps('Send /joinlive https://t.me/group_name/123 or tap Join Live.')}</b>`,
      ].join('\n');

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
  const text = [
    `👤 <b>${toSmallCaps('PERSONAL ACCOUNT CONTROL')}</b>`,
    DIVIDER,
    '',
    `<blockquote>📛 <b>${toSmallCaps('NAME')}:</b> ${escapeHtml(a.displayName)}\n🔗 <b>${toSmallCaps('USERNAME')}:</b> ${escapeHtml(a.username)}\n📱 <b>${toSmallCaps('PHONE')}:</b> <code>${escapeHtml(a.phoneMasked)}</code>\n⚡ <b>${toSmallCaps('MTPROTO')}:</b> ${a.status.toUpperCase()} (${a.online ? '🟢 Online' : '🔴 Offline'})\n🎤 <b>${toSmallCaps('ACTIVE VC')}:</b> ${state.liveSession.active ? escapeHtml(state.liveSession.groupIdentifier) : toSmallCaps('None')}\n🔐 <b>${toSmallCaps('SESSION VAULT')}:</b> ${a.sessionEncrypted ? 'AES-256-GCM' : 'Not Configured'}</blockquote>`,
  ].join('\n');

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
  const bd = formatBangladeshDateTime();
  const blockedCount = state.users.filter((u) => u.banned).length;
  const text = [
    `👑 <b>${toSmallCaps('ADMIN CONTROL PANEL')}</b>`,
    DIVIDER,
    '',
    `<blockquote>🤖 <b>${toSmallCaps('BOT STATUS')}:</b> ${state.maintenanceMode ? '🔴 OFF (Maintenance)' : '🟢 ONLINE'}\n👥 <b>${toSmallCaps('USERS')}:</b> <code>${s.totalUsers}</code> (✅ ${s.totalUsers - blockedCount} · 🚫 ${blockedCount})\n💬 <b>${toSmallCaps('GROUPS')}:</b> <code>${s.totalGroups}</code>\n🎵 <b>${toSmallCaps('TOTAL PLAYS')}:</b> <code>${s.totalMusicPlayed}</code>\n🖥️ <b>${toSmallCaps('SERVER CPU/RAM')}:</b> <code>${s.cpuPercent}% / ${s.ramPercent}%</code>\n⚡ <b>${toSmallCaps('WORKER')}:</b> ${s.backendOnline ? `🟢 Online (${s.backendLatencyMs}ms)` : '🔴 Offline'}\n🕒 <b>${toSmallCaps('BD TIME (12H)')}:</b> ${bd.timeStr}</blockquote>`,
    '',
    `🔐 <b>${toSmallCaps('SELECT AN ADMIN ACTION')}:</b>`,
  ].join('\n');

  const inlineKeyboard: BotInlineButton[][] = [
    [
      {
        text: toSmallCaps(state.maintenanceMode ? '🟢 Turn Bot ON' : '🔴 Turn Bot OFF (Maint.)'),
        callbackData: 'owner:toggle_maintenance',
        style: state.maintenanceMode ? 'success' : 'danger',
      },
      { text: toSmallCaps('📊 System Status'), callbackData: 'cmd:owner', style: 'primary' },
    ],
    [
      { text: toSmallCaps('👥 Users & Blocklist'), callbackData: 'admin:users:0', style: 'primary' },
      { text: toSmallCaps('📢 Broadcast'), callbackData: 'admin:broadcast_prompt', style: 'success' },
    ],
    [
      { text: toSmallCaps('🔄 Restart Worker'), callbackData: 'owner:restart_backend', style: 'primary' },
      { text: toSmallCaps('👤 Account Control'), callbackData: 'cmd:account', style: 'primary' },
    ],
    [{ text: toSmallCaps('🔙 Main Menu'), callbackData: 'cmd:start', style: 'primary' }],
  ];

  return { text, inlineKeyboard };
}

export function buildAdminUsersMessage(state: BotSystemState, page = 0): { text: string; inlineKeyboard: BotInlineButton[][] } {
  const perPage = 5;
  const totalPages = Math.max(1, Math.ceil(state.users.length / perPage));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const slice = state.users.slice(safePage * perPage, safePage * perPage + perPage);

  const lines = slice.map((u) => {
    const bd = formatBangladeshDateTime(u.joinedAt);
    const badge = u.role === 'owner' ? '👑' : u.banned ? '🚫' : '✅';
    return `${badge} <b>${escapeHtml(u.name)}</b> (${escapeHtml(u.username)})\n   🪪 <code>${u.chatId}</code> · 🎵 ${u.requestsCount} · 🕒 ${bd.timeStr}`;
  });

  const text = [
    `👥 <b>${toSmallCaps('USER MANAGEMENT')}</b> (${safePage + 1}/${totalPages})`,
    DIVIDER,
    '',
    `<blockquote>${lines.join('\n\n') || toSmallCaps('No registered users yet.')}</blockquote>`,
    '',
    `💡 <b>${toSmallCaps('Tap any user below to Block / Unblock or inspect status:')}</b>`,
  ].join('\n');

  const rows: BotInlineButton[][] = slice.map((u) => [
    {
      text: `${u.banned ? '🚫' : '✅'} ${u.name} (${u.chatId})`,
      callbackData: `admin:user:${u.id}:${safePage}`,
      style: u.banned ? 'danger' : 'primary',
    },
  ]);

  const navRow: BotInlineButton[] = [];
  if (safePage > 0) {
    navRow.push({ text: '⬅️ Prev', callbackData: `admin:users:${safePage - 1}`, style: 'primary' });
  }
  if (safePage < totalPages - 1) {
    navRow.push({ text: 'Next ➡️', callbackData: `admin:users:${safePage + 1}`, style: 'primary' });
  }
  if (navRow.length > 0) rows.push(navRow);
  rows.push([{ text: toSmallCaps('🔙 Admin Panel'), callbackData: 'cmd:owner', style: 'primary' }]);

  return { text, inlineKeyboard: rows };
}

export function buildHelpMessage(): { text: string; inlineKeyboard: BotInlineButton[][] } {
  const text = [
    `📚 <b>${toSmallCaps('COMMAND REFERENCE')}</b>`,
    DIVIDER,
    '',
    `<blockquote>🎵 <b>${toSmallCaps('MUSIC & PLAYBACK')}:</b>\n/start · /search &lt;song&gt; · /play &lt;song|url&gt;\n/pause · /resume · /skip · /stop · /queue · /nowplaying\n/volume &lt;10-200&gt; · /mute · /unmute\n\n🎤 <b>${toSmallCaps('LIVE & ACCOUNT')}:</b>\n/joinlive &lt;t.me link&gt; · /leavelive · /live · /autojoin\n/account · /connect · /disconnect · /reconnect</blockquote>`,
  ].join('\n');

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
  const welcome = buildWelcomeMessage({ userId: 100001, userName: 'Owner Admin', isAdmin: true });
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
      { id: 'u-1', chatId: 100001, name: 'Owner Admin', username: '@owner_admin', role: 'owner', requestsCount: 342, banned: false, joinedAt: now, lastSeenAt: now },
      { id: 'u-2', chatId: 100002, name: 'Rafi Ahmed', username: '@rafi_sound', role: 'member', requestsCount: 129, banned: false, joinedAt: now, lastSeenAt: now },
      { id: 'u-3', chatId: 100003, name: 'Nadia Karim', username: '@nadia_k', role: 'member', requestsCount: 47, banned: false, joinedAt: now, lastSeenAt: now },
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

export function simulateNewUserJoin(
  prevState: BotSystemState,
  candidate?: { chatId?: number; name?: string; username?: string; joinedAt?: string },
): BotSystemState {
  const state = cloneState(prevState);
  const nextNum = state.users.length + 1;
  const chatId = candidate?.chatId ?? 6743390000 + nextNum;
  const name = candidate?.name?.trim() || `Tanvir Hasan ${nextNum}`;
  const username = candidate?.username?.trim() || `@tanvir_bd_${nextNum}`;
  const joinedAt = candidate?.joinedAt || new Date().toISOString();

  state.users.unshift({
    id: `u-${Date.now()}`,
    chatId,
    name,
    username,
    role: 'member',
    requestsCount: 0,
    banned: false,
    joinedAt,
    lastSeenAt: joinedAt,
  });
  state.stats.totalUsers += 1;

  const alert = buildNewUserAdminAlert({
    userId: chatId,
    chatId,
    name,
    username,
    joinedAt,
    totalUsers: state.stats.totalUsers,
  });

  state.messages.push(
    makeMessage('bot', alert.text, {
      inlineKeyboard: alert.inlineKeyboard,
      kind: 'admin_alert',
      effectBadge: '🆕 Admin Alert (BD 12h)',
      photoBadge: '🖼️ User Profile Photo Attached',
    }),
  );
  return state;
}

/**
 * Pure state-machine dispatcher for Telegram commands and inline callback actions.
 * Drives both the live Express webhook simulator and the interactive Studio UI.
 */
export function processBotInput(
  prevState: BotSystemState,
  rawInput: string,
  options: { isCallback?: boolean; senderUsername?: string; senderRole?: 'owner' | 'member' } = {},
): BotSystemState {
  const state = cloneState(prevState);
  const input = rawInput.trim();
  if (!input) return state;

  const isCallback = Boolean(options.isCallback);
  const sender = options.senderUsername || (options.senderRole === 'member' ? '@nadia_k' : '@owner_admin');
  const actor = state.users.find((u) => u.username.toLowerCase() === sender.toLowerCase());
  const isAdmin =
    options.senderRole === 'owner'
      ? true
      : options.senderRole === 'member'
        ? false
        : actor
          ? actor.role === 'owner' || actor.role === 'admin'
          : sender === '@owner_admin';
  const actorChatId = actor?.chatId ?? (isAdmin ? 100001 : 100003);
  const actorName = actor?.name ?? (isAdmin ? 'Owner Admin' : 'Nadia Karim');

  if (!isCallback) {
    state.messages.push(makeMessage('user', input));
  }

  // Blocked user enforcement (never blocks owner)
  if (!isAdmin && actor?.banned) {
    state.messages.push(
      makeMessage(
        'bot',
        [
          `🚫 <b>${toSmallCaps('ACCESS RESTRICTED')}</b>`,
          DIVIDER,
          '',
          `<blockquote>⛔ <b>${toSmallCaps('STATUS')}:</b> ${toSmallCaps('Blocked By Admin')}\n🪪 <b>${toSmallCaps('USER ID')}:</b> <code>${actorChatId}</code></blockquote>`,
          '',
          `<i>${toSmallCaps('You are blocked from using this bot. Contact the Bot Admin.')}</i>`,
        ].join('\n'),
        { kind: 'error', effectBadge: '👎 Alert Effect' },
      ),
    );
    return state;
  }

  // Strict admin-only authorization check (non-admin cannot enter Admin Panel or run admin actions)
  const adminCallbackPrefixes = ['cmd:owner', 'owner:', 'admin:'];
  const adminSlashCommands = ['/admin', '/owner', '/stats', '/status', '/maintenance', '/broadcast', '/users', '/block', '/unblock', '/boton', '/botoff', '/reload', '/restart'];
  const lowerCmd = input.split(/\s+/)[0].toLowerCase().split('@')[0];
  if (
    !isAdmin &&
    ((isCallback && adminCallbackPrefixes.some((p) => input.startsWith(p))) ||
      (!isCallback && adminSlashCommands.includes(lowerCmd)))
  ) {
    state.messages.push(
      makeMessage(
        'bot',
        [
          `⛔ <b>${toSmallCaps('ACCESS DENIED')}</b>`,
          DIVIDER,
          '',
          `<blockquote>🔒 <b>${toSmallCaps('ADMIN ONLY AREA')}</b>\n${toSmallCaps('Only the Bot Admin can view or enter the Admin Panel.')}</blockquote>`,
        ].join('\n'),
        { kind: 'error', effectBadge: '👎 Alert Effect' },
      ),
    );
    return state;
  }

  // Maintenance gate for regular users (including /start — displays pretty Maintenance card!)
  if (state.maintenanceMode && !isAdmin) {
    const maint = buildMaintenanceMessage({ userId: actorChatId, userName: actorName });
    state.messages.push(
      makeMessage('bot', maint.text, {
        inlineKeyboard: maint.inlineKeyboard,
        kind: 'maintenance',
        effectBadge: '🛠️ Maintenance',
      }),
    );
    return state;
  }

  // Handle inline callback routes
  if (isCallback) {
    if (input === 'cmd:start') {
      const w = buildWelcomeMessage({
        userId: actorChatId,
        userName: actorName,
        isAdmin,
        liveActive: state.liveSession.active,
        volume: state.playback.volume,
        muted: state.playback.muted,
        maintenanceMode: state.maintenanceMode,
      });
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

    if (input.startsWith('admin:users:')) {
      const page = Number(input.split(':')[2] || 0);
      const uList = buildAdminUsersMessage(state, page);
      state.messages.push(
        makeMessage('bot', uList.text, {
          inlineKeyboard: uList.inlineKeyboard,
          kind: 'owner',
          effectBadge: '👥 Users List',
        }),
      );
      return state;
    }

    if (input.startsWith('admin:user:') || input.startsWith('admin:block:') || input.startsWith('admin:unblock:')) {
      const parts = input.split(':');
      const op = parts[1];
      const targetKey = parts[2];
      const page = Number(parts[3] || 0);
      const target = state.users.find((u) => u.id === targetKey || String(u.chatId) === targetKey);
      if (!target) {
        state.messages.push(makeMessage('bot', `❌ ${toSmallCaps('User not found.')}`, { kind: 'error' }));
        return state;
      }
      if (op === 'block' && target.role !== 'owner') target.banned = true;
      if (op === 'unblock') target.banned = false;
      const bdJoined = formatBangladeshDateTime(target.joinedAt);
      const bdSeen = formatBangladeshDateTime(target.lastSeenAt);
      const card = [
        `👤 <b>${toSmallCaps('USER PROFILE & STATUS')}</b>`,
        DIVIDER,
        '',
        `<blockquote>📛 <b>${toSmallCaps('NAME')}:</b> ${escapeHtml(target.name)}\n🔗 <b>${toSmallCaps('USERNAME')}:</b> ${escapeHtml(target.username)}\n🪪 <b>${toSmallCaps('CHAT ID')}:</b> <code>${target.chatId}</code>\n🚦 <b>${toSmallCaps('STATUS')}:</b> ${target.banned ? '🚫 BLOCKED' : '✅ ACTIVE'}\n🎵 <b>${toSmallCaps('PLAYS')}:</b> ${target.requestsCount}\n📅 <b>${toSmallCaps('JOINED (BD)')}:</b> ${bdJoined.fullStr}\n🕒 <b>${toSmallCaps('LAST SEEN (BD)')}:</b> ${bdSeen.fullStr}</blockquote>`,
      ].join('\n');
      const kb: BotInlineButton[][] = [];
      if (target.role !== 'owner') {
        kb.push([
          target.banned
            ? { text: toSmallCaps('✅ Unblock User'), callbackData: `admin:unblock:${target.id}:${page}`, style: 'success' }
            : { text: toSmallCaps('🚫 Block User'), callbackData: `admin:block:${target.id}:${page}`, style: 'danger' },
        ]);
      }
      kb.push([
        { text: toSmallCaps('👥 Users List'), callbackData: `admin:users:${page}`, style: 'primary' },
        { text: toSmallCaps('👑 Admin Panel'), callbackData: 'cmd:owner', style: 'primary' },
      ]);
      state.messages.push(
        makeMessage('bot', card, {
          inlineKeyboard: kb,
          kind: 'owner',
          effectBadge: target.banned ? '🚫 Blocked' : '✅ Active',
        }),
      );
      return state;
    }

    if (input === 'admin:broadcast_prompt') {
      const text = [
        `📢 <b>${toSmallCaps('BROADCAST ANNOUNCEMENT')}</b>`,
        DIVIDER,
        '',
        `<blockquote>📨 <b>${toSmallCaps('ACTIVE RECIPIENTS')}:</b> <code>${state.stats.totalUsers}</code>\n💡 <b>${toSmallCaps('USAGE')}:</b> <code>/broadcast Your message here</code></blockquote>`,
      ].join('\n');
      state.messages.push(
        makeMessage('bot', text, {
          kind: 'owner',
          effectBadge: '📢 Broadcast',
          inlineKeyboard: [[{ text: toSmallCaps('🔙 Admin Panel'), callbackData: 'cmd:owner', style: 'primary' }]],
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
      const guide = [
        `🎵 <b>${toSmallCaps('HOW TO SELECT & PLAY MUSIC')}</b>`,
        DIVIDER,
        '',
        `<blockquote>1️⃣ <b>${toSmallCaps('SEARCH & PICK')}:</b> <code>/search Kesariya</code>\n2️⃣ <b>${toSmallCaps('INSTANT PLAY')}:</b> <code>/play Midnight Signal</code>\n3️⃣ <b>${toSmallCaps('LINK / AUDIO')}:</b> ${toSmallCaps('Send YouTube link, SoundCloud, or MP3 file directly.')}</blockquote>`,
        '',
        `🔐 <b>${toSmallCaps('SELECT AN OPTION BELOW')}:</b>`,
      ].join('\n');
      state.messages.push(
        makeMessage('bot', guide, {
          kind: 'info',
          effectBadge: '🔥 Fire Effect',
          animationFrames: makePlayDeckFrames(guide),
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
        senderRole: options.senderRole,
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
      const w = buildWelcomeMessage({
        userId: actorChatId,
        userName: actorName,
        isAdmin,
        liveActive: state.liveSession.active,
        volume: state.playback.volume,
        muted: state.playback.muted,
        maintenanceMode: state.maintenanceMode,
      });
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
          animationFrames: makePlayDeckFrames(player.text),
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

    case '/admin':
    case '/stats':
    case '/status':
    case '/owner':
      return processBotInput(state, 'cmd:owner', { isCallback: true, senderUsername: sender, senderRole: options.senderRole });

    case '/maintenance': {
      if (arg.toLowerCase() === 'on') state.maintenanceMode = false;
      if (arg.toLowerCase() === 'off') state.maintenanceMode = true;
      return processBotInput(state, 'owner:toggle_maintenance', { isCallback: true, senderUsername: sender, senderRole: options.senderRole });
    }

    case '/botoff': {
      state.maintenanceMode = false;
      return processBotInput(state, 'owner:toggle_maintenance', { isCallback: true, senderUsername: sender, senderRole: options.senderRole });
    }

    case '/boton': {
      state.maintenanceMode = true;
      return processBotInput(state, 'owner:toggle_maintenance', { isCallback: true, senderUsername: sender, senderRole: options.senderRole });
    }

    case '/reload':
    case '/restart': {
      return processBotInput(state, 'owner:restart_backend', { isCallback: true, senderUsername: sender, senderRole: options.senderRole });
    }

    case '/broadcast': {
      if (!arg) {
        return processBotInput(state, 'admin:broadcast_prompt', { isCallback: true, senderUsername: sender, senderRole: options.senderRole });
      }
      state.messages.push(
        makeMessage(
          'bot',
          [
            `📢 <b>${toSmallCaps('BROADCAST DISPATCHED')}</b>`,
            DIVIDER,
            '',
            `<blockquote>✅ <b>${toSmallCaps('DELIVERED TO')}:</b> <code>${state.stats.totalUsers}</code> ${toSmallCaps('users')} · <code>${state.stats.totalGroups}</code> ${toSmallCaps('groups')}\n📝 <b>${toSmallCaps('MESSAGE')}:</b> ${escapeHtml(arg)}</blockquote>`,
          ].join('\n'),
          { kind: 'owner', effectBadge: '🎉 Confetti Effect' },
        ),
      );
      return state;
    }

    case '/block':
    case '/unblock': {
      const shouldBlock = cmd === '/block';
      const target = state.users.find((u) => String(u.chatId) === arg || u.username.toLowerCase() === arg.toLowerCase());
      if (!target) {
        state.messages.push(makeMessage('bot', `❌ ${toSmallCaps(`Usage: ${cmd} <chat_id or @username>`)}`, { kind: 'error' }));
        return state;
      }
      return processBotInput(state, `admin:${shouldBlock ? 'block' : 'unblock'}:${target.id}:0`, {
        isCallback: true,
        senderUsername: sender,
        senderRole: options.senderRole,
      });
    }

    case '/users': {
      return processBotInput(state, 'admin:users:0', { isCallback: true, senderUsername: sender, senderRole: options.senderRole });
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
