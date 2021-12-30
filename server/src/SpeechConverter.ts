
export type Word = {
    word: string;
    started: number;
}

export type Speech = {
    languageCode: string;
    started: number;
    words: Word[];
}

export interface SpeechConverter {
    onSpeechEmitted(listener: (speech: Speech) => void): this;
    receive(buffer: Uint8Array): void;
    closed: boolean;
    close(): Promise<void>;
}