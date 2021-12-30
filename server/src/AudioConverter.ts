
export interface AudioConverter {
    onWavBuffered(listener: (buffer: Uint8Array) => void): this;
    receive(rtpPacket: Uint8Array): void;
    closed: boolean;
    close(): Promise<void>;
}