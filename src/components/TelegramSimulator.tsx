import React, { useEffect, useRef, useState } from 'react';
import { Send, RotateCcw } from 'lucide-react';
import type { BotMessage, BotSystemState } from '../lib/botEngine';

interface TelegramSimulatorProps {
  state: BotSystemState;
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
  { label: '/owner', cmd: '/owner' },
  { label: '/help', cmd: '/help' },
];

function AnimatedMessageBody({ message }: { message: BotMessage }) {
  const frames = message.animationFrames;
  const [frameIndex, setFrameIndex] = useState<number>(
    frames && frames.length > 0 ? 0 : -1,
  );

  useEffect(() => {
    if (!frames || frames.length <= 1) {
      setFrameIndex(-1);
      return;
    }
    setFrameIndex(0);
    let current = 0;
    const timer = window.setInterval(() => {
      current += 1;
      if (current >= frames.length - 1) {
        setFrameIndex(frames.length - 1);
        window.clearInterval(timer);
      } else {
        setFrameIndex(current);
      }
    }, 360);
    return () => window.clearInterval(timer);
  }, [message.id, frames]);

  const activeText =
    frames && frameIndex >= 0 && frameIndex < frames.length
      ? frames[frameIndex]
      : message.text;

  return (
    <pre className="whitespace-pre-wrap break-words font-sans text-[13.5px] leading-relaxed text-slate-100">
      {activeText}
    </pre>
  );
}

export const TelegramSimulator: React.FC<TelegramSimulatorProps> = ({
  state,
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
      <div className="flex items-center justify-between gap-4 border-b border-white/10 bg-[#161F33] px-5 py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-100 truncate">
              {state.botUsername}
            </h2>
          </div>
          <p className="text-xs text-slate-400 truncate">
            {state.account.status === 'connected' ? 'MTProto Bridge Active' : 'MTProto Disconnected'} · {state.liveSession.active ? `Live in ${state.liveSession.groupIdentifier}` : 'Voice Chat Idle'}
          </p>
        </div>

        <button
          type="button"
          onClick={onReset}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Reset Chat
        </button>
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
                  <AnimatedMessageBody message={msg} />
                )}
                <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[11px] text-slate-400 tabular-nums">
                  {msg.isAnimated && !isUser && (
                    <span className="text-sky-400">Live-Edit Sequence</span>
                  )}
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
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
                          : row.length === 2
                            ? 'grid-cols-2'
                            : 'grid-cols-1'
                      }`}
                    >
                      {row.map((btn) => (
                        <button
                          key={`${msg.id}-${btn.callbackData}-${btn.text}`}
                          type="button"
                          disabled={busy}
                          onClick={() => onSendCommand(btn.callbackData, true)}
                          className="rounded-lg border border-white/10 bg-[#1E293B] px-2.5 py-2 text-xs font-medium text-slate-100 hover:bg-[#273549] hover:border-sky-400/40 active:scale-[0.99] transition-all truncate cursor-pointer disabled:opacity-50"
                        >
                          {btn.text}
                        </button>
                      ))}
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
          placeholder="Type /start, /play <song>, /joinlive https://t.me/group/123, or /volume 140..."
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
