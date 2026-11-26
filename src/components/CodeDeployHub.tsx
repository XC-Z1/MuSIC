import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, FileCode2, Globe, ShieldCheck } from 'lucide-react';

export interface ProjectFileItem {
  path: string;
  content: string;
  size: number;
}

interface CodeDeployHubProps {
  files: ProjectFileItem[];
  loading: boolean;
}

type FilterCategory = 'all' | 'vercel' | 'php' | 'python' | 'database' | 'guide';

function categorizeFile(filePath: string): FilterCategory {
  if (filePath.startsWith('vercel/')) return 'vercel';
  if (filePath.startsWith('backend/')) return 'python';
  if (filePath.startsWith('database/')) return 'database';
  if (filePath.endsWith('README.md')) return 'guide';
  return 'php';
}

export const CodeDeployHub: React.FC<CodeDeployHubProps> = ({ files, loading }) => {
  const [filter, setFilter] = useState<FilterCategory>('all');
  const [selectedPath, setSelectedPath] = useState<string>('vercel/api/webhook.ts');
  const [copied, setCopied] = useState(false);

  const [webhookUrl, setWebhookUrl] = useState('https://music-eosin-ten-42.vercel.app/api/webhook');
  const [botToken, setBotToken] = useState('');
  const [secretToken, setSecretToken] = useState('');
  const [webhookStatus, setWebhookStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [webhookBusy, setWebhookBusy] = useState(false);

  const handleSetWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!botToken.trim() || !webhookUrl.trim()) {
      setWebhookStatus({ ok: false, message: 'Enter both your Bot Token and HTTPS Webhook URL.' });
      return;
    }
    setWebhookBusy(true);
    setWebhookStatus(null);
    try {
      const res = await fetch('/api/telegram/set-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: botToken.trim(),
          webhookUrl: webhookUrl.trim(),
          secretToken: secretToken.trim(),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; description?: string; error?: string };
      setWebhookStatus({
        ok: Boolean(json.ok),
        message: json.description || json.error || (json.ok ? 'Webhook registered cleanly.' : 'Failed to register webhook.'),
      });
    } catch {
      setWebhookStatus({ ok: false, message: 'Network error contacting Telegram Bot API.' });
    } finally {
      setWebhookBusy(false);
    }
  };

  const handleCheckWebhook = async () => {
    if (!botToken.trim()) {
      setWebhookStatus({ ok: false, message: 'Enter your Bot Token first to inspect getWebhookInfo.' });
      return;
    }
    setWebhookBusy(true);
    setWebhookStatus(null);
    try {
      const res = await fetch('/api/telegram/webhook-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: botToken.trim() }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        description?: string;
        result?: { url?: string; pending_update_count?: number; last_error_message?: string };
      };
      if (json.ok && json.result) {
        const r = json.result;
        const summary = [
          `URL: ${r.url || '(not set)'}`,
          `Pending Updates: ${r.pending_update_count ?? 0}`,
          r.last_error_message ? `Last Error: ${r.last_error_message}` : 'Last Error: None',
        ].join(' · ');
        setWebhookStatus({ ok: !r.last_error_message && Boolean(r.url), message: summary });
      } else {
        setWebhookStatus({ ok: false, message: json.description || json.error || 'Could not read webhook info.' });
      }
    } catch {
      setWebhookStatus({ ok: false, message: 'Network error contacting Telegram Bot API.' });
    } finally {
      setWebhookBusy(false);
    }
  };

  const filteredFiles = useMemo(() => {
    if (filter === 'all') return files;
    return files.filter((f) => categorizeFile(f.path) === filter);
  }, [files, filter]);

  const activeFile = useMemo(() => {
    return (
      filteredFiles.find((f) => f.path === selectedPath) ||
      filteredFiles[0] ||
      files[0] ||
      null
    );
  }, [filteredFiles, files, selectedPath]);

  const handleCopy = async () => {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-6">
      {/* Architecture & Security Advisory */}
      <section aria-label="Deployment Architecture" className="rounded-xl border border-white/10 bg-[#111827] p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sky-400">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-100">
                Mobile Zero-VPS Setup: Vercel Bot Webhook + Free Docker Audio Worker
              </h2>
            </div>
            <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
              Vercel hosts your Bot Webhook, colored buttons, animations, and volume commands 24/7. Because Vercel serverless functions pause after 30s and cannot hold continuous Voice Chat WebRTC streams, deploy <span className="font-mono text-slate-200">premium-music-bot/backend/</span> free on Hugging Face Spaces (Docker) or Koyeb/Render—then open <span className="font-mono text-slate-200">/setup</span> on your phone browser to sign in with Phone + OTP (no terminal needed). Keep API credentials and tokens exclusively in Environment Variables.
            </p>
          </div>
          <a
            href="/api/export-zip"
            download="premium-music-bot.zip"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download Complete ZIP ({files.length} files)
          </a>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <div className="rounded-lg border border-white/10 bg-[#0B1120] p-3 space-y-1">
            <p className="text-xs font-semibold text-slate-200">1. Free Docker Worker (No VPS)</p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Upload <span className="font-mono text-slate-300">premium-music-bot/backend</span> to a free Docker Space (Hugging Face Spaces / Koyeb) and add <span className="font-mono text-slate-300">TELEGRAM_API_ID</span>, <span className="font-mono text-slate-300">TELEGRAM_API_HASH</span>, <span className="font-mono text-slate-300">TELEGRAM_BOT_TOKEN</span>, and <span className="font-mono text-slate-300">AUDIO_BACKEND_API_SECRET</span>.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#0B1120] p-3 space-y-1">
            <p className="text-xs font-semibold text-slate-200">2. Phone Chrome OTP Login</p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Open <span className="font-mono text-slate-300">https://your-worker-url/setup</span> in Chrome on your phone, enter your Secret, Phone Number, and Telegram OTP to connect your personal account live.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#0B1120] p-3 space-y-1">
            <p className="text-xs font-semibold text-slate-200">3. Link Vercel &amp; Redeploy</p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Add <span className="font-mono text-slate-300">AUDIO_BACKEND_URL</span>, <span className="font-mono text-slate-300">AUDIO_BACKEND_API_SECRET</span>, <span className="font-mono text-slate-300">TELEGRAM_API_ID</span>, and <span className="font-mono text-slate-300">TELEGRAM_API_HASH</span> to Vercel Env Vars, then Redeploy.
            </p>
          </div>
        </div>
      </section>

      {/* Telegram Webhook Registration & Diagnostics */}
      <section aria-label="Telegram Webhook Registration" className="rounded-xl border border-white/10 bg-[#111827] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-sky-400" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-100">
            Vercel Webhook Registration &amp; Live Diagnostics
          </h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Deploy the root project (which now includes <span className="font-mono text-slate-200">/api/webhook.ts</span> and <span className="font-mono text-slate-200">/vercel.json</span>) to Vercel, set <span className="font-mono text-slate-200">TELEGRAM_BOT_TOKEN</span> in Vercel Environment Variables, then register your webhook below. Tokens are forwarded directly to Telegram&apos;s API and are never saved.
        </p>

        <form onSubmit={handleSetWebhook} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5 space-y-1">
            <label htmlFor="webhook-url-input" className="block text-xs text-slate-400">
              Vercel Webhook URL (HTTPS)
            </label>
            <input
              id="webhook-url-input"
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://music-eosin-ten-42.vercel.app/api/webhook"
              className="w-full rounded-lg border border-white/10 bg-[#0B1120] px-3 py-2 font-mono text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </div>
          <div className="md:col-span-4 space-y-1">
            <label htmlFor="webhook-token-input" className="block text-xs text-slate-400">
              Bot Token (from @BotFather)
            </label>
            <input
              id="webhook-token-input"
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="123456789:AA..."
              className="w-full rounded-lg border border-white/10 bg-[#0B1120] px-3 py-2 font-mono text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </div>
          <div className="md:col-span-3 space-y-1">
            <label htmlFor="webhook-secret-input" className="block text-xs text-slate-400">
              Webhook Secret (Optional)
            </label>
            <input
              id="webhook-secret-input"
              type="password"
              value={secretToken}
              onChange={(e) => setSecretToken(e.target.value)}
              placeholder="Match TELEGRAM_WEBHOOK_SECRET"
              className="w-full rounded-lg border border-white/10 bg-[#0B1120] px-3 py-2 font-mono text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </div>
          <div className="md:col-span-12 flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="submit"
              disabled={webhookBusy}
              className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              {webhookBusy ? 'Working...' : 'Set Webhook'}
            </button>
            <button
              type="button"
              disabled={webhookBusy}
              onClick={handleCheckWebhook}
              className="rounded-lg border border-white/10 bg-[#161F33] px-4 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              Check Webhook Status
            </button>
            {webhookStatus && (
              <p className={`text-xs font-mono ${webhookStatus.ok ? 'text-emerald-400' : 'text-amber-400'}`}>
                {webhookStatus.message}
              </p>
            )}
          </div>
        </form>
      </section>

      {/* Interactive File Explorer */}
      <section aria-label="Code Explorer" className="rounded-xl border border-white/10 bg-[#111827] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#161F33] px-4 py-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0B1120]">
            {(
              [
                { id: 'all', label: 'All Files' },
                { id: 'vercel', label: 'Vercel' },
                { id: 'php', label: 'PHP cPanel' },
                { id: 'python', label: 'Python MTProto' },
                { id: 'database', label: 'MySQL' },
                { id: 'guide', label: 'Bangla Guide' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filter === tab.id
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeFile && (
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#0B1120] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy File'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[540px]">
          {/* File Tree Sidebar */}
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0F172A] max-h-[320px] lg:max-h-[600px] overflow-y-auto p-2 space-y-0.5">
            {loading ? (
              <p className="p-4 text-xs text-slate-400">Loading project files...</p>
            ) : (
              filteredFiles.map((file) => {
                const isSelected = activeFile?.path === file.path;
                return (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setSelectedPath(file.path)}
                    className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-sky-600/20 text-sky-300 border border-sky-500/30'
                        : 'text-slate-300 hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <FileCode2 className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
                      <span className="font-mono truncate">{file.path}</span>
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                      {(file.size / 1024).toFixed(1)}KB
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Code Viewer */}
          <div className="lg:col-span-8 bg-[#0B1120] overflow-auto max-h-[600px] p-5">
            {activeFile ? (
              <div>
                <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2 text-xs text-slate-400">
                  <span className="font-mono text-slate-200">{activeFile.path}</span>
                  <span className="font-mono tabular-nums">{activeFile.content.split('\n').length} lines</span>
                </div>
                <pre className="font-mono text-xs leading-relaxed text-slate-200 whitespace-pre overflow-x-auto">
                  <code>{activeFile.content}</code>
                </pre>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Select a file from the left tree to inspect its complete source code.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
