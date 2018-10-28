import { DrawerCSS } from "polythene-css"

import {breakPointDrawerSmall, breakPointDrawerMedium} from './utils';

DrawerCSS.addStyle(
  ".small-screen-cover-drawer",
  {
    cover: true,
    backdrop: true,
    border: false,
  },
  {
    mediaQuery: `@media all and (max-width: ${breakPointDrawerSmall}px)`
  }
);
DrawerCSS.addStyle(
  ".medium-screen-mini-drawer",
  {
    mini: true,
    border: true,
  },
  {
    mediaQuery: `@media all and (min-width: ${breakPointDrawerSmall + 1}px) and (max-width: ${breakPointDrawerMedium}px)`
  }
);
DrawerCSS.addStyle(
  ".large-screen-floating-drawer",
  {
    permanent: false,
    floating: true,
    z: 1,
    border_radius: 4
  },
  {
    mediaQuery: `@media all and (min-width: ${breakPointDrawerMedium + 1}px)`
  }
);
