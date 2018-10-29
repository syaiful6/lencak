function getWebsocketURL() {
  var host = location.hostname;
  var wsp = location.protocol === 'https' ? 'wss' : 'ws';
  return `${wsp}://${host}:9056/ws`;
}

export function createWebsocket(handler) {
  let socket = new WebSocket(getWebsocketURL());
  socket.onopen = onopen;
  socket.onclose = onclose;
  socket.onmessage = onmessage;
  socket.onerror = onerror;

  function onopen(evt) {
    if (typeof handler.onopen === 'function') {
      handler.onopen(evt)
    }
  };

  function onclose(evt) {
    if (typeof handler.onclose === 'function') {
      handler.onclose(evt)
    }
    // reconnect
    socket = new WebSocket(getWebsocketURL());
    socket.onopen = onopen;
    socket.onclose = onclose;
    socket.onmessage = onmessage;
    socket.onerror = onerror;
  };

  function onmessage(evt) {
    if (typeof handler.onmessage === 'function') {
      handler.onmessage(evt)
    }
  };

  function onerror(evt) {
    if (typeof handler.onerror === 'function') {
      handler.onerror(evt)
    }
  }

  return {
    send(data) { return socket.send(data) }
  }
}
