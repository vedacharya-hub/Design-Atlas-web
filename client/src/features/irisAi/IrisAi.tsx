import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Copy, FileText, Mic, Paperclip, RotateCcw, Square, TriangleAlert, X } from 'lucide-react';
import '../../styles/iris-ui.css';
import styles from './IrisAi.module.css';
import { cn } from '@/lib/utils';
import { Button } from '@/components/shadcn/button';
import { ChatContainerContent, ChatContainerRoot } from '@/components/shadcn/chat-container';
import { Message, MessageAction, MessageActions, MessageContent } from '@/components/shadcn/message';
import { FileUpload, FileUploadContent, FileUploadTrigger } from '@/components/shadcn/file-upload';
import { PromptInput, PromptInputAction, PromptInputTextarea } from '@/components/shadcn/prompt-input';
import { PromptSuggestion } from '@/components/shadcn/prompt-suggestion';
import { ScrollButton } from '@/components/shadcn/scroll-button';
import { TextShimmer } from '@/components/shadcn/text-shimmer';
import { bookingApi } from '../../api/bookingApi';
import { onIrisCommand } from '../iris/irisControl';
import { IrisBot } from './bot/IrisBot';
import { IrisProvider, useIris } from './bot/IrisProvider';
import { useDictation } from './useDictation';
import {
  ATTACH_ACCEPT,
  ATTACH_MAX_BYTES,
  ATTACH_MAX_FILES,
  canAttach,
  chunksOf,
  describeFiles,
  fileSize,
  findAnswer,
  IrisAnswerError,
  pause,
} from './irisAnswers';

/** Each step lasts at least this long, so the bot's searching and thinking can be seen. */
const SEARCH_MS = 1200;
const THINK_MS = 1500;
const CHUNK_MS = 60;
/** Iris Bot's head width at the top of the panel. */
const BOT_SIZE = 46;

const SUGGESTIONS = ['What are my upcoming bookings?', 'Find a meeting room for 4 people', 'Are there free desks tomorrow?', 'What’s happening at the office today?'];

type Phase = 'idle' | 'searching' | 'thinking' | 'responding';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
  /** Iris couldn't answer; offers Try again with the question that failed. */
  error?: { retry: string };
  stopped?: boolean;
  streaming?: boolean;
  /** Files sent with the question. */
  files?: { name: string; size: number }[];
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

let seq = 0;
const nextId = () => `m${++seq}`;

/** Iris AI: the assistant on the right, with Iris Bot looking on. ⌘/Ctrl + K opens and closes it. */
export function IrisAi() {
  return (
    <IrisProvider>
      <IrisAiPanel />
    </IrisProvider>
  );
}

/**
 * The Iris AI panel (Figma 11414:282110): white, 583px on the right, a close button top right and a
 * soft grey glow along the bottom. A greeting and suggestions first; then the conversation, built
 * from prompt-kit (prompt input, messages, chat container). Iris Bot sits at the top, centred, and
 * reacts: listening as you type, searching, thinking, answering, pleased, or crossed when it fails.
 */
