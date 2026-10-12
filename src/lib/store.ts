"use client";

import { createStore, del, entries, get, set, clear } from "idb-keyval";
import type { Output, Values } from "./types";

export type HistoryItem = {
  id: string;
  taskId: string;
  title: string;
  createdAt: number;
  values: Values;
  outputs: Output[];
};

// IndexedDB is unavailable during server rendering; create the store on first use.
let store: ReturnType<typeof createStore> | null = null;
const db = () => (store ??= createStore("open-fashion-studio", "history"));

export async function listHistory(): Promise<HistoryItem[]> {
  const all = await entries<string, HistoryItem>(db());
  return all.map(([, item]) => item).sort((a, b) => b.createdAt - a.createdAt);
}

export async function addHistory(item: HistoryItem) {
  await set(item.id, item, db());
}

export async function deleteHistory(id: string) {
  await del(id, db());
}

export async function clearHistory() {
  await clear(db());
}

/** Replace the data of a saved library record (the first data output of a history item). */
export async function updateRecord(recordId: string, data: unknown) {
  const item = await get<HistoryItem>(recordId, db());
  if (!item) throw new Error("That library item no longer exists.");
  const outputs = item.outputs.map((o, i) => (o.kind === "data" && i === item.outputs.findIndex((x) => x.kind === "data") ? { ...o, data } : o));
  await set(recordId, { ...item, outputs }, db());
}

/** Saved records produced by the given tasks, newest first. */
export async function listRecords(taskIds: string[]): Promise<{ id: string; title: string; data: unknown }[]> {
  const items = await listHistory();
  return items.flatMap((item) => {
    if (!taskIds.includes(item.taskId)) return [];
    const out = item.outputs.find((o) => o.kind === "data");
    return out && out.kind === "data" ? [{ id: item.id, title: out.label ?? item.title, data: out.data }] : [];
  });
}
