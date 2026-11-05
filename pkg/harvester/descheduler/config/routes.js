import Overview from '../pages/overview.vue';
import WhatIfPage from '../pages/whatif.vue';
import HistoryPage from '../pages/history.vue';
import { PAGES } from './names';
const page = (p, component) => ({
  name: p.route, path: `/:product/c/:cluster/${ p.path }`, component
});

export const deschedulerRoutes = [
  page(PAGES.overview, Overview),
  page(PAGES.whatif, WhatIfPage),
  page(PAGES.history, HistoryPage)
];
