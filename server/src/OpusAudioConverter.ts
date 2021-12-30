import { AudioConverter } from "./AudioConverter";
import { v4 as uuidv4 } from "uuid";
import { EventEmitter } from "ws";
const gstreamer = require("gstreamer-superficial");

const log4js = require('log4js');
const moduleName = module.filename.slice(__filename.lastIndexOf("/")+1, module.filename.length -3);
const logger = log4js.getLogger(moduleName);
logger.level = 'debug';

export type WavByteBufferListener = (buffer: Uint8Array) => void;

const ON_CLOSED_EVENT_NAME = "closed";
const ON_WAV_BUFFER_RECEIVED = "wavBuffered";

interface Builder {
    withPayloadType(payloadType: number): Builder;
    onClosed(listener: () => void): Builder;
    withClockRate(value: number): Builder;
    build(): Promise<OpusAudioConverter>;
}

export class OpusAudioConverter implements AudioConverter {
    public static builder(): Builder {
        let payloadType: number | undefined = undefined;
        let clockRate: number | undefined = undefined;
        const converter = new OpusAudioConverter();
        const result = {
            withPayloadType: (value: number) => {
                payloadType = value;
                return result;
            },
            onClosed: (listener: () => void) => {
                converter._emitter.once(ON_CLOSED_EVENT_NAME, listener);
                return result;
            },
            withClockRate: (value: number) => {
                clockRate = value;
                return result;
            },
            build: async () => {
                const sourceId = uuidv4();
                const sinkId = uuidv4();
                const pipelineElements = [];
                pipelineElements.push(
                    `appsrc name=${sourceId} format=time is-live=true do-timestamp=true caps="application/x-rtp,media=audio,clock-rate=${clockRate!},encoding-name=OPUS,payload=${payloadType!}"`, 
                    `rtpopusdepay`,
                    `opusparse`,
                    `opusdec `,
                    // `audioconvert`, 
                    // `audioamplify amplification=${amplification}`,
                    `capsfilter caps=audio/x-raw,channels=2`,
                    `deinterleave name=d2  d2.src_0`,
                    `wavenc`,
                    `appsink name=${sinkId}`,
                );
                const elements = pipelineElements.join(` ! `);
                logger.info(`Create pipeline ${elements}`);
                const pipeline = new gstreamer.Pipeline(elements);
                converter._pipeline = pipeline;
                converter._appsrc = pipeline.findChild(sourceId);
                converter._appsink = pipeline.findChild(sinkId);
                return converter;
            }
        };
        return result;
    }

    private _started: boolean = false;
    private _stopped: boolean = false;
    private _emitter: EventEmitter = new EventEmitter();
    private _appsrc: any;
    private _appsink: any;
    private _pipeline: any;
    private constructor() {

    }

    public onWavBuffered(listener: (buffer: Uint8Array) => void): this {
        this._emitter.on(ON_WAV_BUFFER_RECEIVED, listener);
        return this;
    }

    public get closed() {
        return this._stopped;
    }

    public async close(): Promise<void> {
        if (this._started) {
            if (!this._stopped) {
                await this._stop();
            }
        }
    }

    public receive(rtpPacket: Uint8Array): void {
        if (!this._started) {
            this._run();
        }
        const appsrc = this._appsrc;
        appsrc.push(rtpPacket);
    }

    public _run(): void {
        if (this._started) {
            logger.warn(`Attempted to start an audio converter twice`);
            return;
        }
        logger.info(`Starting pipeline`);
        const pipeline = this._pipeline;
        const appsink = this._appsink;
        const idleTimeInMs = 300;
        const isStopped = () => this._stopped;
        const emit = (buf: Uint8Array) => {
            this._emitter.emit(ON_WAV_BUFFER_RECEIVED, buf);
        }
        const _poll = function() {
            appsink.pull((buf: any) => {
                if (isStopped()) {
                    return;
                }
                if (!buf) {
                    setTimeout(_poll, idleTimeInMs);
                    return;
                }
                // console.log("gstreamer pipeline", buf);
                emit(buf);
                _poll();
            });
        };
        _poll();
        pipeline.pollBus( (msg: any) => {
            logger.info(msg);
            switch( msg.type ) {
                case 'eos': {
                    if (!this._stopped) {
                        this._stop();
                    }
                    break;
                }
            }
        });
        pipeline.play();
        this._started = true;
    }

    public async _stop(): Promise<void> {
        if (this._stopped) {
            logger.warn(`Attempted to stop an audio converter twice`);
            return;
        }
        if (this._started) {
            const pipeline = this._pipeline;
            pipeline.stop();
        }
        this._stopped = true;
        this._emitter.removeAllListeners(ON_WAV_BUFFER_RECEIVED);
        this._emitter.emit(ON_CLOSED_EVENT_NAME);
    }
}