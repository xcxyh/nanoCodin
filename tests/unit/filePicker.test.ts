import { describe, expect, it } from "vitest";
import { clampFilePickerIndex, getFilePickerQuery } from "../../src/ui/filePicker.js";

describe("getFilePickerQuery", () => {
  it("returns the active query after the @ trigger", () => {
    expect(getFilePickerQuery("open @src/ui", 5, 12)).toBe("src/ui");
  });

  it("closes the picker when the cursor moves before the query", () => {
    expect(getFilePickerQuery("open @src/ui", 5, 5)).toBe(null);
  });

  it("closes the picker when the query already ended with whitespace", () => {
    expect(getFilePickerQuery("open @src/ui next", 5, 13)).toBe(null);
  });

  it("closes the picker when the trigger marker was deleted", () => {
    expect(getFilePickerQuery("open src/ui", 5, 11)).toBe(null);
  });
});

describe("clampFilePickerIndex", () => {
  it("keeps the selection in range", () => {
    expect(clampFilePickerIndex(3, 2)).toBe(1);
    expect(clampFilePickerIndex(-1, 2)).toBe(0);
  });

  it("falls back to zero when there are no files", () => {
    expect(clampFilePickerIndex(2, 0)).toBe(0);
  });
});
