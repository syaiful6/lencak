import m from 'mithril'
import { Button, List, Dialog, ListTile, Icon, SVG, Toolbar, ToolbarTitle } from 'polythene-mithril';

import {STOP_TASK, START_TASK} from '../constant';

function percentActive(active, total) {
  return (active / total) * 100
}

const workspacesIcons = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="#00e0ff" d="M495.611 231H398v-30h60.389l-13.478-62H428v-30h41.089z"/><path fill="#ff6a00" d="M180 429v-42h-30v42H90v53h30v-23h30v23h30v-23h30v23h30v-53z"/><path fill="#ff3a00" d="M180 429v-42h-15v95h15v-23h30v23h30v-53z"/><path fill="#ffab00" d="M98 378H24v-74h30v44h44z"/><path d="M512 512H272V281h240v231z" fill="#ffae33"/><path d="M512 512H371V281h141v231z" fill="#ff9800"/><path d="M512 311H230v-80h282v80z" fill="#d37300"/><g fill="#606060"><circle cx="165" cy="497" r="15"/><circle cx="105" cy="497" r="15"/></g><path d="M377 192h-15V0h15c35.841 0 65 29.159 65 65v62c0 35.841-29.159 65-65 65z" fill="#009af2"/><path fill="#8f4b00" d="M371 231h141v80H371z"/><g fill="#404040"><circle cx="225" cy="497" r="15"/><path d="M165 482v30c8.284 0 15-6.716 15-15s-6.716-15-15-15z"/></g><path d="M215 352h-82.735C86.904 352 50 315.096 50 269.735V235h110c30.327 0 55 24.673 55 55v62zM80 265v4.735C80 298.554 103.446 322 132.265 322H185v-32c0-13.785-11.215-25-25-25H80z" fill="#ff6a00"/><g fill="#ff3a00"><path d="M165 235.238v30.266c11.397 2.323 20 12.424 20 24.497v32h-20v30h50v-62c0-28.642-22.009-52.228-50-54.763z"/><path d="M250 402H80v-35c0-24.813 20.187-45 45-45h80c24.813 0 45 20.187 45 45v35z"/></g><path d="M250 367c0-24.813-20.187-45-45-45h-40v80h85v-35z" fill="#e20004"/><path d="M35 311H0V111h35c24.813 0 45 20.187 45 45v110c0 24.813-20.187 45-45 45z" fill="#ff3a00"/></svg>`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="#009af2" d="M121.024 0h29.994v44.991h-29.994z"/><path fill="#0078eb" d="M360.974 0h29.994v44.991h-29.994z"/><path d="M136.025 144.969c-27.564 0-49.989-22.425-49.989-49.989V79.983h99.979V94.98c0 27.564-22.426 49.989-49.99 49.989z" fill="#ffda63"/><path d="M375.975 144.969c-27.564 0-49.989-22.425-49.989-49.989V79.983h99.979V94.98c-.001 27.564-22.426 49.989-49.99 49.989z" fill="#ffca00"/><path d="M80.037 511.892H.054V280.941h79.983v230.951z" fill="#ff3a00"/><path d="M511.946 511.892h-79.983V280.941h79.983v230.951z" fill="#e20004"/><path d="M511.946 310.934H.054v-79.983h511.892v79.983z" fill="#ff6a00"/><path fill="#ff3a00" d="M255.996 230.951h255.946v79.983H255.996z"/><path d="M237.217 109.977H34.834l79.983-79.983h42.418l79.982 79.983z" fill="#ffab00"/><path d="M477.166 109.977H274.783l79.983-79.983h42.418l79.982 79.983z" fill="#ff6a00"/><path d="M236.004 330.93H96.034V170.964h139.97V330.93z" fill="#8f4b00"/><path d="M415.966 330.93h-139.97V170.964h139.97V330.93z" fill="#462100"/><path fill="#d37300" d="M226.047 512l-8.969-121.082H114.96L105.991 512l-29.912-2.215 11.027-148.861h157.826l11.027 148.861z"/><path fill="#8f4b00" d="M406.009 512l-8.969-121.082H294.922L285.953 512l-29.912-2.215 11.027-148.861h157.826l11.027 148.861z"/><g fill="#ff6a00"><path d="M285.99 315.933h29.994v59.987H285.99zM375.971 315.933h29.994v59.987h-29.994z"/></g><g fill="#ffab00"><path d="M106.028 315.933h29.994v59.987h-29.994zM196.009 315.933h29.994v59.987h-29.994z"/></g></svg>`,
];

const TaskListTile = {
  view({ attrs }) {
    const {workspace, task, sender} = attrs;
    const running = task.status === 'Running';
    return m(ListTile, {
      style: {
        background: running ? '#E0FFE6' : '#FFF1F0'
      },
      title: task.name,
      subtitle: task.command,
      key: task.name,
      front: m(Icon, m(SVG, m.trust(workspacesIcons[1]))),
      hoverable: true,
      events: {
        onclick: () => Dialog.show(this.buildDialogFor(workspace, task, sender))
      }
    })
  },

  buildDialogFor(workspace, task, sender) {
    return {
      header: m(Toolbar, {
        style: {
          background: '#48B7C7',
          color: '#fff'
        },
      }, [
        m(ToolbarTitle, { text: task.name }),
      ]),
      body: "Body",
      footerButtons: [
        m(Button, {
          label: task.service ? 'Disable' : 'Enable',
          style: {
            background: task.service ? '#FF6559' : '#4DDD66',
            color: '#fff'
          },
          events: {
            onclick: () => {
              sender({
                type: task.service ? STOP_TASK : START_TASK,
                payload: {
                  workspace: workspace.name,
                  task: task.name,
                  service: task.service ? false : true,
                }
              })
            }
          }
        }),
        m(Button, {
          label: task.status === 'Running' ? 'Stop' : 'Restart',
          style: {
            background: task.status === 'Running' ? '#FF6559' : '#4DDD66',
            color: '#fff'
          },
          events: {
            onclick: () => {
              sender({
                type: task.status === 'Running' ? STOP_TASK : START_TASK,
                payload: {
                  workspace: workspace.name,
                  task: task.name,
                  service: task.service
                }
              })
            }
          }
        })
      ],
    }
  }
}

export default {
  view({ attrs }) {
    const workspace = attrs.workspace;

    return m('.workspace', [
      m(List, {
        header: {
          title: workspace.name,
        },
        border: true,
        tiles: Object.keys(workspace.tasks).map(key =>
          m(TaskListTile, {
            workspace, task: workspace.tasks[key],
            sender: attrs.sender
          })
        ),
      })
    ])
  }
}
