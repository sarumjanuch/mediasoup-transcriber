import { EventEmitter } from "ws";
import { Queue } from "./Queue";
import { AudioConverter } from "./AudioConverter";
import { Speech, SpeechConverter, Word } from "./SpeechConverter";
import { Transcription, Builder as TranscriptionBuilder, builder as transcriptionBuilder } from "./Transcription";

const log4js = require('log4js');
const moduleName = module.filename.slice(__filename.lastIndexOf("/")+1, module.filename.length -3);
const logger = log4js.getLogger(moduleName);
logger.level = 'debug';

export type ActiveSpeakerSettings = {
    producerId: string,
    userId: string,
    started: number,
    ended?: number;
}

export type TranscriptionListener = (transcription: Transcription) => void;

interface Builder {
    onTranscriptionReady(listener: TranscriptionListener): Builder;
    withSpeechConverter(value: SpeechConverter): Builder;
    withAudioConverter(value: AudioConverter): Builder;
    build(): Promise<Transcriber>;
}

const UNKNOWN: string = "unknown";
const ON_TRANSCRIPTION_READY = "TranscriptionReady";

export class Transcriber {
    public static builder(): Builder {
        const transcriber = new Transcriber();
        const result = {
            onTranscriptionReady: (listener: TranscriptionListener) => {
                transcriber._emitter.on(ON_TRANSCRIPTION_READY, listener);
                return result;
            },
            withSpeechConverter: (value: SpeechConverter) => {
                transcriber._speechConverter = value;
                return result;
            },
            withAudioConverter: (value: AudioConverter) => {
                transcriber._audioConverter = value;
                return result;
            },
            build: async () => {
                transcriber._audioConverter!.onWavBuffered((buffer: Uint8Array) => {
                    transcriber._speechConverter!.receive(buffer);
                });
                transcriber._speechConverter!.onSpeechEmitted((speech: Speech) => {
                    transcriber._receiveSpeech(speech);
                });
                return transcriber;
            }
        };
        return result;
    }
    
    private _activeProducerId?: string;
    private _closed: boolean = false;
    private _speechConverter?: SpeechConverter;
    private _audioConverter?: AudioConverter;
    private _emitter: EventEmitter = new EventEmitter();
    private _words: Queue<Word> = new Queue();
    private _speakers: Queue<ActiveSpeakerSettings> = new Queue<ActiveSpeakerSettings>();
    private constructor() {

    }

    public get closed() {
        return this._closed;
    }

    public async close(): Promise<void> {
        if (this._closed) {
            logger.warn(`Attempted to close twice`);
            return;
        }
        this._closed = true;

        if (this._audioConverter && !this._audioConverter.closed) {
            this._audioConverter.close();
        }
        if (this._speechConverter && !this._speechConverter.closed) {
            this._speechConverter.close();
        }
    }

    public setActiveSpeaker(speaker: ActiveSpeakerSettings): void {
        if (!this._speakers.isEmpty) {
            const prevSpeaker = this._speakers.peekLast();
            if (prevSpeaker) {
                prevSpeaker.ended = speaker.started;
            }
        }
        this._speakers.push(speaker);
        this._activeProducerId = speaker.producerId;
    }

    public receiveRtpPacket(producerId: string, rtpPacket: Uint8Array): void {
        if (this._activeProducerId && this._activeProducerId === producerId) {
            this._audioConverter!.receive(rtpPacket);
        }
    }

    private _seekSpeaker(): ActiveSpeakerSettings | undefined {
        if (this._speakers.isEmpty) {
            return undefined;
        }
        const word: Word = this._words.peekFirst()!;
        while (!this._speakers.isEmpty) {
            const speaker: ActiveSpeakerSettings = this._speakers.peekFirst()!;
            if (!speaker.ended) {
                return speaker;
            }
            if (word.started < speaker.ended) {
                return speaker;
            }
            this._speakers.popFirst();
        }
        return undefined;
    }

    private _makeTranscription(): Transcription | undefined {
        const speaker = this._seekSpeaker();
        // logger.info("selected speaker", speaker);
        if (!speaker) {
            return undefined;
        }
        const builder: TranscriptionBuilder = transcriptionBuilder()
            .setDate(speaker.started)
            .setUserId(speaker.userId);
        let hasWords: boolean = false;
        while (!this._words.isEmpty) {
            const { word, started: wordStarted }: Word = this._words.peekFirst()!;
            if (speaker.ended && speaker.ended < wordStarted) {
                break;
            }
            builder.addWord(word);
            hasWords = true;
            this._words.popFirst();
        }
        return hasWords ? builder.build() : undefined;
    }

    public _receiveSpeech(speech: Speech): void {
        this._words.pushAll(...speech.words);
        logger.info({speech});
        while (!this._words.isEmpty) {
            const transcription: Transcription | undefined = this._makeTranscription();
            // logger.info({ transcription });
            if (!transcription) {
                break;
            }
            this._emitter.emit(ON_TRANSCRIPTION_READY, transcription);
        }
    }
}