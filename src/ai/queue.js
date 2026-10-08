import { ServiceError } from './errors.js';

// Queue contract: submit(workerTask, {signal}); a broker adapter can replace it.
export class BoundedQueue {
  constructor({ concurrency = 2, capacity = 20 } = {}) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32 || !Number.isInteger(capacity) || capacity < 0 || capacity > 1000) throw new ServiceError('AI_INVALID_CONFIG');
    this.concurrency = concurrency; this.capacity = capacity;
    this.running = 0; this.pending = []; this.closed = false;
  }
  submit(task, { signal }) {
    if (this.closed || signal.aborted) return Promise.reject(new ServiceError('AI_TIMEOUT'));
    if (this.running >= this.concurrency && this.pending.length >= this.capacity) return Promise.reject(new ServiceError('AI_OVERLOADED'));
    return new Promise((resolve, reject) => {
      const item = { task, signal, resolve, reject, started: false };
      item.abort = () => {
        if (!item.started) this.pending = this.pending.filter(job => job !== item);
        reject(new ServiceError('AI_TIMEOUT'));
        if (!item.started) signal.removeEventListener('abort', item.abort);
      };
      signal.addEventListener('abort', item.abort, { once: true });
      this.pending.push(item); this.drain();
    });
  }
  drain() {
    while (!this.closed && this.running < this.concurrency && this.pending.length) {
      const item = this.pending.shift();
      item.started = true; this.running++;
      Promise.resolve().then(() => {
        if (item.signal.aborted) throw new ServiceError('AI_TIMEOUT');
        return item.task(item.signal);
      }).then(item.resolve, item.reject).finally(() => {
        item.signal.removeEventListener('abort', item.abort);
        item.task = undefined; this.running--; this.drain();
      });
    }
  }
  close() {
    this.closed = true;
    for (const item of this.pending.splice(0)) {
      item.signal.removeEventListener('abort', item.abort);
      item.reject(new ServiceError('AI_OVERLOADED'));
    }
  }
}
