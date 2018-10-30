import m from 'mithril';
import stream from 'mithril/stream'

import {createWebsocket} from './service/websocket';
import {
  START_TASK, STOP_TASK, CONNECTED, DISCONNECTED, WORKSPACE_REPLACE,
  SOCK_DISCONNECT, SOCK_CONNECTED
} from './constant'

export const send = stream();
export const model = stream.scan(
  update,
  {workspaces: {}, connection: SOCK_DISCONNECT},
  send
);

model.map(() => m.redraw())

const handler = {
  onopen: () => send({type: CONNECTED }),
  onclose: () => send({type: DISCONNECTED }),
  onmessage: (ev) => send({ type: WORKSPACE_REPLACE, payload: { data: ev.data }}),
};
const socket = createWebsocket(handler);

function update(model, msg) {
  let data;
  console.log(msg)
  switch (msg.type) {
    case START_TASK:
      socket.send(JSON.stringify({
        workspace: msg.payload.workspace,
        task: msg.payload.task,
        service: typeof msg.payload.service !== 'boolean' ? false : msg.payload.service,
        command: 'start'
      }));
      return model;

    case STOP_TASK:
      socket.send(JSON.stringify({
        workspace: msg.payload.workspace,
        task: msg.payload.task,
        service: typeof msg.payload.service !== 'boolean' ? false : msg.payload.service,
        command: 'stop'
      }));
      return model;

    case CONNECTED:
      return Object.assign({}, model, {
        connection: SOCK_CONNECTED
      });

    case DISCONNECTED:
      return Object.assign({}, model, {
        connection: SOCK_DISCONNECT
      });

    case WORKSPACE_REPLACE:
      data = parseRawWorkspace(msg.payload.data);
      if (data) {
        return Object.assign({}, model, {
          workspaces: data
        });
      }
      return model;

    default:
      return model;
  }
}

function parseRawWorkspace(workspaces) {
  try {
    return JSON.parse(workspaces);
  } catch (e) {
    return;
  }
}
