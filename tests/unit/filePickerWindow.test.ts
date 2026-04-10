import { describe, expect, it } from "vitest";
import { cyclePickerIndex, getVisiblePickerWindow } from "../../src/ui/utils/filePicker.js";

describe("getVisiblePickerWindow", () => {
  it("limits the visible picker rows to six items", () => {
    const items = ["1", "2", "3", "4", "5", "6", "7", "8"];
    expect(getVisiblePickerWindow(items, 0, 6)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("scrolls the window down to keep the selected item visible", () => {
    const items = ["1", "2", "3", "4", "5", "6", "7", "8"];
    expect(getVisiblePickerWindow(items, 7, 6)).toEqual(["3", "4", "5", "6", "7", "8"]);
  });
});

describe("cyclePickerIndex", () => {
  it("wraps from the first item to the last item when moving up", () => {
    expect(cyclePickerIndex(0, -1, 6)).toBe(5);
  });

  it("wraps from the last item to the first item when moving down", () => {
    expect(cyclePickerIndex(5, 1, 6)).toBe(0);
  });
});
