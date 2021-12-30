import { ActiveSpeakerSettings, Transcriber, TranscriptionListener } from "./Transcriber";
import { Transcription } from "./Transcription";
import {v4 as uuidv4 } from "uuid";
import mediasoup from "mediasoup";
import EventEmitter from "events";
import { Client, Builder as ClientBuilder, ProducerInfo } from "./Client";
import { OpusAudioConverter } from "./OpusAudioConverter";
import { GoogleSpeechConverter } from "./GoogleSpeechConverter";

const log4js = require('log4js');
const moduleName = module.filename.slice(__filename.lastIndexOf("/")+1, module.filename.length -3);
const logger = log4js.getLogger(moduleName);
logger.level = 'debug';

const ON_CLOSED_EVENT_NAME = "onClosed";
const ON_CLIENT_CLOSED_EVENT_NAME = "onClientClosed";
const ON_TRANSCRIPTION_READY = "onTranscriptionReady";

type DirectTransport = mediasoup.types.DirectTransport;
type Consumer = mediasoup.types.Consumer;
type Router = mediasoup.types.Router;
type ActiveSpeakerObserver = mediasoup.types.ActiveSpeakerObserver;

interface Builder {
    setRouter(router: Router): Builder;
    onClosed(listener: () => void): Builder;
    onClientClosed(listener: () => void): Builder;
    build(): Promise<Call>;
}

const activeSpeakerIntervalInMs = 100;

export class Call {
    public static builder(): Builder {
        const call = new Call();
        const result = {
            setRouter: (router: Router) => {
                call._router = router;
                return result;
            },
            onClosed: (listener: () => void) => {
                call._emitter.once(ON_CLOSED_EVENT_NAME, listener);
                return result;
            },
            onClientClosed: (listener: () => void) => {
                call._emitter.on(ON_CLIENT_CLOSED_EVENT_NAME, listener);
                return result;
            },
            build: async () => {
                return call;
            }
        };
        return result;
    }

    public readonly id: string = uuidv4();
    private _emitter: EventEmitter = new EventEmitter();
    private _created: number = Date.now();
    private _closed: boolean = false;
    private _router?: Router;
    private _clients: Map<string, Client> = new Map();
    private _directTransport?: DirectTransport;
    private _directAudioConsumers: Map<string, Consumer> = new Map();
    private _transcriber?: Transcriber;
    private _activeSpeakerObserver?: ActiveSpeakerObserver;
    private constructor() {

    }

    public makeClient(clientId: string): ClientBuilder {
        const result = Client.builder()
            .setClientId(clientId)
            .setRouter(this._router!)
            .onProducerAdded(async (producerInfo: ProducerInfo) => {
                const { producerId, kind, userId } = producerInfo;
                logger.info(`Producer ${producerId} kind ${kind} for user ${userId} is added, consume message is broadcasted`);
                for (const client of this._clients.values()) {
                    if (client.id === clientId) continue;
                    client.consume(producerInfo).catch(err => {
                        logger.warn(`Error occurred while consuming ${producerId}`, err);
                    });
                }
                if (kind === "audio") {
                    this._transcribeProducer(producerInfo);
                }
            })
            .onClosed(() => {
                this._clients.delete(clientId);
                this._emitter.emit(ON_CLIENT_CLOSED_EVENT_NAME);
            });
        const _build = result.build;
        result.build = async () => {
            const client = await _build();
            this._clients.set(client.id, client);
            return client;
        }
        return result;
    }

    public get activeClientsNum(): number {
        return this._clients.size;
    }

    public *activeClients(): Generator<Client, any, undefined> {
        for (const client of this._clients.values()) {
            yield client;
        }
    }

    public get capabilities(): mediasoup.types.RtpCapabilities {
        return this._router!.rtpCapabilities;
    }

    public get created(): number {
        return this._created;
    }

    public get closed(): boolean {
        return this._closed;
    }

