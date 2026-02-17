/**
 * Derive a camelCase identifier from an rdfs:label for use as ontology local name.
 * Valid identifier: [a-zA-Z_][a-zA-Z0-9_]*
 */

const VALID_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Convert label to camelCase and keep only identifier-safe characters.
 * Non-alphanumeric/underscore are removed; first character must be letter or underscore.
 */
export function labelToCamelCaseIdentifier(label: string): string {
  const trimmed = (label ?? '').trim();
  if (!trimmed) return '';

  // Split on whitespace and punctuation to get words; keep only letters and digits per word
  const words = trimmed
    .split(/[\s\-_\.,;:]+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter((w) => w.length > 0);

  if (words.length === 0) return '';

  const first = words[0];
  const rest = words.slice(1);
  const firstChar = first.charAt(0);
  const start =
    firstChar === '_' || /[a-zA-Z]/.test(firstChar)
      ? first
      : first.replace(/^[0-9]+/, '');
  const camel =
    start.toLowerCase() +
    rest
      .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
      .join('');

  const safe = camel.replace(/[^a-zA-Z0-9_]/g, '');
  if (!safe) return '';
  if (/^[0-9]/.test(safe)) return '_' + safe;
  return safe;
}

export interface ValidateIdentifierResult {
  valid: boolean;
  identifier?: string;
  warning?: string;
  error?: string;
}

/**
 * Validate that a label can produce an admissible identifier.
 * - If valid: identifier is set, no error.
 * - If label had characters removed to form identifier: warning is set.
 * - If no valid identifier can be derived: valid false, error set.
 */
export function validateLabelForIdentifier(label: string): ValidateIdentifierResult {
  const trimmed = (label ?? '').trim();
  if (!trimmed) {
    return { valid: false, error: 'Label is required to derive an identifier.' };
  }

  const identifier = labelToCamelCaseIdentifier(label);
  if (!identifier) {
    return {
      valid: false,
      error: 'Label does not produce a valid identifier (use letters, numbers, spaces; avoid only symbols).',
    };
  }

  if (!VALID_IDENTIFIER_REGEX.test(identifier)) {
    return {
      valid: false,
      error: 'Derived identifier is invalid.',
    };
  }

  const hadInvalidChars =
    /[^a-zA-Z0-9_\s\-.,;:]/.test(trimmed) ||
    trimmed !== trimmed.replace(/\s+/g, ' ').trim();
  const warning = hadInvalidChars
    ? 'Some characters in the label were omitted in the identifier.'
    : undefined;

  return { valid: true, identifier, warning };
}
