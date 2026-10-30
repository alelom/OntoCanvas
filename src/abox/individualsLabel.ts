/**
 * What the toolbar button for the Individuals tab says (#211): a call to action while there are none, the count once there are.
 */
export function individualsButtonText(count: number): { label: string; title: string } {
  if (count === 0) return { label: 'Add individuals', title: 'Add a file or a URL of individuals to browse and query' };
  const shown = count.toLocaleString('en');
  return {
    label: `Individuals (${shown})`,
    title: `Browse the ${shown} ${count === 1 ? 'individual' : 'individuals'} of this ontology and of the data added to it`,
  };
}
