import React, { useEffect, useRef, useState } from 'react';
import { Send, RotateCcw, UserPlus, Shield } from 'lucide-react';
import type { BotMessage, BotSystemState } from '../lib/botEngine';

interface TelegramSimulatorProps {
  state: BotSystemState;
  viewerRole: 'owner' | 'member';
  onToggleViewerRole: () => void;
  onSimulateNewUser: () => Promise<void>;
  onSendCommand: (input: string, isCallback?: boolean) => Promise<void>;
  onReset: () => Promise<void>;
  busy: boolean;
}

const QUICK_COMMANDS = [
  { label: '/start', cmd: '/start' },
  { label: '/joinlive', cmd: '/joinlive https://t.me/dhaka_chill_vc/42' },
  { label: '/play', cmd: '/play Midnight Signal' },
  { label: '/volume 120', cmd: '/volume 120' },
  { label: '/account', cmd: '/account' },
  { label: '/admin', cmd: '/admin' },
  { label: '/help', cmd: '/help' },
];

const BUTTON_STYLE_CLASSES: Record<'primary' | 'danger' | 'success', string> = {
  primary: 'border-blue-400/40 bg-blue-600/90 text-white hover:bg-blue-500',
  danger: 'border-rose-400/40 bg-rose-600/90 text-white hover:bg-rose-500',
  success: 'border-emerald-400/40 bg-emerald-600/90 text-white hover:bg-emerald-500',
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function renderInlineMarkup(input: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenRegex = /<(b|i|code)>([\s\S]*?)<\/\1>|<a\s+href="([^"]+)">([\s\S]*?)<\/a>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = tokenRegex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(decodeHtmlEntities(input.slice(lastIndex, match.index)));
    }
    const key = `${keyPrefix}-${idx++}`;
    if (match[1] === 'b') {
      nodes.push(
        <strong key={key} className="font-semibold text-white">
          {renderInlineMarkup(match[2], key)}
        </strong>,
      );
    } else if (match[1] === 'i') {
      nodes.push(
        <em key={key} className="italic text-slate-300">
          {renderInlineMarkup(match[2], key)}
        </em>,
      );
    } else if (match[1] === 'code') {
      nodes.push(
        <code key={key} className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[12px] text-sky-300">
          {decodeHtmlEntities(match[2])}
        </code>,
      );
    } else if (match[3] !== undefined) {
      const href = match[3];
      const safeHref = href.startsWith('https://') || href.startsWith('http://') || href.startsWith('tg://');
      nodes.push(
        safeHref ? (
          <span key={key} className="font-semibold text-sky-400">
            {renderInlineMarkup(match[4], key)}
          </span>
        ) : (
          decodeHtmlEntities(match[4])
        ),
      );
    }
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < input.length) {
    nodes.push(decodeHtmlEntities(input.slice(lastIndex)));
  }
  return nodes;
}

function renderTextBlock(blockText: string, keyPrefix: string) {
  const lines = blockText.split('\n');
  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (/^[━─]{6,}$/.test(trimmed)) {
      return (
        <div
          key={`${keyPrefix}-div-${idx}`}
          aria-hidden="true"
          className="my-1 h-[1.5px] w-44 max-w-full rounded-full bg-white/35"
        />
      );
    }
    if (trimmed === '') {
      return <div key={`${keyPrefix}-sp-${idx}`} className="h-1.5" />;
    }
    return (
      <div key={`${keyPrefix}-ln-${idx}`} className="break-words leading-[1.45]">
        {renderInlineMarkup(line, `${keyPrefix}-${idx}`)}
      </div>
    );
  });
}

function TelegramRichText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const bqRegex = /<blockquote>([\s\S]*?)<\/blockquote>/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let blockIdx = 0;

  while ((match = bqRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      const before = text.slice(lastIdx, match.index).replace(/^\n+|\n+$/g, '');
      if (before) {
        blocks.push(
          <div key={`txt-${blockIdx++}`}>
            {renderTextBlock(before, `t-${blockIdx}`)}
          </div>,
        );
      }
    }

    const inner = match[1].trim();
    blocks.push(
      <div
        key={`bq-${blockIdx++}`}
        className="relative my-1.5 rounded-r-lg border-l-2 border-amber-400/80 bg-amber-950/30 px-3 py-2 pr-6 whitespace-pre-wrap break-words leading-[1.45] text-slate-100"
      >
        <span aria-hidden="true" className="absolute right-2 top-1 text-xs font-serif text-amber-400/80">
          ”
        </span>
        {renderInlineMarkup(inner, `q-${blockIdx}`)}
      </div>,
    );
    lastIdx = bqRegex.lastIndex;
  }

  if (lastIdx < text.length) {
    const tail = text.slice(lastIdx).replace(/^\n+/, '');
    if (tail) {
      blocks.push(
        <div key={`txt-${blockIdx++}`}>
          {renderTextBlock(tail, `t-${blockIdx}`)}
        </div>,
      );
    }
  }

  return <div className="font-sans text-[13.5px] text-slate-100 space-y-0.5">{blocks}</div>;
}