    public async close(): Promise<void> {
        if (this._closed) {
            logger.warn(`Attempted to close the call twice`);
            return Promise.resolve();
        }
        this._closed = true;
        logger.info(`Closing call`);
        for (const client of this._clients.values()) {
            if (client.closed) continue;
            try {
                await client.close();
            } catch (err) {
                logger.warn(`Error occurred while closing client ${client.id}`, err);
            }
        }
        if (this._directTransport && !this._directTransport.closed) {
            this._directTransport.close();
        }
        for (const directConsumer of this._directAudioConsumers.values()) {
            if (directConsumer.closed) continue;
            directConsumer.close();
        }
        if (this._transcriber && !this._transcriber.closed) {
            this._transcriber.close();
        }
    }

    public onTranscriptionEmitted(listener: TranscriptionListener): this {
        this._emitter.on(ON_TRANSCRIPTION_READY, listener);
        return this;
    }

    public offTranscriptionEmitted(listener: TranscriptionListener): this {
        this._emitter.off(ON_TRANSCRIPTION_READY, listener);
        return this;
    }

    public async _addTranscriber(payloadType: number, clockRate: number): Promise<void> {
        if (this._transcriber) {
            logger.warn(`Attempted to add transcriber twice`);
            return;
        }
        const speechConverter = await GoogleSpeechConverter.builder()
            .setLanguageCode("en-US")
            .build();
        // const payloadType = call._router!.rtpCapabilities.codecs!.filter(codecCapability => codecCapability.mimeType="audio/opus")[0].;
        const audioConverter = await OpusAudioConverter.builder()
            .withPayloadType(payloadType)
            .withClockRate(clockRate)
            .build();
        this._transcriber = await Transcriber.builder()
            .withAudioConverter(audioConverter)
            .withSpeechConverter(speechConverter)
            .onTranscriptionReady(transcription => {
                this._emitter.emit(ON_TRANSCRIPTION_READY, transcription);
                // this._transcriptions.push(transcription);
            })
            .build();
        logger.info(`Call ${this.id} added Transcriber`);
    }

    private async _addActiveSpeakerObserver(): Promise<void> {
        if (this._activeSpeakerObserver) {
            logger.warn(`Attempted to add active speaker observer twice`);
            return;
        }
        this._activeSpeakerObserver = await this._router!.createActiveSpeakerObserver({
            interval: activeSpeakerIntervalInMs,
        });
        this._activeSpeakerObserver!.on("dominantspeaker", ({ producer }) => {
            const { userId }: { userId: string } = producer.appData;
            const started: number = Date.now();
            const producerId: string = producer.id;
            const speaker: ActiveSpeakerSettings = {
                userId,
                producerId,
                started,
            }
            logger.info(`Active speaker of call ${this.id} is `, speaker);
            this._transcriber!.setActiveSpeaker(speaker);

            // let's pause every other direct consumer
            for (const directConsumer of this._directAudioConsumers.values()) {
                if (directConsumer.producerId === producerId) {
                    if (directConsumer.paused) {
                        directConsumer.resume();
                    }
                    continue;
                }
                if (!directConsumer.paused) {
                    directConsumer.pause();
                }
            }
        });
        logger.info(`Call ${this.id} added ActiveSpeakerObserver`);
    }

    private async _transcribeProducer(producerInfo: ProducerInfo): Promise<void> {
        const { producerId, kind, rtpParameters } = producerInfo;
        if (kind !== "audio") {
            logger.warn(`Attempted to consume a not audio producer`);
            return;
        }
        const { payloadType, clockRate } = rtpParameters.codecs[0];
        if (!this._transcriber) {
            await this._addTranscriber(payloadType, clockRate);
        }
        if (!this._activeSpeakerObserver) {
            await this._addActiveSpeakerObserver();
        }
        this._activeSpeakerObserver!.addProducer({
            producerId,
        });
        if (!this._directTransport) {
            this._directTransport = await this._router!.createDirectTransport();
        }
        const directConsumer = await this._directTransport!.consume({
            producerId,
            rtpCapabilities: this._router!.rtpCapabilities,
            paused: false
        });
        logger.info(`DirectConsumer (${directConsumer.id}) is created on transport ${this._directTransport!.id}`);
        directConsumer.on('rtp', rtpPacket => {
            this._transcriber!.receiveRtpPacket(producerId, rtpPacket);
        })
        directConsumer.observer.on("close", () => {
            this._directAudioConsumers.delete(directConsumer.id);
        });
        this._directAudioConsumers.set(directConsumer.id, directConsumer);
    }
}