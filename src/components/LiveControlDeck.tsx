import React, { useState } from 'react';
import {
  Disc3,
  Link2,
  Mic,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Repeat,
  SkipBack,
  SkipForward,
  Square,
  UserCheck,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatDuration, type BotSystemState } from '../lib/botEngine';

interface LiveControlDeckProps {
  state: BotSystemState;
  onSendCommand: (input: string, isCallback?: boolean) => Promise<void>;
  onSetVolume: (volume: number) => Promise<void>;
  busy: boolean;
}

export const LiveControlDeck: React.FC<LiveControlDeckProps> = ({
  state,
  onSendCommand,
  onSetVolume,
  busy,
}) => {
  const [liveLink, setLiveLink] = useState('https://t.me/dhaka_chill_vc/42');
  const [songInput, setSongInput] = useState('');
  const [linkError, setLinkError] = useState('');
  const [imgFailed, setImgFailed] = useState(false);

  const track = state.playback.currentTrack;
  const progressPct = track
    ? Math.min(100, Math.round((state.playback.positionSec / Math.max(1, track.durationSec)) * 100))
    : 0;

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = liveLink.trim();
    if (!trimmed || (!trimmed.includes('t.me/') && !trimmed.includes('telegram.me/'))) {
      setLinkError('Enter a valid https://t.me/group_name/123 voice chat link.');
      return;
    }
    setLinkError('');
    await onSendCommand(`/joinlive ${trimmed}`, false);
  };

  const handlePlaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = songInput.trim();
    if (!trimmed) return;
    setSongInput('');
    await onSendCommand(`/play ${trimmed}`, false);
  };

  return (
    <div className="space-y-5">
      {/* Personal Account & Voice Chat Status */}
      <section
        aria-label="Personal Account and Voice Chat"
        className="rounded-xl border border-white/10 bg-[#111827] p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400 shrink-0">
              <UserCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-100 truncate">
                {state.account.displayName}
              </h2>
              <p className="text-xs text-slate-400 truncate">
                {state.account.username} · {state.account.phoneMasked} ·{' '}
                <span className={state.account.status === 'connected' ? 'text-emerald-400' : 'text-rose-400'}>
                  {state.account.status === 'connected' ? 'MTProto Connected' : 'Disconnected'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onSendCommand(
                  state.account.status === 'connected' ? 'account:disconnect' : 'account:connect',
                  true,
                )
              }
              className="rounded-lg border border-white/10 bg-[#161F33] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {state.account.status === 'connected' ? 'Disconnect' : 'Connect'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onSendCommand('account:reconnect', true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Reconnect
            </button>
          </div>
        </div>

        {/* Auto Live Join Bar */}
        <form onSubmit={handleJoinSubmit} className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Auto Live Join (Group Voice Chat Link)</span>
            <span className={state.liveSession.active ? 'text-emerald-400 font-medium' : 'text-slate-400'}>
              {state.liveSession.active
                ? `Active in ${state.liveSession.groupIdentifier} (${state.liveSession.activeStreamsCount}/${state.liveSession.maxConcurrentStreams})`
                : 'No Active Voice Chat'}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <label htmlFor="live-link-input" className="sr-only">
              Telegram Voice Chat Link
            </label>
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
              <input
                id="live-link-input"
                type="text"
                value={liveLink}
                onChange={(e) => setLiveLink(e.target.value)}
                placeholder="https://t.me/example_group/123"
                className="w-full rounded-lg border border-white/10 bg-[#0B1120] pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Radio className="h-3.5 w-3.5" aria-hidden="true" />
              Join Live
            </button>
            {state.liveSession.active && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onSendCommand('/leavelive', false)}
                className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Leave Live
              </button>
            )}
          </div>
          {linkError && <p className="text-xs text-rose-400">{linkError}</p>}
        </form>
      </section>

      {/* Music Player & FFmpeg Volume Control */}
      <section
        aria-label="Live Music Player and Volume Control"
        className="rounded-xl border border-white/10 bg-[#111827] p-5"
      >
        <div className="flex items-center gap-4">
          {track && !imgFailed ? (
            <img
              src={track.artworkUrl}
              alt={`${track.title} cover artwork`}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="h-20 w-20 rounded-lg object-cover border border-white/10 shrink-0"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-white/10 bg-[#161F33] text-sky-400 shrink-0">
              <Disc3 className={`h-8 w-8 ${state.playback.status === 'playing' ? 'animate-spin' : ''}`} aria-hidden="true" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-400">
                {state.playback.status === 'playing'
                  ? 'Streaming to Voice Chat'
                  : state.playback.status === 'paused'
                    ? 'Stream Paused'
                    : 'Player Standby'}
              </p>
              <span className="font-mono text-xs text-slate-400 tabular-nums">
                Repeat: {state.playback.repeatMode.toUpperCase()}
              </span>
            </div>
            <h3 className="mt-1 text-base font-semibold text-slate-100 truncate">
              {track ? track.title : 'No Track Active'}
            </h3>
            <p className="text-xs text-slate-400 truncate">
              {track ? `${track.artist} · Requested by ${track.requestedBy}` : 'Add a track URL or search query below'}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-sky-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between font-mono text-xs text-slate-400 tabular-nums">
            <span>{track ? formatDuration(state.playback.positionSec) : '00:00'}</span>
            <span>{track ? formatDuration(track.durationSec) : '00:00'}</span>
          </div>
        </div>

        {/* Playback Transport Controls */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onSendCommand('player:prev', true)}
              aria-label="Previous track"
              className="rounded-lg border border-white/10 bg-[#161F33] p-2.5 text-slate-200 hover:bg-white/10 cursor-pointer"
            >
              <SkipBack className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onSendCommand(state.playback.status === 'playing' ? 'player:pause' : 'player:resume', true)
              }
              aria-label={state.playback.status === 'playing' ? 'Pause playback' : 'Resume playback'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-sky-500 cursor-pointer whitespace-nowrap shrink-0"
            >
              {state.playback.status === 'playing' ? (
                <>
                  <Pause className="h-4 w-4" aria-hidden="true" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" aria-hidden="true" />
                  Play
                </>
              )}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onSendCommand('player:skip', true)}
              aria-label="Skip track"
              className="rounded-lg border border-white/10 bg-[#161F33] p-2.5 text-slate-200 hover:bg-white/10 cursor-pointer"
            >
              <SkipForward className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onSendCommand('player:stop', true)}
              aria-label="Stop playback"
              className="rounded-lg border border-white/10 bg-[#161F33] p-2.5 text-slate-200 hover:bg-white/10 cursor-pointer"
            >
              <Square className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => onSendCommand('player:repeat', true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#161F33] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
            Repeat: {state.playback.repeatMode.toUpperCase()}
          </button>
        </div>

        {/* Volume 10% - 200% Control */}
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">
              FFmpeg Stream Volume (10% – 200%)
            </span>
            <span data-testid="volume-display" className="font-mono text-sm font-semibold text-sky-400 tabular-nums">
              {state.playback.muted ? 'MUTED' : `${state.playback.volume}%`}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => onSendCommand(state.playback.muted ? 'vol:unmute' : 'vol:mute', true)}
              aria-label={state.playback.muted ? 'Unmute audio' : 'Mute audio'}
              className="rounded-lg border border-white/10 bg-[#161F33] p-2 text-slate-200 hover:bg-white/10 cursor-pointer"
            >
              {state.playback.muted ? (
                <VolumeX className="h-4 w-4 text-rose-400" aria-hidden="true" />
              ) : (
                <Volume2 className="h-4 w-4 text-sky-400" aria-hidden="true" />
              )}
            </button>
            <label htmlFor="volume-slider" className="sr-only">
              Adjust stream volume percentage
            </label>
            <input
              id="volume-slider"
              type="range"
              min={10}
              max={200}
              step={5}
              value={state.playback.muted ? 10 : state.playback.volume}
              onChange={(e) => onSetVolume(Number(e.target.value))}
              className="flex-1 accent-sky-500 cursor-pointer"
            />
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {['-20', '-10', '+10', '+20'].map((step) => (
              <button
                key={step}
                type="button"
                disabled={busy}
                onClick={() => onSendCommand(`vol:${step}`, true)}
                className="rounded-lg border border-white/10 bg-[#161F33] py-1.5 font-mono text-xs text-slate-200 hover:bg-white/10 cursor-pointer"
              >
                {step}%
              </button>
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={() => onSendCommand('vol:mute', true)}
              className="rounded-lg border border-white/10 bg-[#161F33] py-1.5 text-xs text-slate-200 hover:bg-white/10 cursor-pointer"
            >
              Mute
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onSendCommand('vol:unmute', true)}
              className="rounded-lg border border-white/10 bg-[#161F33] py-1.5 text-xs text-slate-200 hover:bg-white/10 cursor-pointer"
            >
              Unmute
            </button>
          </div>
        </div>

        {/* Add Track & Queue */}
        <form onSubmit={handlePlaySubmit} className="mt-5 flex gap-2 border-t border-white/10 pt-4">
          <label htmlFor="queue-song-input" className="sr-only">
            Song name or direct audio link
          </label>
          <input
            id="queue-song-input"
            type="text"
            value={songInput}
            onChange={(e) => setSongInput(e.target.value)}
            placeholder="Song name or direct MP3/stream link..."
            className="flex-1 rounded-lg border border-white/10 bg-[#0B1120] px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
          />
          <button
            type="submit"
            disabled={busy || !songInput.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Mic className="h-3.5 w-3.5" aria-hidden="true" />
            Queue Track
          </button>
        </form>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Up Next Queue</span>
            <span className="font-mono tabular-nums">{state.playback.queue.length} queued</span>
          </div>
          {state.playback.queue.length === 0 ? (
            <p className="text-xs text-slate-500 py-2">Queue is empty.</p>
          ) : (
            <ul className="divide-y divide-white/10 border-t border-white/10">
              {state.playback.queue.map((qItem, idx) => (
                <li key={qItem.id} className="flex items-center justify-between py-2 text-xs">
                  <div className="min-w-0 pr-3">
                    <span className="font-mono text-slate-500 mr-2 tabular-nums">{idx + 1}.</span>
                    <span className="font-medium text-slate-200 truncate">{qItem.title}</span>
                    <span className="text-slate-500"> · {qItem.artist}</span>
                  </div>
                  <span className="font-mono text-slate-400 tabular-nums shrink-0">
                    {formatDuration(qItem.durationSec)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
};
