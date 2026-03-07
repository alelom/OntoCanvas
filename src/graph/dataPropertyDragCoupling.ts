/**
 * Drag coupling: when a domain class node is dragged, attached data property nodes
 * (__dataprop__ and __dataproprestrict__) move with it. They remain independently
 * draggable when selected and dragged directly.
 */

const DATAPROP_PREFIX = '__dataprop__';
const DATAPROPRESTRICT_PREFIX = '__dataproprestrict__';

/**
 * Returns true if the node is a domain class (not a data property or restriction node).
 */
export function isDomainClassNode(nodeId: string): boolean {
  return (
    !nodeId.startsWith(DATAPROP_PREFIX) && !nodeId.startsWith(DATAPROPRESTRICT_PREFIX)
  );
}

/**
 * Returns IDs of data property nodes attached to the given class:
 * __dataprop__${classId}__* and __dataproprestrict__${classId}__*
 */
export function getAttachedDataPropertyNodeIds(
  classId: string,
  allNodeIds: Iterable<string>
): string[] {
  const result: string[] = [];
  const prefix1 = `${DATAPROP_PREFIX}${classId}__`;
  const prefix2 = `${DATAPROPRESTRICT_PREFIX}${classId}__`;
  for (const id of allNodeIds) {
    if (id.startsWith(prefix1) || id.startsWith(prefix2)) {
      result.push(id);
    }
  }
  return result;
}

export interface DragCouplingNetwork {
  getSelectedNodes(): string[];
  getPositions(): Record<string, { x: number; y: number }>;
  moveNode(nodeId: string, x: number, y: number): void;
  on(event: 'dragStart' | 'dragging' | 'dragEnd', callback: () => void): void;
}

interface DragState {
  initialPositions: Record<string, { x: number; y: number }>;
  selectedClassIds: string[];
  childIdsByClass: Map<string, string[]>;
}

/**
 * Registers drag coupling: on drag of domain class node(s), their attached
 * data property nodes move by the same delta. onDragEnd is called when drag
 * ends (e.g. to persist class positions).
 */
export function setupDragCoupling(
  net: DragCouplingNetwork,
  options: { onDragEnd: () => void }
): void {
  let state: DragState | null = null;

  net.on('dragStart', () => {
    const selectedIds = net.getSelectedNodes().map(String);
    const classIds = selectedIds.filter(isDomainClassNode);
    if (classIds.length === 0) {
      state = null;
      return;
    }
    const positions = net.getPositions();
    const allNodeIds = Object.keys(positions);
    const childIdsByClass = new Map<string, string[]>();
    const initialPositions: Record<string, { x: number; y: number }> = {};

    for (const id of selectedIds) {
      const pos = positions[id];
      if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        initialPositions[id] = { x: pos.x, y: pos.y };
      }
    }
    for (const classId of classIds) {
      const childIds = getAttachedDataPropertyNodeIds(classId, allNodeIds);
      childIdsByClass.set(classId, childIds);
      for (const childId of childIds) {
        const pos = positions[childId];
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
          initialPositions[childId] = { x: pos.x, y: pos.y };
        }
      }
    }

    state = {
      initialPositions,
      selectedClassIds: classIds,
      childIdsByClass,
    };
  });

  net.on('dragging', () => {
    if (!state) return;
    const current = net.getPositions();
    const { initialPositions, selectedClassIds, childIdsByClass } = state;

    for (const classId of selectedClassIds) {
      const init = initialPositions[classId];
      const cur = current[classId];
      if (!init || !cur || init.x === undefined || init.y === undefined) continue;
      const dx = cur.x - init.x;
      const dy = cur.y - init.y;
      const childIds = childIdsByClass.get(classId) ?? [];
      for (const childId of childIds) {
        const childInit = initialPositions[childId];
        if (!childInit || childInit.x === undefined || childInit.y === undefined) continue;
        net.moveNode(childId, childInit.x + dx, childInit.y + dy);
      }
    }
  });

  net.on('dragEnd', () => {
    state = null;
    options.onDragEnd();
  });
}
