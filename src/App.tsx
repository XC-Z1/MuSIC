import React, { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { createInitialBotState, type BotSystemState } from './lib/botEngine';
import { TelegramSimulator } from './components/TelegramSimulator';
import { LiveControlDeck } from './components/LiveControlDeck';
import { OwnerDashboard } from './components/OwnerDashboard';
import { CodeDeployHub, type ProjectFileItem } from './components/CodeDeployHub';

type ActiveTab = 'studio' | 'live' | 'owner' | 'code';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('studio');
  const [botState, setBotState] = useState<BotSystemState>(() => createInitialBotState());
  const [files, setFiles] = useState<ProjectFileItem[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadState = useCallback(async () => {
    try {
      const res = await fetch('/api/bot/state');
      if (res.ok) {
        const data = (await res.json()) as BotSystemState;
        setBotState(data);
      }
    } catch {
      // Keep client fallback state if API is momentarily unavailable
    }
  }, []);

  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch('/api/files');
      if (res.ok) {
        const json = (await res.json()) as { ok: boolean; files: ProjectFileItem[] };
        if (json.ok) {
          setFiles(json.files);
        }
      }
    } finally {
      setFilesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
    loadFiles();
  }, [loadState, loadFiles]);

  // Advance playback progress smoothly when playing
  useEffect(() => {
    if (botState.playback.status !== 'playing') return;
    const interval = window.setInterval(async () => {
      try {
        const res = await fetch('/api/bot/tick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deltaSec: 1 }),
        });
        if (res.ok) {
          const json = (await res.json()) as { ok: boolean; state: BotSystemState };
          if (json.ok) setBotState(json.state);
        }
      } catch {
        // Ignore transient tick failures
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [botState.playback.status]);

  const handleSendCommand = async (input: string, isCallback = false) => {
    setBusy(true);
    try {
      const res = await fetch('/api/bot/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, isCallback }),
      });
      if (res.ok) {
        const json = (await res.json()) as { ok: boolean; state: BotSystemState };
        if (json.ok) setBotState(json.state);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSetVolume = async (volume: number) => {
    setBusy(true);
    try {
      const res = await fetch('/api/bot/owner-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_volume', volume }),
      });
      if (res.ok) {
        const json = (await res.json()) as { ok: boolean; state: BotSystemState };
        if (json.ok) setBotState(json.state);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleOwnerAction = async (action: string, payload: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      const res = await fetch('/api/bot/owner-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      if (res.ok) {
        const json = (await res.json()) as { ok: boolean; state: BotSystemState };
        if (json.ok) setBotState(json.state);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col">
      {/* Top Bar Contract: 3 zones (Wordmark — 4 concise links — 1 primary CTA) */}
      <header className="md:sticky md:top-0 z-30 border-b border-white/10 bg-[#0B1120]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-8 px-4 sm:px-6 py-3.5">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('studio');
            }}
            className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
          >
            TeleStream Studio
          </a>

          <nav aria-label="Primary Navigation" className="hidden md:flex items-center gap-6">
            {(
              [
                { id: 'studio', label: 'Bot Simulator' },
                { id: 'live', label: 'Live Control' },
                { id: 'owner', label: 'Owner Panel' },
                { id: 'code', label: 'Code & Deploy' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 border-b-2 ${
                  activeTab === item.id
                    ? 'border-sky-500 text-slate-100'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <a
            href="/api/export-zip"
            download="premium-music-bot.zip"
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3.5 sm:px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download Bundle
          </a>
        </div>
      </header>

      {/* Mobile Navigation Strip */}
      <nav
        aria-label="Mobile Navigation"
        className="flex md:hidden items-center gap-1.5 overflow-x-auto border-b border-white/10 bg-[#0F172A] px-4 py-2"
      >
        {(
          [
            { id: 'studio', label: 'Bot Simulator' },
            { id: 'live', label: 'Live Control' },
            { id: 'owner', label: 'Owner Panel' },
            { id: 'code', label: 'Code & Deploy' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === item.id
                ? 'bg-sky-600 text-white'
                : 'text-slate-300 hover:bg-white/5'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-6">
        {activeTab === 'studio' && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                  Telegram Music Bot & Personal Account Live Console
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  Test animated bot menus, inline keyboards, Auto Live Join links, and 10%–200% FFmpeg stream volume before deploying to Vercel and VPS.
                </p>
              </div>
              <p className="text-xs font-mono text-slate-400 tabular-nums shrink-0">
                Webhook: /api/webhook · {files.length} exportable files
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-6">
                <TelegramSimulator
                  state={botState}
                  onSendCommand={handleSendCommand}
                  onReset={() => handleOwnerAction('reset')}
                  busy={busy}
                />
              </div>
              <div className="lg:col-span-6">
                <LiveControlDeck
                  state={botState}
                  onSendCommand={handleSendCommand}
                  onSetVolume={handleSetVolume}
                  busy={busy}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'live' && (
          <div className="max-w-3xl mx-auto">
            <div className="mb-5">
              <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                Personal Account MTProto & Live Voice Chat Deck
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Control personal account connection, auto-join Telegram Voice Chats, playback transport, and FFmpeg volume.
              </p>
            </div>
            <LiveControlDeck
              state={botState}
              onSendCommand={handleSendCommand}
              onSetVolume={handleSetVolume}
              busy={busy}
            />
          </div>
        )}

        {activeTab === 'owner' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                Owner Administration & Telemetry
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Manage connected groups, user permissions, maintenance mode, broadcasts, and backend logs.
              </p>
            </div>
            <OwnerDashboard
              state={botState}
              onOwnerAction={handleOwnerAction}
              busy={busy}
            />
          </div>
        )}

        {activeTab === 'code' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                Production Source Code & Deployment Hub
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Browse or download the full Vercel Webhook, cPanel PHP 8.2+ Controller, Python MTProto + PyTgCalls Backend, MySQL Schema, and Bangla Guide.
              </p>
            </div>
            <CodeDeployHub files={files} loading={filesLoading} />
          </div>
        )}
      </main>
    </div>
  );
}
