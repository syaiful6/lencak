import m from 'mithril';
import stream from 'mithril/stream'

import {ReconnWebsocket, getWebsocketURL} from './service/websocket';
import {
  START_TASK, STOP_TASK, CONNECTED, DISCONNECTED, WORKSPACE_INIT, SERVER_MESSAGE,
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
socket.onmessage = (ev) => send({ type: SERVER_MESSAGE, payload: { data: ev.data }});

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
      socket.send(buildCommand('tstart', [
        msg.payload.workspace,
        msg.payload.task,
        typeof msg.payload.service !== 'boolean' ? 0 : msg.payload.service ? 1 : 0
      ]))

      return Object.assign({}, model, {
        workspaces: updateTaskWith(model.workspaces, msg.payload.workspace,
          msg.payload.task, () => ({status: 'Running', service: msg.payload.service }))
      })

    case STOP_TASK:
      socket.send(buildCommand('tstop', [
        msg.payload.workspace,
        msg.payload.task,
        typeof msg.payload.service !== 'boolean' ? 0 : msg.payload.service ? 1 : 0
      ]));

     return Object.assign({}, model, {
        workspaces: updateTaskWith(model.workspaces, msg.payload.workspace,
          msg.payload.task, () => ({status: 'Stopped', service: msg.payload.service }))
      })

    case CONNECTED:
      return Object.assign({}, model, {
        connection: SOCK_CONNECTED
      });

    case DISCONNECTED:
      return Object.assign({}, model, {
        connection: SOCK_DISCONNECT
      });

    case WORKSPACE_INIT:
      return Object.assign({}, model, {
        workspaces: msg.payload.workspaces
      })

    case SERVER_MESSAGE:
      return model

    case REFRESH_CONN:
      socket.refresh();
      return model;

    default:
      return model;
  }
}

function parseRawWorkspace(workspaces) {
  return
  // try {
  //   return JSON.parse(workspaces);
  // } catch (e) {
  //   return;
  // }
}

function buildCommand(cmd, args) {
  const len = args.length
  let commandStr = '*' + (len + 1) + '\r\n$' + cmd.length + '\r\n' + cmd + '\r\n';
  let result = commandStr
  for (let i = 0; i < len; i++) {
    result += '$' + ('' + args[i]).length + '\r\n' + args[i] + '\r\n'
  }
  return result;
}