function IrisAiPanel() {
  const iris = useIris();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [value, setValue] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [firstName, setFirstName] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  /** Files attached to the next question. */
  const [files, setFiles] = useState<File[]>([]);
  const filesRef = useRef(files);
  filesRef.current = files;
  /** A short note under the prompt box: a file that couldn't be attached, or voice input trouble. */
  const [notice, setNotice] = useState('');
  const panelRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  /** Iris Bot sits on this, centred along the top of the panel. */
  const botAnchor = useRef<HTMLDivElement>(null);
  const runRef = useRef<AbortController | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  /** Closing from inside the panel hands focus back to the launcher once it slides out. */
  const refocus = useRef(false);
  const shown = open || closing;
  const empty = messages.length === 0;

  useEffect(() => {
    bookingApi
      .getMembers()
      .then((members) => setFirstName(members.find((m) => m.isCurrentUser)?.name.split(' ')[0] ?? ''))
      .catch(() => {});
  }, []);

  const focusInput = () => requestAnimationFrame(() => composerRef.current?.querySelector('textarea')?.focus());

  const show = useCallback(() => {
    setClosing(false);
    setOpen(true);
    iris.open();
    focusInput();
  }, [iris]);

  const hide = useCallback(() => {
    if (!open) return;
    runRef.current?.abort();
    setOpen(false);
    setClosing(true);
    iris.close();
    refocus.current = !!panelRef.current?.contains(document.activeElement);
  }, [iris, open]);

  const send = useCallback(
    async (text: string) => {
      const prompt = text.trim();
      const attached = filesRef.current;
      if ((!prompt && attached.length === 0) || runRef.current) return;
      const run = new AbortController();
      runRef.current = run;
      setValue('');
      setFiles([]);
      setNotice('');
      setMessages((m) => [...m, { id: nextId(), role: 'user', text: prompt, files: attached.map((f) => ({ name: f.name, size: f.size })) }]);
      const answerId = nextId();
      try {
        setPhase('searching');
        iris.setState('searching');
        const [answer, fileNote] = await Promise.all([
          prompt ? findAnswer(prompt, run.signal) : Promise.resolve(null),
          attached.length ? describeFiles(attached) : Promise.resolve(''),
          pause(SEARCH_MS, run.signal),
        ]);
        setPhase('thinking');
        iris.setState('thinking');
        await pause(THINK_MS, run.signal);
        setPhase('responding');
        iris.setState('responding');
        const sources = [...(attached.length ? ['Your files'] : []), ...(answer?.sources ?? [])];
        setMessages((m) => [...m, { id: answerId, role: 'assistant', text: '', sources, streaming: true }]);
        for (const piece of chunksOf([fileNote, answer?.text].filter(Boolean).join('\n\n'))) {
          await pause(CHUNK_MS, run.signal);
          setMessages((m) => m.map((x) => (x.id === answerId ? { ...x, text: x.text + piece } : x)));
          iris.chunk();
        }
        setMessages((m) => m.map((x) => (x.id === answerId ? { ...x, streaming: false } : x)));
        iris.success({ celebrate: answer?.celebrate });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // Stopped: keep what streamed so far.
          setMessages((m) => m.map((x) => (x.id === answerId ? { ...x, streaming: false, stopped: true } : x)));
          iris.setState('idle');
        } else {
          const message = err instanceof IrisAnswerError ? err.message : 'Something went wrong. Please try again.';
          setMessages((m) => [...m.filter((x) => x.id !== answerId), { id: nextId(), role: 'assistant', text: message, error: { retry: prompt } }]);
          iris.error(message);
        }
      } finally {
        runRef.current = null;
        setPhase('idle');
      }
    },
    [iris],
  );

  /** Adds files to the next question: up to five, each at most 10 MB, of the kinds Iris takes. */
  const addFiles = useCallback((added: File[]) => {
    const room = ATTACH_MAX_FILES - filesRef.current.length;
    const kept = added.filter((f) => canAttach(f) && f.size <= ATTACH_MAX_BYTES).slice(0, Math.max(0, room));
    const skipped = added.length - kept.length;
    if (skipped)
      setNotice(
        added.some((f) => !canAttach(f))
          ? 'Some files weren’t added: Iris takes PDFs, Office files, text, CSV and images.'
          : added.some((f) => f.size > ATTACH_MAX_BYTES)
            ? 'Some files weren’t added: each file can be up to 10 MB.'
            : `You can attach up to ${ATTACH_MAX_FILES} files at a time.`,
      );
    else setNotice('');
    if (kept.length) setFiles((f) => [...f, ...kept]);
  }, []);

  // Speaking fills the prompt box; Iris Bot listens along.
  const dictation = useDictation({
    onText: (t) => {
      setValue(t);
      iris.typing({ caret: t.length, length: t.length });
    },
    onError: setNotice,
  });


  useEffect(() => {
    if (shown || !refocus.current) return;
    refocus.current = false;
    launcherRef.current?.focus();
  }, [shown]);

  // ⌘/Ctrl + K opens and closes Iris; Escape inside it closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) hide();
        else show();
      } else if (e.key === 'Escape' && open && !e.defaultPrevented && panelRef.current?.contains(document.activeElement)) {
        hide();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, show, hide]);

  // The rest of the app opens Iris (with a question to ask, or the quick bar from before).
  useEffect(
    () =>
      onIrisCommand((command) => {
        show();
        if (command.type === 'open' && command.prompt) void send(command.prompt);
      }),
    [show, send],
  );

  // Typing in the prompt box drives the bot's listening state.
  useEffect(() => {
    if (!open) return;
    const textarea = composerRef.current?.querySelector('textarea');
    return textarea ? iris.bindInput(textarea) : undefined;
  }, [open, iris]);

  async function copy(msg: ChatMessage) {
    try {
      await navigator.clipboard.writeText(msg.text);
      setCopied(msg.id);
      setTimeout(() => setCopied((c) => (c === msg.id ? null : c)), 1500);
    } catch {
      // Clipboard blocked: nothing to show.
    }
  }

  const running = phase !== 'idle';

  return (
    <>
      {!shown && (
        <button ref={launcherRef} type="button" className={styles.launcher} onClick={show} aria-label="Open Iris AI (Ctrl or Command + K)">
          <span className={styles.launcherDots} aria-hidden="true">
            <i />
            <i />
          </span>
          Ask Iris
          <kbd className={styles.kbd}>{IS_MAC ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
      )}

      {shown && (
        <aside
          ref={panelRef}
          className={cn('iris-ui', styles.panel, closing && styles.panelOut)}
          aria-label="Iris AI"
          onAnimationEnd={(e) => {
            if (closing && e.target === e.currentTarget) setClosing(false);
          }}
        >
          <img className={styles.glow} src="/iris-ai/glow.svg" alt="" aria-hidden="true" />

          <header className={styles.head}>
            <div ref={botAnchor} className={styles.botAnchor} aria-hidden="true" />
            <button type="button" className={[styles.roundBtn, styles.close].join(' ')} aria-label="Close Iris AI" onClick={hide}>
              <img src="/admin/user/close.svg" alt="" width={24} height={24} />
            </button>
          </header>

          <ChatContainerRoot className={cn('relative min-h-0 flex-1', styles.log)}>
            <ChatContainerContent className={cn('gap-6 px-6 pt-2', empty ? 'h-full' : 'pb-4')}>
              {empty ? (
                <div className={styles.hero}>
                  <h2 className={styles.greeting}>{firstName ? `Hi ${firstName},` : 'Hi there,'}</h2>
                  <p className={styles.ask}>How can I help you today?</p>
                </div>
              ) : (
                messages.map((msg) =>
                  msg.role === 'user' ? (
                    <Message key={msg.id} className="flex-col items-end gap-2">
                      {!!msg.files?.length && (
                        <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
                          {msg.files.map((file, i) => (
                            <span key={`${file.name}-${i}`} className={styles.fileChip}>
                              <FileText size={16} strokeWidth={1.75} />
                              <span className={styles.fileName}>{file.name}</span>
                              <span className={styles.fileSize}>{fileSize(file.size)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {msg.text && (
                        <MessageContent className="max-w-[85%] rounded-3xl bg-[#121926] px-5 py-2.5 text-[15px] leading-[22px] whitespace-pre-wrap text-white">{msg.text}</MessageContent>
                      )}
                    </Message>
                  ) : msg.error ? (
                    <Message key={msg.id} className="justify-start">
                      <div className={styles.error} role="alert">
                        <TriangleAlert size={18} strokeWidth={2} className="mt-px shrink-0" />
                        <div className="flex flex-col items-start gap-2">
                          <p>{msg.text}</p>
                          <Button variant="outline" size="sm" className="rounded-full bg-white" disabled={running} onClick={() => void send(msg.error!.retry)}>
                            <RotateCcw />
                            Try again
                          </Button>
                        </div>
                      </div>
                    </Message>
                  ) : (
                    <Message key={msg.id} className="justify-start">
                      <div className="flex w-full min-w-0 flex-col gap-2">
                        <MessageContent markdown id={msg.id} className={cn('prose prose-sm max-w-none bg-transparent p-0 text-[15px] leading-[22px] text-foreground', styles.answer)}>
                          {msg.text}
                        </MessageContent>
                        {!msg.streaming && (
                          <div className="flex flex-wrap items-center gap-2">
                            {msg.sources?.map((s) => (
                              <span key={s} className={styles.source}>
                                {s}
                              </span>
                            ))}
                            {msg.stopped && <span className={styles.stopped}>Stopped</span>}
                            <MessageActions className="ml-auto">
                              <MessageAction tooltip={copied === msg.id ? 'Copied' : 'Copy'}>
                                <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label="Copy answer" onClick={() => void copy(msg)}>
                                  {copied === msg.id ? <Check /> : <Copy />}
                                </Button>
                              </MessageAction>
                            </MessageActions>
                          </div>
                        )}
                      </div>
                    </Message>
                  ),
                )
              )}
              {(phase === 'searching' || phase === 'thinking') && (
                <div className="flex items-center gap-2" role="status">
                  <TextShimmer className="text-[15px]">{phase === 'searching' ? 'Searching your workspace…' : 'Thinking…'}</TextShimmer>
                </div>
              )}
            </ChatContainerContent>
            <div className="pointer-events-none absolute right-6 bottom-4 [&>*]:pointer-events-auto">
              <ScrollButton className="bg-white shadow-sm" />
            </div>
          </ChatContainerRoot>

          <div className={styles.composer} ref={composerRef}>
            {empty && (
              <div className={styles.suggestions}>
                {SUGGESTIONS.map((s) => (
                  <PromptSuggestion key={s} size="sm" className="h-9 rounded-full border-[#cdd5df] bg-white px-4 text-[13px] font-normal text-foreground shadow-none hover:bg-[#f8fafc]" onClick={() => void send(s)}>
                    {s}
                  </PromptSuggestion>
                ))}
              </div>
            )}
            <FileUpload onFilesAdded={addFiles} accept={ATTACH_ACCEPT} disabled={running}>
              {/* Dropping files anywhere while Iris is open attaches them. */}
              <FileUploadContent className="z-[2147482000] bg-white/70">
                <div className={styles.drop}>
                  <Paperclip size={22} strokeWidth={1.75} />
                  <p>Drop files to attach them for Iris</p>
                  <span>PDF, Office, text, CSV or images, up to 10 MB each</span>
                </div>
              </FileUploadContent>
              <div className={styles.inputWrap}>
                {files.length > 0 && (
                  <div className={styles.attachments} aria-label="Attached files">
                    {files.map((file, i) => (
                      <span key={`${file.name}-${i}`} className={styles.fileChip}>
                        <FileText size={16} strokeWidth={1.75} />
                        <span className={styles.fileName}>{file.name}</span>
                        <span className={styles.fileSize}>{fileSize(file.size)}</span>
                        <button type="button" className={styles.fileRemove} aria-label={`Remove ${file.name}`} onClick={() => setFiles((f) => f.filter((_, k) => k !== i))}>
                          <X size={14} strokeWidth={2} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {/* One line: attach, the question, speak, send. */}
                <PromptInput
                  value={value}
                  onValueChange={setValue}
                  isLoading={running}
                  maxHeight={132}
                  onSubmit={() => {
                    dictation.stop();
                    void send(value);
                  }}
                  className="flex items-end gap-1 rounded-[26px] border-[#cdd5df] bg-white p-1.5 shadow-[0_8px_24px_rgba(18,25,38,0.08)]"
                >
                  <PromptInputAction tooltip="Attach files">
                    <FileUploadTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-full text-[#4b5565] hover:bg-[#f2f4f7]" aria-label="Attach files" disabled={running}>
                        <Paperclip className="size-5" strokeWidth={1.75} />
                      </Button>
                    </FileUploadTrigger>
                  </PromptInputAction>
                  <PromptInputTextarea
                    placeholder={dictation.listening ? 'Listening…' : 'Ask Iris anything…'}
                    aria-label="Ask Iris"
                    className="min-h-10 min-w-0 flex-1 px-1 py-[9px] text-[15px] leading-[22px] text-foreground"
                  />
                  {dictation.supported && (
                    <PromptInputAction tooltip={dictation.listening ? 'Stop voice input' : 'Speak'}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn('size-10 shrink-0 rounded-full text-[#4b5565] hover:bg-[#f2f4f7]', dictation.listening && styles.micOn)}
                        aria-label={dictation.listening ? 'Stop voice input' : 'Speak your question'}
                        aria-pressed={dictation.listening}
                        disabled={running}
                        onClick={() => {
                          setNotice('');
                          if (dictation.listening) dictation.stop();
                          else dictation.start(value);
                        }}
                      >
                        <Mic className="size-5" strokeWidth={1.75} />
                      </Button>
                    </PromptInputAction>
                  )}
                  {running ? (
                    <PromptInputAction tooltip="Stop">
                      <Button size="icon" className="size-10 shrink-0 rounded-full" aria-label="Stop" onClick={() => runRef.current?.abort()}>
                        <Square className="size-3.5 fill-current" />
                      </Button>
                    </PromptInputAction>
                  ) : (
                    <PromptInputAction tooltip="Send">
                      <Button
                        size="icon"
                        className="size-10 shrink-0 rounded-full"
                        aria-label="Send"
                        disabled={!value.trim() && files.length === 0}
                        onClick={() => {
                          dictation.stop();
                          void send(value);
                        }}
                      >
                        <ArrowUp className="size-[18px]" />
                      </Button>
                    </PromptInputAction>
                  )}
                </PromptInput>
              </div>
            </FileUpload>
            {notice && (
              <p className={styles.notice} role="status">
                {notice}
              </p>
            )}
            <p className={styles.footnote}>Iris can make mistakes. Check bookings before you rely on them.</p>
          </div>
        </aside>
      )}

      {/* Centred along the top of the panel, above the conversation. */}
      <IrisBot position="anchor" anchorRef={botAnchor} size={BOT_SIZE} ariaLabel="Iris, the AI assistant" />
    </>
  );
}
