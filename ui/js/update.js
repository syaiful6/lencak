import m from 'mithril';
import stream from 'mithril/stream'

import {ReconnWebsocket, getWebsocketURL} from './service/websocket';
import {
  START_TASK, STOP_TASK, CONNECTED, DISCONNECTED, WORKSPACE_REPLACE,
  SOCK_DISCONNECT, SOCK_CONNECTED, REFRESH_CONN
} from './constant'

export const send = stream();
export const model = stream.scan(
  update,
  {workspaces: {}, connection: SOCK_DISCONNECT},
  send
);

model.map(() => m.redraw())

const socket = new ReconnWebsocket(getWebsocketURL())

socket.onopen = () => send({type: CONNECTED });
socket.onclose = () => send({type: DISCONNECTED });
socket.onmessage = (ev) => send({ type: WORKSPACE_REPLACE, payload: { data: ev.data }});

function updateTaskWith(workspaces, workspaceid, taskid, f) {
  return Object.assign({}, workspaces, {
    [workspaceid]: Object.assign({}, workspaces[workspaceid], {
      tasks: Object.assign({}, workspaces[workspaceid].tasks, {
        [taskid]: Object.assign({}, workspaces[workspaceid].tasks[taskid], f(workspaces[workspaceid].tasks[taskid]))
      })
    })
  })
}

function update(model, msg) {
  let data, task;
  console.log(msg)
  switch (msg.type) {
    case START_TASK:
      socket.send(JSON.stringify({
        workspace: msg.payload.workspace,
        task: msg.payload.task,
        service: typeof msg.payload.service !== 'boolean' ? false : msg.payload.service,
        command: 'start'
      }));

      return Object.assign({}, model, {
        workspaces: updateTaskWith(model.workspaces, msg.payload.workspace,
          msg.payload.task, () => ({status: 'Running'}))
      })

    case STOP_TASK:
      socket.send(JSON.stringify({
        workspace: msg.payload.workspace,
        task: msg.payload.task,
        service: typeof msg.payload.service !== 'boolean' ? false : msg.payload.service,
        command: 'stop'
      }));
     return Object.assign({}, model, {
        workspaces: updateTaskWith(model.workspaces, msg.payload.workspace,
          msg.payload.task, () => ({status: 'Stopped'}))
      })

    case CONNECTED:
      socket.send(`*4\r\n$6\r\ntstart\r\n$6\r\nlencak\r\n$2\r\nui\r\n:1\r\n`)
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

    case REFRESH_CONN:
      socket.refresh();
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
