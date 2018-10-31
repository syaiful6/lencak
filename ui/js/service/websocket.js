export function getWebsocketURL() {
  //let host = location.host;
  let wsp = location.protocol === 'https' ? 'wss' : 'ws';
  return `${wsp}://${location.hostname}:9056/ws`;
}

function generateEvent(s, args) {
  const evt = document.createEvent("CustomEvent");
  evt.initCustomEvent(s, false, false, args);
  return evt;
}

export function ReconnWebsocket(url, protocols, options) {
  if (!(this instanceof ReconnWebsocket)) return new ReconnWebsocket(url, protocols, options);
  // Default settings
  let settings = {
    debug: false,
    automaticOpen: true,
    reconnectInterval: 1000,
    maxReconnectInterval: 30000,
    reconnectDecay: 1.5,
    timeoutInterval: 2000,
    maxReconnectAttempts: null,
    binaryType: 'blob'
  };

  if (!options) { options = {}; }
  // Overwrite and define settings with options if they exist.
  for (var key in settings) {
    if (typeof options[key] !== 'undefined') {
      this[key] = options[key];
    } else {
      this[key] = settings[key];
    }
  }

  this.url = url;
  this.reconnectAttempts = 0;
  this.protocol = null;

  let self = this;
  let ws;
  let forcedClose = false;
  let timedOut = false;
  let eventTarget = document.createElement('div');

  eventTarget.addEventListener('open',       function(event) { self.onopen(event); });
  eventTarget.addEventListener('close',      function(event) { self.onclose(event); });
  eventTarget.addEventListener('connecting', function(event) { self.onconnecting(event); });
  eventTarget.addEventListener('message',    function(event) { self.onmessage(event); });
  eventTarget.addEventListener('error',      function(event) { self.onerror(event); });

  // so it look like EventTarget
  this.addEventListener = eventTarget.addEventListener.bind(eventTarget);
  this.removeEventListener = eventTarget.removeEventListener.bind(eventTarget);
  this.dispatchEvent = eventTarget.dispatchEvent.bind(eventTarget);

  this.open = function (reconnectAttempt) {
    ws = new WebSocket(self.url, protocols || []);
    ws.binaryType = this.binaryType;

    if (reconnectAttempt) {
      if (this.maxReconnectAttempts && this.reconnectAttempts > this.maxReconnectAttempts) {
        return;
      }
    } else {
      eventTarget.dispatchEvent(generateEvent('connecting'));
      this.reconnectAttempts = 0;
    }

    if (self.debug || ReconnWebsocket.debugAll) {
      console.debug('ReconnWebsocket', 'attempt-connect', self.url);
    }

    var localWs = ws;
    var timeout = setTimeout(function() {
      if (self.debug || ReconnWebsocket.debugAll) {
        console.debug('ReconnWebsocket', 'connection-timeout', self.url);
      }
      timedOut = true;
      localWs.close();
      timedOut = false;
    }, self.timeoutInterval);

    ws.onopen = function(event) {
      clearTimeout(timeout);
      if (self.debug || ReconnWebsocket.debugAll) {
          console.debug('ReconnWebsocket', 'onopen', self.url);
      }
      self.protocol = ws.protocol;
      self.readyState = WebSocket.OPEN;
      self.reconnectAttempts = 0;
      var e = generateEvent('open');
      e.isReconnect = reconnectAttempt;
      reconnectAttempt = false;
      eventTarget.dispatchEvent(e);
    };

    ws.onclose = function(event) {
      clearTimeout(timeout);
      ws = null;
      if (forcedClose) {
        self.readyState = WebSocket.CLOSED;
        eventTarget.dispatchEvent(generateEvent('close'));
      } else {
        self.readyState = WebSocket.CONNECTING;
        var e = generateEvent('connecting');
        e.code = event.code;
        e.reason = event.reason;
        e.wasClean = event.wasClean;
        eventTarget.dispatchEvent(e);
        if (!reconnectAttempt && !timedOut) {
          if (self.debug || ReconnWebsocket.debugAll) {
            console.debug('ReconnWebsocket', 'onclose', self.url);
          }
          eventTarget.dispatchEvent(generateEvent('close'));
        }

        var timeout = self.reconnectInterval * Math.pow(self.reconnectDecay, self.reconnectAttempts);
        setTimeout(function() {
          self.reconnectAttempts++;
          self.open(true);
        }, timeout > self.maxReconnectInterval ? self.maxReconnectInterval : timeout);
      }
    };
    ws.onmessage = function(event) {
      if (self.debug || ReconnWebsocket.debugAll) {
        console.debug('ReconnWebsocket', 'onmessage', self.url, event.data);
      }
      var e = generateEvent('message');
      e.data = event.data;
      eventTarget.dispatchEvent(e);
    };
    ws.onerror = function(event) {
      if (self.debug || ReconnWebsocket.debugAll) {
        console.debug('ReconnWebsocket', 'onerror', self.url, event);
      }
      eventTarget.dispatchEvent(generateEvent('error'));
    };
  }

  // Whether or not to create a websocket upon instantiation
  if (this.automaticOpen == true) {
    this.open(false);
  }

  this.send = function(data) {
    if (ws) {
      if (self.debug || ReconnWebsocket.debugAll) {
        console.debug('ReconnWebsocket', 'send', self.url, data);
      }
      return ws.send(data);
    } else {
      throw new Error('INVALID_STATE_ERR : Pausing to reconnect websocket');
    }
  };

  this.close = function(code, reason) {
    // Default CLOSE_NORMAL code
    if (typeof code == 'undefined') {
      code = 1000;
    }
    forcedClose = true;
    if (ws) {
      ws.close(code, reason);
    }
  };

  this.refresh = function() {
    if (ws) {
      ws.close();
    }
  };
}

ReconnWebsocket.prototype.onopen = function(event) {};
ReconnWebsocket.prototype.onclose = function(event) {};
ReconnWebsocket.prototype.onconnecting = function(event) {};
ReconnWebsocket.prototype.onmessage = function(event) {};
ReconnWebsocket.prototype.onerror = function(event) {};
ReconnWebsocket.debugAll = false;
ReconnWebsocket.CONNECTING = WebSocket.CONNECTING;
ReconnWebsocket.OPEN = WebSocket.OPEN;
ReconnWebsocket.CLOSING = WebSocket.CLOSING;
ReconnWebsocket.CLOSED = WebSocket.CLOSED;
