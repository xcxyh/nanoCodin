export function getFilePickerQuery(input: string, atPosition: number, cursor: number): string | null {
  if (atPosition < 0 || atPosition >= input.length || input[atPosition] !== "@") {
    return null;
  }

  if (cursor < atPosition + 1) {
    return null;
  }

  const query = input.slice(atPosition + 1, cursor);
  if (/\s/.test(query)) {
    return null;
  }

  return query;
}

export function clampFilePickerIndex(selectedIndex: number, fileCount: number): number {
  if (fileCount <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(selectedIndex, fileCount - 1));
}
