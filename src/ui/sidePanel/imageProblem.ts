/**
 * Why an image of the data cannot be shown, in place of the image: a note, and the steps to see it after all when there are some.
 * On Windows, a browser cannot read a file whose full path is longer than 260 characters, so the steps open the folder again from
 * a shorter path. Nothing blocks: the rest of the detail is shown as usual.
 */
import type { ImageProblem } from '../../abox/dataImages';

export const LONG_PATH_SUMMARY = 'How to see it: open the folder from a shorter path';

const code = (text: string): HTMLElement => {
  const element = document.createElement('code');
  element.textContent = text;
  return element;
};

/** One step: plain text and code, in order. */
const step = (...parts: Array<string | HTMLElement>): HTMLLIElement => {
  const item = document.createElement('li');
  item.append(...parts);
  return item;
};

export function renderImageProblem(problem: ImageProblem): HTMLElement {
  const note = document.createElement('div');
  note.className = 'individual-image-missing';
  note.setAttribute('data-individuals-image-missing', '');
  note.append(problem.hint);
  if (problem.help?.kind === 'long-path') note.append(renderLongPathSteps(problem.help.folder));
  return note;
}

/** The steps to open a folder again from a shorter path, folded: `folder` is the name of the folder opened. */
export function renderLongPathSteps(folder: string): HTMLDetailsElement {
  const details = document.createElement('details');
  details.className = 'individual-image-help';
  details.setAttribute('data-individuals-image-help', '');
  const summary = document.createElement('summary');
  summary.textContent = LONG_PATH_SUMMARY;
  const steps = document.createElement('ol');
  steps.append(
    // A drive letter belongs to the session that made it: one made "as administrator" is not seen by the browser.
    step('In a PowerShell window (no administrator rights needed: open it as yourself, not "as administrator", or the browser won\'t see the drive), give the folder that holds ', code(folder), ' a free drive letter, such as X: ', code(`subst X: "C:\\path\\to\\the folder that holds ${folder}"`)),
    step('Open it again from there: ', code('From a folder…'), ' (or ', code('Explore a folder…'), ' on the start screen), and pick ', code(`X:\\${folder}`), '.'),
    step('When you are done, ', code('subst X: /D'), ' takes the drive letter away.')
  );
  const alternative = document.createElement('p');
  alternative.append('Or copy ', code(folder), ' to a short path, such as ', code('C:\\data\\'), ', and open the copy.');
  // Windows lifts the limit only for a program whose manifest says longPathAware, and Chrome's and Edge's don't.
  const longPaths = document.createElement('p');
  longPaths.setAttribute('data-individuals-image-help-long-paths', '');
  longPaths.append('Turning on Windows long paths (', code('LongPathsEnabled'), ") doesn't help: Chrome and Edge don't use that setting, so their limit stays at 260 characters.");
  details.append(summary, steps, alternative, longPaths);
  return details;
}
