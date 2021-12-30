export class Queue<T = any> {
    public static from<U =any>(items: U[]): Queue<U> {
        const queue: Queue<U> = new Queue<U>();
        for (const item of items) {
            queue.push(item);
        }
        return queue;
    }
    private _items: any = {};
    private _head: number = 0;
    private _tail: number = 0;

    public push(item: T): void {
        this._items[this._tail] = item;
        ++this._tail;
    }

    public pushAll(...items: T[]): void {
        for (const item of items) {
            this.push(item);
        }
    }
  
    public popFirst(): T | undefined {
        if (this._tail <= this._head) {
            return undefined;
        }
        const item = this._items[this._head] as T;
        delete this._items[this._head];
        ++this._head;
        return item;
    }
  
    peekFirst(): T | undefined {
        if (this._tail <= this._head) {
            return undefined;
        }
        return this._items[this._head] as T;
    }

    peekLast(): T | undefined {
        if (this._tail <= this._head) {
            return undefined;
        }
        return this._items[this._tail - 1] as T;
    }

    get length(): number {
        return this._tail - this._head;
    }
  
    get isEmpty(): boolean {
        return this._tail === this._head;
    }
}