import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, FileCode2, ShieldCheck } from 'lucide-react';

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
      <section aria-label="Deployment Architecture" className="rounded-xl border border-white/10 bg-[#111827] p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sky-400">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-100">
                Production Split Architecture: Vercel / cPanel Webhook + VPS MTProto Audio Worker
              </h2>
            </div>
            <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
              Vercel Serverless and cPanel PHP host the animated Telegram Bot Webhook, Inline Keyboards, and Owner API. Because serverless functions terminate after 30s and cPanel blocks persistent MTProto/WebRTC audio streams, the Personal Account MTProto client (Pyrogram + PyTgCalls + FFmpeg) runs on a VPS and receives HMAC-SHA256 signed commands from Vercel or PHP. Always revoke any token pasted into chat and store secrets exclusively in Environment Variables.
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
