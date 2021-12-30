import { Speech } from "./SpeechConverter";

export interface Builder {
    addWord(value: string): Builder;
    setDate(value: number): Builder;
    setUserId(value: string): Builder;
    build(): Transcription;
}

export type Transcription = {
    userId: string;
    text: string;
    date: number;
}

export function builder(): Builder {
    const words: string[] = [];
    let date: number = -1;
    let userId: string = "Unknown";
    const result = {
        addWord: (value: string) => {
            words.push(value);
            return result;
        },
        setDate: (value: number) => {
            date = value;
            return result;
        },
        setUserId: (value: string) => {
            userId = value;
            return result;
        },
        build: () => {
            const text = words.join(' ');
            return {
                date,
                text,
                userId,
            };
        }
    };
    return result;
}
