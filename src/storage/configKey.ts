/** The key a file's settings are stored under, shared by the display config, external refs and serializer config stores. */
export function getDisplayConfigKey(filePath: string | null, fileName: string | null): string | null {
  return filePath || fileName || null;
}

/** Normalize to filename for consistent lookup across different load paths. */
export function getDisplayConfigKeyNormalized(filePath: string | null, fileName: string | null): string | null {
  const raw = getDisplayConfigKey(filePath, fileName);
  if (!raw) return null;
  const basename = raw.replace(/^.*[/\\]/, '');
  return basename || raw;
}
