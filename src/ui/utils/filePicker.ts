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

export function cyclePickerIndex(selectedIndex: number, delta: number, itemCount: number): number {
  if (itemCount <= 0) {
    return 0;
  }

  const normalized = (selectedIndex + delta) % itemCount;
  return normalized < 0 ? normalized + itemCount : normalized;
}

export function getVisiblePickerWindow<T>(items: T[], selectedIndex: number, maxVisibleItems: number): T[] {
  if (maxVisibleItems <= 0 || items.length === 0) {
    return [];
  }

  const clampedIndex = clampFilePickerIndex(selectedIndex, items.length);
  const windowSize = Math.min(maxVisibleItems, items.length);
  const maxStart = Math.max(0, items.length - windowSize);
  const start = Math.min(Math.max(0, clampedIndex - windowSize + 1), maxStart);
  return items.slice(start, start + windowSize);
}
