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
  if (problem.help?.kind !== 'long-path') return note;

  const { folder } = problem.help;
  const details = document.createElement('details');
  details.className = 'individual-image-help';
  details.setAttribute('data-individuals-image-help', '');
  const summary = document.createElement('summary');
  summary.textContent = LONG_PATH_SUMMARY;
  const steps = document.createElement('ol');
  steps.append(
    step('In PowerShell, give the folder that holds ', code(folder), ' a free drive letter, such as X: ', code(`subst X: "C:\\path\\to\\the folder that holds ${folder}"`)),
    step('Open it again from there: ', code('From a folder…'), ' (or ', code('Explore a folder…'), ' on the start screen), and pick ', code(`X:\\${folder}`), '.'),
    step('When you are done, ', code('subst X: /D'), ' takes the drive letter away.')
  );
  const alternative = document.createElement('p');
  alternative.append('Or copy ', code(folder), ' to a short path, such as ', code('C:\\data\\'), ', and open the copy.');
  details.append(summary, steps, alternative);
  note.append(details);
  return note;
}
