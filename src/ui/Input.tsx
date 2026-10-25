import React, { useEffect, useRef, useState } from "react";
import { useInput } from "ink";
import { ConsoleInputBar } from "./components/ConsoleInputBar.js";
import { cyclePickerIndex, getFilePickerQuery, insertFileReference } from "./utils/filePicker.js";
import { buildSlashCommands, buildSlashCommandTemplate, filterSlashCommands, getSlashCommandQuery, resolveSlashSubmission, type SlashCommandItem } from "./utils/slashCommands.js";
import { isCtrlC, useConsoleInput } from "./useConsoleInput.js";

type Picker = { kind: "file"; start: number; index: number } | { kind: "command"; index: number };
export interface InputProps {
  enabled: boolean;
  onSubmit(text: string): void;
  onExit?(): void;
  onActivity?(): void;
  loadFiles?: (signal: AbortSignal) => Promise<string[]>;
  loadCommands?: () => Promise<SlashCommandItem[]>;
}

export function Input({ enabled, onSubmit, onExit, onActivity, loadFiles, loadCommands }: InputProps) {
  const input = useConsoleInput();
  const [picker, setPicker] = useState<Picker | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [commands, setCommands] = useState(buildSlashCommands([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const closePicker = () => {
    request.current++;
    controller.current?.abort();
    setPicker(null);
    setLoading(false);
    setError(null);
  };
  useEffect(() => {
    if (!enabled) closePicker();
    return () => { request.current++; controller.current?.abort(); };
  }, [enabled]);

  const openPicker = async (next: Picker) => {
    const id = ++request.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setPicker(next); setError(null); setLoading(true);
    if (next.kind === "file") setFiles([]);
    try {
      if (next.kind === "file") {
        const values = await loadFiles?.(abort.signal) ?? [];
        if (id === request.current) setFiles(values);
      } else {
        const values = await loadCommands?.() ?? buildSlashCommands([]);
        if (id === request.current) setCommands(values);
      }
    } catch (failure) {
      if (id === request.current && !abort.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (id === request.current) setLoading(false);
    }
  };

  const query = picker?.kind === "file"
    ? getFilePickerQuery(input.input, picker.start, input.cursor) ?? ""
    : getSlashCommandQuery(input.input, input.cursor) ?? "";
  const matchingFiles = picker?.kind === "file" ? files.filter((file) => file.toLowerCase().includes(query.toLowerCase())) : [];
  const matchingCommands = picker?.kind === "command" ? filterSlashCommands(commands, query) : [];
  const count = picker?.kind === "file" ? matchingFiles.length : matchingCommands.length;
  const selected = Math.max(0, Math.min(picker?.index ?? 0, count - 1));

  useInput((char, key) => {
    if (isCtrlC(char, key)) {
      if (picker) closePicker();
      else onExit?.();
      return;
    }
    onActivity?.();
    if (key.escape) { closePicker(); return; }
    if (picker && (key.upArrow || key.downArrow)) {
      setPicker({ ...picker, index: cyclePickerIndex(selected, key.upArrow ? -1 : 1, count) });
      return;
    }
    if (key.return && picker) {
      if (loading || !count) return;
      if (picker.kind === "command") {
        const value = buildSlashCommandTemplate(matchingCommands[selected]);
        input.setInput(value); input.setCursor(value.length);
      } else {
        const value = insertFileReference(input.input, input.cursor, picker.start, matchingFiles[selected]);
        input.setInput(value.input); input.setCursor(value.cursor);
      }
      closePicker(); return;
    }
    if (key.return) {
      const text = input.inputRef.current.trim();
      if (!text) return;
      const resolved = resolveSlashSubmission(text, commands);
      input.reset(); closePicker();
      onSubmit(resolved.kind === "builtin" ? `/${resolved.commandName}` : resolved.task ?? text);
      return;
    }
    const previous = input.inputRef.current;
    input.applyKey(char, key);
    const value = input.inputRef.current;
    const cursor = input.cursorRef.current;
    if (picker?.kind === "file") {
      if (getFilePickerQuery(value, picker.start, cursor) === null) closePicker();
      else setPicker({ ...picker, index: 0 });
      return;
    }
    const fileTrigger = value.slice(0, cursor).match(/(?:^|\s)@([^\s]*)$/);
    if (char.includes("@") && value !== previous && fileTrigger) {
      void openPicker({ kind: "file", start: cursor - fileTrigger[1].length - 1, index: 0 }); return;
    }
    const commandQuery = getSlashCommandQuery(value, cursor);
    if (commandQuery !== null && value !== previous) {
      if (picker?.kind === "command") setPicker({ ...picker, index: 0 });
      else void openPicker({ kind: "command", index: 0 });
    } else if (picker?.kind === "command" && commandQuery === null) closePicker();
  }, { isActive: enabled });

  const message = !picker ? undefined : loading ? "正在加载…" : error ? `加载失败：${error}` : !count ? "没有匹配项，Esc 关闭" : `${selected + 1}/${count} · ↑↓ 选择 · Enter 插入 · Esc 关闭`;
  return <ConsoleInputBar input={input.input} cursor={input.cursor} busy={!enabled}
    pickerFiles={matchingFiles} commandSuggestions={matchingCommands} pickerSelectedIndex={selected} pickerMessage={message} />;
}
