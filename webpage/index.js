const { EventEmitter } = require("events");
const { Device } = require("mediasoup-client");
const { v4: uuidv4 } = require("uuid");

const ON_CONSUMER_CREATED_EVENT_NAME = "ConsumerCreated";
const ON_CONSUMER_REMOVED_EVENT_NAME = "ConsumerRemoved";
const ON_TRANSCRIPTION_READY_EVENT_NAME = "TranscriptionReady";
class Comlink {
    static builder() {
        const comlink = new Comlink();
        const result = {
            withIceServerUrl: (iceServerUrl) => {
                client._iceServerUrl = iceServerUrl;
                return result;
            },
            withWebsocket: (ws) => {
                ws.onmessage = event => {
                    comlink._receive(event);
                }
                comlink._ws = ws;
                return result;
            },
            onConsumerCreated: (listener) => {
                comlink._emitter.on(ON_CONSUMER_CREATED_EVENT_NAME, listener);
                return result;
            },
            onConsumerRemoved: (listener) => {
                comlink._emitter.on(ON_CONSUMER_REMOVED_EVENT_NAME, listener);
                return result;
            },
            onTranscriptionReceived: (listener) => {
                comlink._emitter.on(ON_TRANSCRIPTION_READY_EVENT_NAME, listener)
                return result;
            },
            build: async () => {
                return new Promise(resolve => {
                    let tried = 0;
                    const createTimer = () => setTimeout(() => {
                        if (comlink._ws.readyState === WebSocket.OPEN) {
                            console.log("Websocket is connected");
                            resolve(comlink);
                        } else {
                            console.log("Connection is not ready. tried: ", ++tried);
                            createTimer();
                        }
                    }, 1000);
                    createTimer();
                });
            },
        };
        return result;
    }

    constructor() {
        this._emitter = new EventEmitter();
        this._requests = new Map();
        this._ws = null;
    }

    requestCapabilities() {
        return this._sendRequestAndPromise({
            messageType: "CapabilitiesRequest"
        });
    }

    requestCreateProducer({ kind, rtpParameters, userId }) {
        return this._sendRequestAndPromise({
            messageType: "CreateProducerRequest",
            payload: {
                kind,
                rtpParameters,
                userId,
            }
        });
    }

    requestPauseProducer({ producerId }) {
        return this._sendRequestAndPromise({
            messageType: "PauseProducerRequest",
            payload: {
                producerId,
            }
        });
    }

    requestResumeProducer({ producerId }) {
        return this._sendRequestAndPromise({
            messageType: "ResumeProducerRequest",
            payload: {
                producerId,
            }
        });
    }

    sendTransportConnectedNotification({ role, dtlsParameters }) {
        this._ws.send(JSON.stringify({
            messageType: "TransportConnected",
            payload: {
                role,
                dtlsParameters,
            }
        }));
    }

    sendRtpCapabilities({ rtpCapabilities }) {
        this._ws.send(JSON.stringify({
            messageType: "RtpCapabilities",
            payload: {
                rtpCapabilities,
            }
        }));
    }

    requestTransportInfo({ role }) {
        return this._sendRequestAndPromise({
            messageType: "TransportInfoRequest",
            payload: {
                role,
            }
        });
    }

    _receive(event) {
        let message;
        try {
            message = JSON.parse(event.data);
        } catch (err) {
            console.warn(`Cannot parse data ${event.data}`);
            return;
        }
        const { messageType, payload } = message;
        if (!messageType) {
            console.warn(`Undefined message type`);
            return;
        }
        if (0 < this._emitter.listenerCount(messageType)) {
            this._emitter.emit(messageType, payload);
            return;
        }
        if (!payload) {
            console.warn(`Cannot find listener for message type: ${messageType}`);
            return;
        }
        const { requestId, ...values } = payload;
        const resolve = this._requests.get(requestId);
        if (resolve) {
            const response = {...values};
            // console.warn(`resolve request with response`, response);
            resolve(response);
            return;
        }
        console.warn(`Cannot find listener for message type: ${messageType}`);
    }

