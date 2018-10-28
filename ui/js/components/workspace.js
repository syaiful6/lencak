import m from 'mithril'

function percentActive(active, total) {
  return (active / total) * 100
}

export default {
  view(vnode) {
    const ws = vnode.attrs.workspace;
    var active = percentActive(ws.active_tasks, ws.total_tasks)
    return m('.workspace.panel.panel-default', [
      m('.panel-heading', [
        m('.progress.pull-right', {style: 'width: 45%'}, [
          m('.progress-bar.progress-bar-success', {
            role: "progressbar",
            "aria-valuenow": ws.active_tasks,
            "aria-valuemin": 0,
            "aria-valuemax": ws.total_tasks,
            "style": "width: " + active + '%'
          },
            m('span', ws.active_tasks),
          ),
          m('.progress-bar.progress-bar-danger', {
            role: "progressbar",
            "aria-valuenow": ws.inactive_tasks,
            "aria-valuemin": 0,
            "aria-valuemax": ws.total_tasks,
            "style": "width: " + (100 - active) + '%'
          },
            m('span', ws.inactive_tasks),
          ),
        ]),
        m('h2', {style: 'display:inline-block'}, ws.name)
      ]),
    ])
  }
}
