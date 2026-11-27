import { useCallback, useEffect, useRef, useState } from 'react';

/** The parts of the Web Speech API's SpeechRecognition that dictation uses (Chrome and Safari prefix it). */
interface Recognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

const Ctor: RecognitionCtor | undefined =
  typeof window === 'undefined' ? undefined : ((window as unknown as Record<string, RecognitionCtor | undefined>).SpeechRecognition ?? (window as unknown as Record<string, RecognitionCtor | undefined>).webkitSpeechRecognition);

const ERRORS: Record<string, string> = {
  'not-allowed': 'Allow microphone access to talk to Iris.',
  'service-not-allowed': 'Allow microphone access to talk to Iris.',
  'no-speech': 'I didn’t hear anything. Try again.',
  'audio-capture': 'No microphone was found.',
  network: 'Voice input needs an internet connection.',
};

/**
 * Speech to text for the prompt box: start() listens and calls onText with what's been said so far
 * (after whatever was already typed); stop() ends it. Not every browser has it: check `supported`.
 */
export function useDictation({ onText, onError }: { onText: (text: string) => void; onError: (message: string) => void }) {
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const handlers = useRef({ onText, onError });
  handlers.current = { onText, onError };

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback((typed: string) => {
    if (!Ctor || rec.current) return;
    const r = new Ctor();
    r.lang = navigator.language || 'en-IN';
    r.continuous = true;
    r.interimResults = true;
    const before = typed.trim() ? `${typed.trimEnd()} ` : '';
    let finals = '';
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i][0]?.transcript ?? '';
        if (e.results[i].isFinal) finals += piece;
        else interim += piece;
      }
      handlers.current.onText(`${before}${finals}${interim}`.replace(/\s+/g, ' ').trimStart());
    };
    r.onerror = (e) => {
      if (e.error !== 'aborted') handlers.current.onError(ERRORS[e.error] ?? 'Voice input stopped. Try again.');
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      rec.current = null;
      handlers.current.onError('Voice input couldn’t start. Try again.');
    }
  }, []);

  // Closing the panel (unmounting) stops listening.
  useEffect(() => () => rec.current?.abort(), []);

  return { supported: !!Ctor, listening, start, stop };
}
