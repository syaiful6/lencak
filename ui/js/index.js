import m from 'mithril'
import stream from 'mithril/stream'
import { Drawer, Button, Toolbar, ToolbarTitle, IconButton } from 'polythene-mithril'
import 'polythene-css'

import './css/drawer'
import PageCss from './css/page'
import { addToDocument } from './css/utils'

import NavigationList from "./components/navigation-list"


const ipsum = "<p>Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat.</p>";
const longText = m.trust(ipsum + ipsum + ipsum)

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
        m(Toolbar,
          [
            m(IconButton, {
              icon: { svg: m.trust(iconMenuSVG) },
              events: {
                onclick: () => state.showDrawer(!state.showDrawer())
              }
            }),
            m(ToolbarTitle, { text: `Lencak: ${attrs.title}` }),
            m(IconButton,
              { icon: { svg: m.trust(iconRefreshSVG) } }
            ),
          ]
        )
      ]),
      m(".drawer-content-wrapper", [
        m(Drawer, {
          className: "small-screen-cover-drawer medium-screen-mini-drawer large-screen-floating-drawer",
          permanent: false,
          fixed: true,
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

m.route(document.body, '/workspaces', {
  '/workspaces': {
    render() {
      return m(App, {title: 'Workspaces', content: 'Hello world'})
    }
  },
  '/tasks': {
    render() {
      return m(App, {title: 'Task', content: 'Hello world'})
    }
  }
})
