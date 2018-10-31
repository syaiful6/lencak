import m from 'mithril'
import stream from 'mithril/stream'
import { Dialog, Drawer, Toolbar, ToolbarTitle, IconButton } from 'polythene-mithril'
import 'polythene-css'

import './css/drawer'
import PageCss from './css/page'
import { addToDocument } from './css/utils'
import Workspace from './components/workspace'
import NavigationList from "./components/navigation-list"
import {REFRESH_CONN} from './constant'
import * as updater from './update';


const iconMenuSVG = "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\"><path d=\"M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z\"/></svg>";
const iconRefreshSVG = "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\"><path d=\"M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z\"/></svg>";

const App = {
  oninit: vnode => {
    const showDrawer = stream(false);
    Object.assign(vnode.state, {
      showDrawer,
    });
  },
  view: ({ state, attrs }) => {
    const showDrawer = state.showDrawer();
    return m(".page",
      m('.toolbars-wrapper', [
        m(Toolbar, {
          style: {
            background: '#48B7C7',
            color: '#fff'
          }
        },
        [
          m(IconButton, {
            icon: { svg: m.trust(iconMenuSVG) },
            events: {
              onclick: () => state.showDrawer(!state.showDrawer())
            }
          }),
          m(ToolbarTitle, { text: `Lencak: ${attrs.title}` }),
          m(IconButton, {
            icon: { svg: m.trust(iconRefreshSVG) },
            events: {
              onclick: () => updater.send({type: REFRESH_CONN})
            }
          }),
        ])
      ]),
      m(Dialog),
      m(".drawer-content-wrapper", [
        m(Drawer, {
          className: "small-screen-cover-drawer medium-screen-mini-drawer large-screen-floating-drawer",
          permanent: true,
          fixed: false,
          show: showDrawer,
          content: m(NavigationList, {
            events: {
              onclick: () => state.showDrawer(false)
            }
          }),
          didHide: () => state.showDrawer(false) // sync state with component
        }),
        m(".content", [
          m("h1", attrs.title),
          attrs.content
        ])
      ])
    );
  }
};

addToDocument(PageCss, {id: 'thatique-css-page'})

requestAnimationFrame(() => {
  m.route(document.body, '/workspaces', {
    '/workspaces': {
      render() {
        const models = updater.model();
        return m(App, {
          title: 'Workspaces',
          content: m('.workspaces', Object.keys(models.workspaces).map(key =>
            m(Workspace, {workspace: models.workspaces[key], sender: updater.send})
          ))
        })
      }
    },
    '/workspaces/:workspaceid': {
      render() {
        const workspaceid = m.route.param('workspaceid');
        const models = updater.model();
        const workspace = models.workspaces[workspaceid];

        if (workspace) {
          return m(App, {
            title: workspace.name,
            content: m('.workspace', [
              m(Workspace, {workspace, sender: updater.send })
          ])})
        } else {
          return m(App, {
            title: 'NotFound',
            content: `workspace ${workspaceid} not found`
          })
        }
      }
    }
  })
});
