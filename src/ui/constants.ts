/**
 * UI constants.
 */
export const EDGE_TYPES = ['subClassOf', 'contains'];

export const COLORS = {
  labellable: '#2ecc71',
  nonLabellable: '#b8b8b8',
  unknown: '#95a5a6',
  default: '#3498db',
};

export type BorderLineType = 'solid' | 'dashed' | 'dotted' | 'dash-dot' | 'dash-dot-dot';

export const BORDER_LINE_OPTIONS: {
  value: BorderLineType;
  visValue: false | true | number[];
  svgDasharray: string;
}[] = [
  { value: 'solid', visValue: false, svgDasharray: '' },
  { value: 'dashed', visValue: [5, 5], svgDasharray: '5,3' },
  { value: 'dotted', visValue: [1, 3], svgDasharray: '1,3' },
  { value: 'dash-dot', visValue: [5, 2, 1, 2], svgDasharray: '5,2,1,2' },
  { value: 'dash-dot-dot', visValue: [5, 2, 1, 2, 1, 2], svgDasharray: '5,2,1,2,1,2' },
];

export const DEFAULT_BOOL_COLORS = {
  whenTrue: { fill: '#2ecc71', border: '#000000', lineType: 'solid' as BorderLineType },
  whenFalse: { fill: '#b8b8b8', border: '#000000', lineType: 'dashed' as BorderLineType },
  whenUndefined: { fill: '#95a5a6', border: '#000000', lineType: 'dashed' as BorderLineType },
};

export const DEFAULT_TEXT_COLOR = {
  fill: '#3498db',
  border: '#2980b9',
  lineType: 'solid' as BorderLineType,
};

/**
 * Distinct default fill colours assigned to annotation properties by position, so that two
 * properties don't share the same colour out of the box. Index 0 is the historic default green.
 */
export const ANNOTATION_FILL_PALETTE: string[] = [
  '#2ecc71', // green
  '#3498db', // blue
  '#e67e22', // orange
  '#9b59b6', // purple
  '#e74c3c', // red
  '#1abc9c', // teal
  '#f39c12', // amber
  '#e84393', // pink
  '#16a085', // dark teal
  '#2c3e50', // slate
];

/** Style applied to nodes that no annotation property governs. */
export const DEFAULT_NODE_FALLBACK = {
  fill: '#bdc3c7',
  border: '#000000',
  lineType: 'solid' as BorderLineType,
};

/** Styling for one boolean-property state (when true / false / undefined). */
export type AnnotationBoolState = {
  fillColor: string;
  borderColor: string;
  borderLineType: BorderLineType;
  show: boolean;
  /**
   * Whether this state claims (governs) a node. `whenTrue` is always treated as active;
   * `whenFalse` / `whenUndefined` default to inactive, so a property only colours its true
   * nodes unless the user opts in. An inactive state lets lower-priority properties decide.
   */
  active?: boolean;
};

/** Styling for nodes that no annotation property governs (configurable in the menu). */
export type AnnotationDefaultStyle = {
  fillColor: string;
  borderColor: string;
  borderLineType: BorderLineType;
};

export type AnnotationStyleConfig = {
  booleanProps: Record<
    string,
    {
      whenTrue: AnnotationBoolState;
      whenFalse: AnnotationBoolState;
      whenUndefined: AnnotationBoolState;
    }
  >;
  textProps: Record<string, { rules: { regex: string; fillColor: string; borderColor: string; borderLineType: BorderLineType }[] }>;
  defaultStyle?: AnnotationDefaultStyle;
};
