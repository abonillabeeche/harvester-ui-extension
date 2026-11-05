import Overview from '../pages/overview.vue';
import SimulatorPage from '../pages/simulator.vue';
import HistoryPage from '../pages/history.vue';
import { PAGES } from './names';
const page = (p, component) => ({
  name: p.route, path: `/:product/c/:cluster/${ p.path }`, component
});

export const deschedulerRoutes = [
  page(PAGES.overview, Overview),
  page(PAGES.simulator, SimulatorPage),
  page(PAGES.history, HistoryPage)
];
