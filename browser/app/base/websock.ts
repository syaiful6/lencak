import {Buffer} from 'buffer';
import {scheduler} from '@jonggrang/task'
import {Duplex, DuplexOptions} from 'readable-stream';

export type WebSockOptions = DuplexOptions & {
  reconnectInterval?: number;
  maxReconnectInterval?: number;
  reconnectDecay?: number;
  timeoutInterval?: number;
  maxReconnectAttempts?: number;
}

interface EventHandler {
  (ev: Event): void;
}

function noop() {}

export class WebSock extends Duplex {
  public reconnectInterval: number;
  public maxReconnectInterval: number;
  public reconnectDecay: number;
  public timeoutInterval: number;
  public maxReconnectAttempts: number | null;
  public readyState: number;
  public reconnectAttempts: number;
  public protocol: string;

  private timeout: any;
  private wsProtocols?: string | string[];
  private wsURL: string;
  private ws: WebSocket | null;
  private wsonopen: EventHandler;
  private wsonclose: (ev: CloseEvent) => void;
  private wsonmessage: (ev: MessageEvent) => void;;
  private wsonerror: EventHandler;

  constructor(options?: WebSockOptions) {
    super(options)
    const opts :WebSockOptions = options || {};
    this.reconnectInterval = opts.reconnectInterval || 1000;
    this.maxReconnectInterval = opts.maxReconnectInterval || 30000;
    this.reconnectDecay = opts.reconnectDecay || 1.5;
    this.timeoutInterval = opts.timeoutInterval || 2000;
    this.maxReconnectAttempts = opts.maxReconnectAttempts || null;

    this.readyState = WebSocket.CONNECTING;
    this.protocol = '';
    this.ws = null;
    this.wsonopen = noop;
    this.wsonclose = noop;
    this.wsonmessage = noop;
    this.wsonerror = noop;

    this.wsProtocols = undefined;
    this.wsURL = '';
    this.timeout = null;

    this.reconnectAttempts = 0;
  }

  connect(url: string, protocols?: string | string[]) {
    this.wsURL = url;
    this.wsProtocols = protocols;
    this._openWs(false);
  }

  _openWs(reconnectAttempt: boolean) {
    if (reconnectAttempt) {
      if (this.maxReconnectAttempts && this.reconnectAttempts > this.maxReconnectAttempts) {
        this.emit('close');
        return;
      }
    }
    let ws = new WebSocket(this.wsURL, this.wsProtocols);
    ws.binaryType = 'arraybuffer';

    this.timeout = setTimeout(() => {
      this.timeout = true;
      ws.close();
      this.timeout = false;
    }, this.timeoutInterval);

    this._setInternalState(ws);
  }

  _resetInternalState() {
    this.ws = null;
    this.wsonopen = noop;
    this.wsonclose = noop;
    this.wsonmessage = noop;
    this.wsonerror = noop;
  }

  _setInternalState(ws: WebSocket) {
    this.ws = ws;
    this.wsonopen = this._wsOnOpen.bind(this);
    ws.addEventListener('open', this.wsonopen);

    this.wsonclose = this._wsOnClose.bind(this);
    ws.addEventListener('close', this.wsonclose);

    this.wsonmessage = this._wsOnMessage.bind(this);
    ws.addEventListener('message', this.wsonmessage);
  }

  _wsOnOpen() {
    clearTimeout(this.timeout);
    if (!this.ws) return;
    this.protocol = this.ws.protocol;
    this.readyState = WebSocket.OPEN;
    this.reconnectAttempts = 0;

    this.emit('connected');
  }

  _wsOnClose(ev: CloseEvent) {
    clearTimeout(this.timeout);
    if (!this.ws) return;

    this._dispose();

    let timeout = this.reconnectInterval * Math.pow(this.reconnectDecay, this.reconnectAttempts);
    setTimeout(() => {
      this.reconnectAttempts++;
      this._openWs(true);
    }, timeout > this.maxReconnectInterval ? this.maxReconnectInterval : timeout);
  }

  _wsOnMessage(ev: MessageEvent) {
    const data = ev.data;
    if (typeof data === 'string') {
      let ret = this.push(Buffer.from(data, 'utf-8'));
      if (!ret && this.ws) {
        this.ws.removeEventListener('message', this.wsonmessage);
        this.wsonmessage = noop;
      }
    } else {
      let ret = this.push(Buffer.from(data));
      if (!ret && this.ws) {
        this.ws.removeEventListener('message', this.wsonmessage);
        this.wsonmessage = noop;
      }
    }
  }

  _read() {
    if (this.wsonmessage === noop && this.ws) {
      this.wsonmessage = this._wsOnMessage.bind(this);
      this.ws.addEventListener('message', this._wsOnMessage);
    }
  }

  _write(chunk: any, encoding: "ascii" | "utf8" | "utf-8" | "utf16le" | "ucs2" | "ucs-2" | "base64" | "latin1" | "binary" | "hex", callback: (error?: Error | null) => void): void {
    if (!this.ws || (this.ws && this.ws.readyState !== WebSocket.OPEN)) {
      callback(new Error('writing in closed state'));
      return
    }

    if (typeof chunk === 'string') {
      chunk = Buffer.from(chunk, encoding);
    }
    if (!Buffer.isBuffer(chunk) && callback) {
      callback(new Error('invalid chunk'));
      return
    }

    this.ws.send((chunk as any).buffer);
    callback();
  }

  _writev(chunks: Array<{ chunk: any, encoding: string }>, callback: (error?: Error | null) => void) {
    if (!this.ws || (this.ws && this.ws.readyState !== WebSocket.OPEN)) {
      callback(new Error('writing in closed state'));
      return
    }
    let len = 0;
    let buffers: Buffer[] = [];
    for (let i = 0, len = chunks.length; i < len; i++) {
      let item = chunks[i];
      let buf = item.chunk;
      if (typeof buf === 'string') {
        buf = Buffer.from(item.chunk, item.encoding as any);
      }
      if (!Buffer.isBuffer(buf) && callback) {
        callback(new Error('invalid chunk'));
        return
      }
      buffers.push(buf);
      len += Buffer.byteLength(buf);
    }
    let data = Buffer.concat(buffers, len);
    this.ws.send((data as any).buffer);
  }

  _destroy(error: Error | null, callback: (error: Error | null) => void) {
    const ws = this.ws;
    if (ws) scheduler.enqueue(() => ws.close());
    this._dispose();
    callback(null);
  }

  _dispose() {
    if (!this.ws) return;
    const ws = this.ws;
    ws.removeEventListener('open', this.wsonopen);
    ws.removeEventListener('close', this.wsonclose);
    ws.removeEventListener('message', this.wsonmessage);
    ws.removeEventListener('error', this.wsonerror);

    this._resetInternalState();
  }
}