    _sendRequestAndPromise({messageType, payload}) {
        const requestId = uuidv4();
        const message = JSON.stringify({
            messageType,
            payload: {
                requestId,
                ...payload,
            },
        });
        const promise = new Promise(resolve => {
            this._requests.set(requestId, (...args) => {
                resolve(...args);
            })
        });
        this._ws.send(message);
        return promise;
    }
}

const possibleUserIds = ['Alice', 'Bob', 'Eve', 'Oscar', 'Homer', 'Maggie', 'Bart']
const userId = possibleUserIds[Math.floor(Math.random() * possibleUserIds.length)];
document.querySelector("span#userId").textContent = userId;
// const iceServerUrl = "stun:stun.l.google.com:19302";
const iceServerUrl = "turn:turn.example.com:443?transport=tcp";
const roomId = "test";
const websocket = new WebSocket(`ws://localhost:5959?roomId=${roomId}&userId=${userId}`);
let rcvTransport;
let sndTransport;
const remoteStreams = new Map();
const consumers = new Map();
const producers = new Map();
async function main() {
    const comlink = await Comlink.builder()
        .withWebsocket(websocket)
        .onConsumerCreated(async ({
            clientId,
            consumerId,
            remoteProducerId,
            kind,
            rtpParameters,
            appData,
        }) => {
            console.warn(`Consumer is received ${consumerId} from client ${clientId}`, { clientId,
            consumerId,
            remoteProducerId,
            kind,
            rtpParameters,
            appData});
            const { userId } = appData;
            const consumer = await rcvTransport.consume({
                id: consumerId,
                producerId: remoteProducerId,
                kind,
                rtpParameters,
                appData,
            });
            consumers.set(consumer.id, consumer);
            const track = consumer.track;
            let remoteStream = remoteStreams.get(clientId);
            if (!remoteStream) {
                remoteStream = new MediaStream();
                remoteStreams.set(clientId, remoteStream);
                const article = document.createElement("article");
                article.setAttribute("id", clientId);
                const userElement = document.createElement("h3");
                userElement.textContent = "User: " + userId
                article.appendChild(userElement);
                document.querySelector(`section#remoteClients`).appendChild(article);
            }
            const article = document.querySelector(`section#remoteClients article[id='${clientId}']`);
            console.warn(article);
            if (track.kind === "audio") {
                remoteStream.addTrack(track);
            } else if (track.kind === "video") {
                remoteStream.addTrack(track);
                const video = document.createElement("video");
                video.setAttribute("width", 240);
                video.setAttribute("height", 120);
                video.setAttribute("autoplay", true);
                video.playsinline = true;
                video.controls = false;
                if ('srcObject' in video) video.srcObject = remoteStream;
                else video.src = URL.createObjectURL(remoteStream);
                article.appendChild(video);
            }
        })
        .onConsumerRemoved(({ consumerId }) => {
            const consumer = consumers.get(consumerId);
            const { clientId } = consumer.appData;
            const article = document.querySelector(`section#remoteClients article[id='${clientId}']`);
            document.querySelector(`section#remoteClients`).removeChild(article);
            if (!consumer.closed) {
                consumer.close();
            }
        })
        .onTranscriptionReceived(( payload ) => {
            console.log(`transcription`, payload);
            const { date: timestamp, userId, text} = payload;
            const date = new Date(timestamp);
            const ts = [
                ('0' + date.getHours()).slice(-2),
                ('0' + date.getMinutes()).slice(-2),
            ].join(":");
            const li = document.createElement("li");
            li.textContent = `${userId} [${ts}]: ${text}`;
            document.querySelector(`ul#transcriptions`).appendChild(li);
        })
        .build();
    const device = new Device();
    const { rtpCapabilities: routerRtpCapabilities } = await comlink.requestCapabilities();
    console.log(`Got routerCapabilities:`, routerRtpCapabilities);
    await device.load({ routerRtpCapabilities });
    console.log("Device is loaded", device.loaded, device.rtpCapabilities);
    comlink.sendRtpCapabilities({
        rtpCapabilities: device.rtpCapabilities,
    });
    const sndTransportInfo = Object.assign(await comlink.requestTransportInfo({
            role: "producers",
        }),
        { 
            iceServers: [{
                urls : ['turn:turn.example.com:443?transport=tcp'],
                username   : 'example',
                credential : 'example'
            }],
        }
        // { iceServers: [{ urls: iceServerUrl }] }
    );
    console.log(`sndTransportInfo`, sndTransportInfo);
    sndTransport = device.createSendTransport(sndTransportInfo);
    console.log(`sndTransport ${sndTransport.id} is created`, sndTransport);
    sndTransport.on("connect", async ({ dtlsParameters }, callback, errback) => {
        await comlink.sendTransportConnectedNotification({
            role: "producers",
            dtlsParameters
        });
        callback();
    });
    sndTransport.on("produce", async ({ kind, rtpParameters, appData }, callback, errback) => {
        try {
            const { userId } = appData;
            const { producerId } = await comlink.requestCreateProducer({
                kind,
                rtpParameters,
                userId,
            });
            callback({ id: producerId });
        } catch (err) {
            errback(err);
        }
    });
    const rcvTransportInfo = Object.assign(await comlink.requestTransportInfo({
            role: "consumers",
        }), 
        { 
            iceServers: [{
                urls : ['turn:turn.example.com:443?transport=tcp'],
                username   : 'example',
                credential : 'example'
            }],
        }
    );
    
    rcvTransport = device.createRecvTransport(rcvTransportInfo);
    console.log(`rcvTransport ${rcvTransport.id} is created`, rcvTransport);
    rcvTransport.on("connect", async ({ dtlsParameters }, callback, errback) => {
        await comlink.sendTransportConnectedNotification({
            role: "consumers",
            dtlsParameters
        });
        callback();
    });

    const localStream = await navigator.mediaDevices.getUserMedia({'video':true,'audio':true});
    console.log('Got MediaStream:', localStream, localStream.getTracks());
    const videoElement = document.querySelector('video#localVideo');
    videoElement.srcObject = localStream;
    localStream.getTracks().forEach(async track => {
        const codec = track.kind !== "audio" ? undefined : {
            kind: "audio",

        };
        try {
            const producer = await sndTransport.produce({
                track,
                appData: {
                    userId,
                },
                // codec,
            });
            producers.set(producer.id, producer);
            const li = document.createElement("li");
            li.textContent = `${track.kind}: ${track.label}`
            document.querySelector(`ul#lablels`).appendChild(li);
        } catch (err) {
            console.warn(err);
        }
    });
    const audioController = document.querySelector(`button[id='audioController']`);
    let muted = false;
    audioController.onclick = async () => {
        const audioProducers = Array.from(producers.values())
            .filter(producer => producer.kind === "audio");
        if (audioProducers.length < 1) {
            console.warn("There is no audio producer to mute");
            return;
        }
        audioController.disabled = true;
        try {
            let promises = [];
            if (muted) {
                promises = audioProducers.map(producer => {
                    return comlink.requestResumeProducer({ producerId: producer.id });
                });
            } else {
                promises = audioProducers.map(producer => {
                    return comlink.requestPauseProducer({ producerId: producer.id });
                });
            }
            await Promise.all(promises);
            muted = !muted;
            audioController.innerHTML = muted ? "UnMute" : "Mute";
        } catch (err) {
            console.error("Error occurred while mute / unmute audio", err);
        } finally {
            audioController.disabled = false;
        }
    };
    console.log("Audio Controller is initialized");
    const videoController = document.querySelector(`button[id='videoController']`);
    let paused = false;
    videoController.onclick = async () => {
        const videoProducers = Array.from(producers.values())
            .filter(producer => producer.kind === "video");
        if (videoProducers.length < 1) {
            console.warn("There is no audio producer to mute");
            return;
        }
        videoController.disabled = true;
        try {
            let promises = [];
            if (paused) {
                promises = videoProducers.map(producer => {
                    return comlink.requestResumeProducer({ producerId: producer.id });
                });
            } else {
                promises = videoProducers.map(producer => {
                    return comlink.requestPauseProducer({ producerId: producer.id });
                });
            }
            await Promise.all(promises);
            paused = !paused;
            videoController.innerHTML = paused ? "Resume" : "Pause";
        } catch (err) {
            console.error("Error occurred while pause / resume video", err);
        } finally {
            videoController.disabled = false;
        }
    }
    console.log("Video Controller is initialized");
}

main();
