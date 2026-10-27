/**
 * Late-bound entry points (#175). A few functions of main.ts call each other in a cycle (redrawing the graph, opening the
 * edit modals, loading an ontology), so the modules that were moved out of it cannot import them without importing
 * main.ts back. They call `actions.name(...)` instead; main.ts registers the real functions once, before it starts
 * the app. The types come from the real modules with a type-only reference, which is erased: no import cycle at run time.
 */

export interface Actions {
  applyFilter: typeof import('../graph/applyFilter').applyFilter;
  initDataPropsMenu: typeof import('../ui/dataPropertyModals').initDataPropsMenu;
  deleteDataPropertyWithConfirm: typeof import('../ui/dataPropertyModals').deleteDataPropertyWithConfirm;
}

const notRegistered = (name: string) => () => {
  throw new Error(`Action not registered yet: ${name}`);
};

export const actions: Actions = {
  applyFilter: notRegistered('applyFilter'),
  initDataPropsMenu: notRegistered('initDataPropsMenu'),
  deleteDataPropertyWithConfirm: notRegistered('deleteDataPropertyWithConfirm'),
};

/** Called once by main.ts with every action, before the app starts. */
export function registerActions(registered: Actions): void {
  Object.assign(actions, registered);
}