function BotMessageBody({ message }: { message: BotMessage }) {
  const frames = message.animationFrames;
  const framesRef = useRef(frames);
  framesRef.current = frames;

  const [frameIndex, setFrameIndex] = useState<number>(
    frames && frames.length > 0 ? 0 : -1,
  );

  useEffect(() => {
    const activeFrames = framesRef.current;
    if (!activeFrames || activeFrames.length <= 1) {
      setFrameIndex(-1);
      return;
    }
    setFrameIndex(0);
    let current = 0;
    const timer = window.setInterval(() => {
      current += 1;
      if (current >= activeFrames.length - 1) {
        setFrameIndex(activeFrames.length - 1);
        window.clearInterval(timer);
      } else {
        setFrameIndex(current);
      }
    }, 145);
    return () => window.clearInterval(timer);
  }, [message.id]);

  const activeText =
    frames && frameIndex >= 0 && frameIndex < frames.length
      ? frames[frameIndex]
      : message.text;

  return (
    <div className="space-y-2 animate-[fadeIn_0.2s_ease-out]">
      {message.photoBadge && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-400/20 bg-sky-950/40 px-3 py-2 text-xs text-sky-300">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-[11px] font-bold">
            👤
          </span>
          <span className="font-medium">{message.photoBadge}</span>
        </div>
      )}
      <TelegramRichText text={activeText} />
    </div>
  );
}

export const TelegramSimulator: React.FC<TelegramSimulatorProps> = ({
  state,
  viewerRole,
  onToggleViewerRole,
  onSimulateNewUser,
  onSendCommand,
  onReset,
  busy,
}) => {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.messages.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || busy) return;
    setDraft('');
    await onSendCommand(trimmed, false);
  };

  return (
    <section
      aria-label="Telegram Bot Simulator"
      className="flex flex-col rounded-xl border border-white/10 bg-[#111827] overflow-hidden h-[680px]"
    >
      {/* Telegram Chat Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#161F33] px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-100 truncate">
              {state.botUsername}
            </h2>
            {state.maintenanceMode && (
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                MAINTENANCE
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 truncate">
            {state.account.status === 'connected' ? 'MTProto Active' : 'MTProto Offline'} · {state.liveSession.active ? `Live in ${state.liveSession.groupIdentifier}` : 'Voice Chat Idle'}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleViewerRole}
            disabled={busy}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
              viewerRole === 'owner'
                ? 'border-amber-400/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                : 'border-slate-500/40 bg-slate-700/40 text-slate-200 hover:bg-slate-700/60'
            }`}
          >
            <Shield className="h-3.5 w-3.5" aria-hidden="true" />
            {viewerRole === 'owner' ? 'Role: Admin' : 'Role: User'}
          </button>

          <button
            type="button"
            onClick={onSimulateNewUser}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-sky-400/30 bg-sky-500/15 px-2.5 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            New Join
          </button>

          <button
            type="button"
            onClick={onReset}
            disabled={busy}
            aria-label="Reset Chat"
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset
          </button>
        </div>
      </div>

      {/* Quick Command Strip */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-white/10 bg-[#0F172A] px-4 py-2.5">
        {QUICK_COMMANDS.map((item) => (
          <button
            key={item.label}
            type="button"
            disabled={busy}
            onClick={() => onSendCommand(item.cmd, false)}
            className="rounded-md border border-white/10 bg-[#161F33] px-2.5 py-1 font-mono text-xs text-sky-300 hover:bg-sky-500/15 hover:border-sky-400/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Message Stream */}
      <div
        ref={scrollRef}
        data-testid="telegram-message-list"
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-[#0B1120]"
      >
        {state.messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[90%] sm:max-w-[85%] rounded-xl px-4 py-3 ${
                  isUser
                    ? 'bg-sky-600 text-white'
                    : 'border border-white/10 bg-[#161F33] text-slate-100'
                }`}
              >
                {isUser ? (
                  <p className="text-[13.5px] font-medium break-words">{msg.text}</p>
                ) : (
                  <BotMessageBody message={msg} />
                )}
                <div className="mt-1.5 flex items-center justify-end gap-2 text-[11px] text-slate-400 tabular-nums">
                  {msg.effectBadge && !isUser && (
                    <span className="text-amber-300/90">{msg.effectBadge}</span>
                  )}
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString('en-US', {
                      timeZone: 'Asia/Dhaka',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </span>
                </div>
              </div>

              {/* Telegram Inline Keyboard */}
              {!isUser && msg.inlineKeyboard && msg.inlineKeyboard.length > 0 && (
                <div className="mt-1.5 w-full max-w-[92%] sm:max-w-[85%] space-y-1.5">
                  {msg.inlineKeyboard.map((row, rIdx) => (
                    <div
                      key={`${msg.id}-r-${rIdx}`}
                      className={`grid gap-1.5 ${
                        row.length >= 4
                          ? 'grid-cols-2 sm:grid-cols-4'
                          : row.length === 3
                            ? 'grid-cols-3'
                            : row.length === 2
                              ? 'grid-cols-2'
                              : 'grid-cols-1'
                      }`}
                    >
                      {row.map((btn) => {
                        const styleClasses = btn.style
                          ? BUTTON_STYLE_CLASSES[btn.style]
                          : 'border-white/10 bg-[#1E293B] text-slate-100 hover:bg-[#273549] hover:border-sky-400/40';
                        return (
                          <button
                            key={`${msg.id}-${btn.callbackData}-${btn.text}`}
                            type="button"
                            disabled={busy}
                            data-btn-style={btn.style ?? 'default'}
                            onClick={() => onSendCommand(btn.callbackData, true)}
                            className={`rounded-lg border px-2.5 py-2 text-xs font-medium active:scale-[0.98] transition-all truncate cursor-pointer disabled:opacity-50 ${styleClasses}`}
                          >
                            {btn.text}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Message Input Composer */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-white/10 bg-[#161F33] px-4 py-3"
      >
        <label htmlFor="bot-command-input" className="sr-only">
          Send Telegram bot command or link
        </label>
        <input
          id="bot-command-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type /start, /play <song>, /admin, /broadcast <msg>, or /volume 140..."
          className="flex-1 rounded-lg border border-white/10 bg-[#0B1120] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          aria-label="Send command"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          Send
        </button>
      </form>
    </section>
  );
};
