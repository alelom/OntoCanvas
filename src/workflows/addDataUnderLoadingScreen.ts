/**
 * Adding data under the loading screen (#239). Moved out of main.ts (#198), so a change to it selects the tests of adding data,
 * not every E2E area.
 */
import { session } from '../state/appState';
import { setLoadingCancel, setLoadingText, underLoadingScreen, withinMs } from '../ui/modals';
import { ontologiesOfDataRead } from './dataOntologies';

/** What the loading screen says while the data is added, then while the ontologies it names are read (#239). */
const ADDING_DATA = 'Adding the data…';
const READING_DATA_ONTOLOGIES = 'Reading the ontologies the data names…';
/** The longest the loading screen waits for the ontologies the data names: they name the classes when they come, later. */
const DATA_ONTOLOGIES_WAIT_MS = 3000;

/**
 * Adds data on an initial load (?data=, Explore data files…) under the loading screen, with a Cancel while the data is read
 * (the screen covers the Individuals tab's), then waits a little for the ontologies the data names, so the classes are
 * usually drawn once, named (#239).
 */
export function addDataUnderLoadingScreen(add: () => Promise<unknown>): Promise<void> {
  return underLoadingScreen(async () => {
    setLoadingCancel(() => session.sidePanel?.cancelData());
    await add();
    setLoadingCancel(null);
    setLoadingText(READING_DATA_ONTOLOGIES);
    await withinMs(ontologiesOfDataRead(), DATA_ONTOLOGIES_WAIT_MS);
  }, ADDING_DATA);
}
