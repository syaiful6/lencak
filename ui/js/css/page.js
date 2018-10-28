import j2c from 'j2c';

export default j2c.sheet({
  '@global': {
    '.page': {
      'min-width': '320px',
      'overflow': 'hidden',
      'position': 'relative',

      ' .drawer-content-wrapper': {
        'display': 'flex',
        'height': '100vh',
        'width': '100vw',
        'background': '#f0f0f0',
      },

      ' .content': {
        'padding': '20px',
        'max-width': '480px',
        '@media all and (min-width: 901px)': {
          'max-width': '850px',
          'margin': '0 auto',
        },
      },

      ' .pe-drawer': {
        '@media all and (min-width: 901px)': {
          'margin': '20px',
        },
      },
    },

    '#show-drawer-button': {
      '@media all and (min-width: 901px)': {
        'display': 'none'
      }
    },
  }
})
