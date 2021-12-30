import { EventEmitter } from "ws";
import { Speech, SpeechConverter, Word } from "./SpeechConverter";
import { v1p1beta1 as speech, protos as speechProtos } from "@google-cloud/speech";
// const speech = require('@google-cloud/speech');
import Pumpify from "pumpify";

const log4js = require('log4js');
const moduleName = module.filename.slice(__filename.lastIndexOf("/")+1, module.filename.length -3);
const logger = log4js.getLogger(moduleName);
logger.level = 'debug';


interface Builder {
    onClosed(listener: () => void): Builder;
    setLanguageCode(value: string): Builder;
    build(): Promise<GoogleSpeechConverter>;
}

const ON_SPEECH_RECEIVED = "onSpeechRecieved";
const ON_CLOSED_EVENT_NAME = "onClosed";
const STREAMING_MAX_TIME_THRESHOLD_IN_MS = 4 * 60 * 1000; // 4 mins

export class GoogleSpeechConverter implements SpeechConverter {
    public static builder(): Builder {
        const converter = new GoogleSpeechConverter();
        const result = {
            onClosed: (listener: () => void) => {
                converter._emitter.once(ON_CLOSED_EVENT_NAME, listener);
                return result;
            },
            setLanguageCode: (value:string) => {
                converter._languageCode = value;
                return result;
            },
            build: async () => {
                converter._request = {
                    config: {
                        encoding: 'LINEAR16',
                        sampleRateHertz: 44100,
                        languageCode: converter._languageCode,
                        enableWordTimeOffsets: true,
                        audioChannelCount: 1,
                        profanityFilter: false,
                        diarizationConfig: {
        
                        },
                        metadata: {
                            interactionType: 'PRESENTATION',
                            // industryNaicsCodeOfAudio: ,
                            microphoneDistance: 'NEARFIELD',
                            originalMediaType: 'AUDIO',
                            recordingDeviceType: 'PC',
                            originalMimeType: 'audio/ogg',
                        },
                        model: "phone_call",
                        useEnhanced: true,
                    },
                    interimResults: true, // If you want interim results, set this to true
                }
                return converter;
            }
        };
        return result;
    }
    private _languageCode: string = "en-US";
    private _lastTranscriptionEnded?: number;
    private _closed: boolean = false;
    private _stream?: Pumpify;
    private _request?: speechProtos.google.cloud.speech.v1.IStreamingRecognitionConfig;
    private _streamStarted?: number;
    private _client: speech.SpeechClient;
    private _emitter: EventEmitter = new EventEmitter();
    private constructor() {
        this._client = new speech.SpeechClient();
    }

    public get closed(): boolean {
        return this._closed;
    }

    public async close(): Promise<void> {
        if (this._closed) {
            logger.warn(`Attempted to close twice`);
            return;
        }
        this._closed = true;
        if (this._stream) {
            this._stream.destroy();
        }
        this._client.close();
        this._emitter.removeAllListeners(ON_SPEECH_RECEIVED);
        this._emitter.emit(ON_CLOSED_EVENT_NAME);
    }

    public async receive(buffer: Uint8Array): Promise<void> {
        if (this._closed) {
            return;
        }
        const now = Date.now();
        if (!this._stream) {
            await this._connect();
            // connect
        } else if (this._streamStarted && STREAMING_MAX_TIME_THRESHOLD_IN_MS < now - this._streamStarted) {
            // close stream
            await this._connect();
        }
        this._stream!.write(buffer);
    }

    onSpeechEmitted(listener: (speech: Speech) => void): this {
        this._emitter.on(ON_SPEECH_RECEIVED, listener);
        return this;
    }

    private async _connect(): Promise<void> {
        if (this._stream) {
            logger.warn(`Attempted to make stream twice`);
            return;
        }
        this._streamStarted = Date.now();
        this._lastTranscriptionEnded = undefined;
        logger.info(`request stream`, this._request!);
        this._stream = this._client!.streamingRecognize(this._request!)
            .on('error', err => {
                logger.warn(`Error occurred while streaming`, err);
            })
            .on('close', () => {
                logger.info(`Speech client is closed`);
                if (!this._closed) {
                    this._stream = undefined;
                    this._connect();
                }
            })
            .on('data', (transcribeData: any) => {
                // logger.info(transcribeData);
                this._receiveGoogleTranscription(transcribeData);
            });
    }

    private _receiveGoogleTranscription(transcribeData: any) {
        if (!transcribeData.results[0].isFinal) {
            return;
        }
        const item = transcribeData.results[0] && transcribeData.results[0].alternatives[0] ? transcribeData.results[0].alternatives[0] : null;
        if (!item || !item.words || item.words.length < 1) {
            logger.warn(`Item has no words`);
            return;
        }
        // logger.info({transcribeData});
        const speechStarted = this._lastTranscriptionEnded ?? this._streamStarted!;
        let speechEnded: number = 0;
        const words: Word[] = [];
        for (let i = 0; i < item.words.length; ++i) {
            const { startTime, endTime, word, /* speakerTag */ } = item.words[i];
            const wordStarted = speechStarted + parseInt(startTime.seconds, 10) * 1000 + startTime.nanos / 1000000;
            const wordEnded = speechStarted + parseInt(endTime.seconds, 10) * 1000 + endTime.nanos / 1000000;
            words.push({
                word,
                started: wordStarted,
            });
            speechEnded = speechStarted + wordEnded;
        }
        this._lastTranscriptionEnded = speechEnded;
        const speech: Speech = {
            languageCode: this._languageCode,
            started: speechStarted,
            words,
        };
        // logger.info({speech, words});
        this._emitter.emit(ON_SPEECH_RECEIVED, speech);
    }
}