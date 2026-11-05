import { PRODUCT_NAME } from '../../config/harvester';
// Single source of truth for names, so routes, nav and pages stay consistent.
// We add pages to Harvester's own product instead of registering a product of our own: the standalone
// Harvester dashboard has no product switcher, so a separate product would have no menu entry.
export const HARVESTER_PRODUCT = PRODUCT_NAME;
export const NAV_GROUP = 'advanced'; // Harvester's own side-menu group
export const GROUP = 'descheduler'; // our nested group inside it
const route = (suffix) => `${ HARVESTER_PRODUCT }-c-cluster-descheduler${ suffix }`;

// type: the side-menu type; path: below /:product/c/:cluster/; weight: higher shows first.
// Sibling paths on purpose: if one page's path were a prefix of another's, vue-router would mark BOTH menu items active.
export const PAGES = {
  overview: {
    type: 'descheduler-overview', path: 'descheduler/overview', route: route('-overview'), weight: 3, labelKey: 'harvester.descheduler.nav.overview'
  },
  whatif: {
    type: 'descheduler-whatif', path: 'descheduler/what-if', route: route('-what-if'), weight: 2, labelKey: 'harvester.descheduler.nav.whatif'
  },
  history: {
    type: 'descheduler-history', path: 'descheduler/history', route: route('-history'), weight: 1, labelKey: 'harvester.descheduler.nav.history'
  }
};
