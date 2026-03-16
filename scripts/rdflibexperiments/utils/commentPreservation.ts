/**
 * Utilities for preserving comments when using rdflib serialization
 * Since rdflib doesn't preserve comments, we need to post-process the output
 */

export interface CommentInfo {
  line: number;
  text: string;
  type: 'section-divider' | 'inline' | 'block';
  associatedSubject?: string; // Subject URI this comment is associated with
}

/**
 * Extract comments from original Turtle content
 */
export function extractComments(content: string): CommentInfo[] {
  const comments: CommentInfo[] = [];
  const lines = content.split(/\r?\n/);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Section divider comments (multiple #)
    if (trimmed.match(/^#+$/)) {
      comments.push({
        line: i + 1,
        text: line,
        type: 'section-divider'
      });
    }
    // Block comments (full line starting with #)
    else if (trimmed.startsWith('#') && !trimmed.startsWith('##')) {
      comments.push({
        line: i + 1,
        text: line,
        type: 'block'
      });
    }
    // Inline comments (after statement)
    else if (line.includes('#') && !trimmed.startsWith('#')) {
      const commentMatch = line.match(/#.*$/);
      if (commentMatch) {
        comments.push({
          line: i + 1,
          text: commentMatch[0],
          type: 'inline'
        });
      }
    }
  }
  
  return comments;
}

/**
 * Attempt to re-insert comments into serialized Turtle output
 * This is a best-effort approach - comments may not be in exact same positions
 */
export function reinsertComments(
  serialized: string,
  originalComments: CommentInfo[],
  originalContent: string
): string {
  if (originalComments.length === 0) {
    return serialized;
  }
  
  // For now, this is a placeholder - full implementation would need to:
  // 1. Map comments to subjects/statements in original file
  // 2. Find corresponding statements in serialized output
  // 3. Insert comments at appropriate positions
  
  // Simple approach: Add section divider comments at the top
  const sectionDividers = originalComments.filter(c => c.type === 'section-divider');
  if (sectionDividers.length > 0) {
    const dividerText = sectionDividers.map(c => c.text).join('\n');
    // Insert after prefix declarations
    const prefixEnd = serialized.indexOf('\n\n');
    if (prefixEnd > 0) {
      return serialized.slice(0, prefixEnd + 2) + 
             dividerText + '\n\n' + 
             serialized.slice(prefixEnd + 2);
    }
  }
  
  return serialized;
}

/**
 * Check if rdflib has any built-in comment preservation mechanisms
 */
export function checkRdflibCommentSupport(): {
  hasCommentSupport: boolean;
  method?: string;
  notes?: string;
} {
  // Based on investigation:
  // - rdflib's serialize() function doesn't preserve comments
  // - Comments are not part of the RDF data model (they're syntax-level)
  // - No options in serialize() for comment preservation
  
  return {
    hasCommentSupport: false,
    method: 'Post-processing required',
    notes: 'Comments must be extracted from original file and re-inserted into serialized output'
  };
}
