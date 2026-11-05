import { GROUP, HARVESTER_PRODUCT, NAV_GROUP, PAGES } from './names';
/** Adds Advanced > Descheduler (Overview, Simulator, History) to the Harvester side menu. */
export function registerDescheduler(dsl) {
  const {
    virtualType, basicType, labelGroup, setGroupDefaultType
  } = dsl;

  Object.values(PAGES).forEach((p) => virtualType({
    labelKey: p.labelKey,
    name:     p.type,
    weight:   p.weight,
    route:    {
      name:   p.route,
      params: { product: HARVESTER_PRODUCT }
    }
  }));
  labelGroup(GROUP, undefined, 'harvester.descheduler.nav.group');
  basicType(Object.values(PAGES).map((p) => p.type), `${ NAV_GROUP }::${ GROUP }`);
  setGroupDefaultType(GROUP, PAGES.overview.type);
}
