"use client";
// Browser speech in (SpeechRecognition) and out (speechSynthesis). No external speech service.
// Recognition stays live between turns, pauses while the counter speaks (so it never hears itself),
// and restarts after Chrome's silent timeouts.
import { useCallback, useEffect, useRef, useState } from "react";

type RecognitionLike = {
  continuous: boolean; interimResults: boolean; lang: string;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null;
};

type Handlers = { onFinal: (text: string) => void; onInterim: (text: string) => void; onError: (message: string) => void };

export function useSpeech(handlers: Handlers) {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const recRef = useRef<RecognitionLike | null>(null);
  const wantRef = useRef(false); // the seller wants the mic live
  const speakingRef = useRef(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const begin = useCallback(() => {
    const rec = recRef.current;
    if (!rec || !wantRef.current || speakingRef.current) return;
    try { rec.start(); setListening(true); } catch { /* already started */ }
  }, []);

  useEffect(() => {
    const Ctor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!Ctor) { setSupported(false); return; }
    const rec: RecognitionLike = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) handlersRef.current.onFinal(r[0].transcript.trim());
        else interim += r[0].transcript;
      }
      if (interim) handlersRef.current.onInterim(interim.trim());
    };
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wantRef.current = false;
        setListening(false);
        handlersRef.current.onError("Microphone is blocked. Allow it in the browser.");
      }
      // "no-speech" and "aborted" are normal; onend restarts.
    };
    rec.onend = () => { setListening(false); if (wantRef.current && !speakingRef.current) setTimeout(begin, 250); };
    recRef.current = rec;
    return () => { wantRef.current = false; rec.abort(); };
  }, [begin]);

  const start = useCallback(() => { wantRef.current = true; begin(); }, [begin]);

  const speak = useCallback((text: string) => new Promise<void>((resolve) => {
    if (!text || !("speechSynthesis" in window)) return resolve();
    speakingRef.current = true;
    recRef.current?.abort();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 1.05;
    let finished = false;
    const done = () => { if (finished) return; finished = true; clearTimeout(watchdog); speakingRef.current = false; resolve(); setTimeout(begin, 150); };
    // Chrome sometimes never fires onend; without this the microphone would stay off for the rest of the day.
    const watchdog = setTimeout(done, Math.max(4000, text.length * 120));
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.speak(u);
  }), [begin]);

  return { supported, listening, start, speak };
}
