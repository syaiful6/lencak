import m from 'mithril'
import { Icon, List, ListTile  } from 'polythene-mithril'

const icons = {
  workspaces: `<svg enable-background="new 0 0 512 512" version="1.1" viewBox="0 0 512 512" xml:space="preserve" xmlns="http://www.w3.org/2000/svg">
  <g fill="#FF6A00">
      <rect transform="matrix(-.7071 -.7071 .7071 -.7071 674.29 526.8)" x="431.25" y="96.526" width="30" height="54.449"/>
      <rect transform="matrix(-.7071 -.7071 .7071 -.7071 630.73 426.74)" x="372.28" y="67.742" width="62.932" height="30"/>
  </g>
  <rect x="412" y="36" width="30" height="150" fill="#FF3A00"/>
  <path d="M330,230H0V0h330V230z" fill="#00E0FF"/>
  <path d="M330,230H165V0h165V230z" fill="#009AF2"/>
  <path d="M80,512H0V311h80V512z" fill="#FFAE33"/>
  <path d="M512,512h-80V311h80V512z" fill="#FF9800"/>
  <path d="M492,291H362V171h130V291z" fill="#E20004"/>
  <path d="m252.97 291h-175.95l25.455-140h125.04l25.456 140z" fill="#003D6B"/>
  <path d="m165 130c-22.056 0-40-17.944-40-40s17.944-40 40-40 40 17.944 40 40-17.944 40-40 40z" fill="#0078EB"/>
  <path d="M512,341H0v-80h512V341z" fill="#D37300"/>
  <rect x="256" y="261" width="256" height="80" fill="#8F4B00"/>
  </svg>
  `,
  send: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\"><path d=\"M2.01 21L23 12 2.01 3 2 10l15 2-15 2z\"/></svg>"
}

export default (vnode) => {
  const events = vnode.attrs.events;
  const tile = ({ title, icon, index }) =>
    m(ListTile, {
      title,
      front: m(Icon, {
        svg: { content: m.trust(icon) }
      }),
      hoverable: true,
      navigation: true,
      events: {
        onclick: (ev) => {
          events.onclick(ev)
          m.route.set(`/${title.toLowerCase()}`)
        }
      }
    });

  const nums = [1];

  return {
    view() {
      return m(List, {
        hoverable: true,
        tiles: [].concat.apply([], nums.map((_, index) => ([
          {
            index,
            title: "Workspaces",
            icon: icons.workspaces,
          },
          {
            index,
            title: 'Tasks',
            icon: icons.send,
          }
        ]))).map(tile)
      });
    }
  }
};
