interface SpeechRecognitionResultEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: { readonly length: number; [i: number]: { transcript: string } };
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

interface Window {
  SpeechRecognition?: { new (): SpeechRecognition };
  webkitSpeechRecognition?: { new (): SpeechRecognition };
}

declare var SpeechRecognition: { new (): SpeechRecognition };
declare var webkitSpeechRecognition: { new (): SpeechRecognition };
