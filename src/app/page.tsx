"use client";

import { useCallback, useEffect, useState } from "react";
import { Outputs } from "@/components/Outputs";
import { SettingsDialog } from "@/components/SettingsDialog";
import { TaskForm, defaultValues, missingField } from "@/components/TaskForm";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "@/lib/settings";
import { addHistory, clearHistory, deleteHistory, listHistory, type HistoryItem } from "@/lib/store";
import { CATEGORIES, TASKS, primaryImageField, taskById } from "@/lib/tasks";
import type { Output, Provider, RecordData, Task, Values } from "@/lib/types";

type Job = {
  id: string;
  taskId: string;
  startedAt: number;
  status: "running" | "done" | "error" | "cancelled";
  progress: string;
  outputs: Output[];
  error?: string;
  controller: AbortController;
};

type View = { type: "task"; taskId: string } | { type: "history"; itemId?: string };

const PROVIDER_NAMES: Record<Provider, string> = { gemini: "Gemini", fal: "fal.ai" };

function thumbOf(outputs: Output[], values: Values): string | undefined {
  for (const o of outputs) {
    if (o.kind === "image" || o.kind === "svg") return o.src;
    if (o.kind === "data") {
      const d = o.data as {
        reference?: string;
        front_sketch?: string;
        images?: string[];
        image?: string;
        looks?: string[];
        colourways?: { swatch: string }[];
        items?: { image?: string }[];
      };
      const src = d.front_sketch ?? d.reference ?? d.image ?? d.images?.[0] ?? d.looks?.[0] ?? d.colourways?.[0]?.swatch ?? d.items?.find((i) => i.image)?.image;
      if (src) return src;
    }
  }
  for (const v of Object.values(values)) {
    if (typeof v === "string" && v.startsWith("data:image")) return v;
  }
}

function elapsed(since: number) {
  const s = Math.round((Date.now() - since) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function Home() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<View>({ type: "task", taskId: TASKS[0].id });
  const [valuesByTask, setValuesByTask] = useState<Record<string, Values>>({});
  const [jobs, setJobs] = useState<Job[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [formError, setFormError] = useState("");
  const [, tick] = useState(0);

  useEffect(() => {
    // Browser-only state: read after mount so server and client render the same first frame.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(loadSettings());
    setReady(true);
    listHistory().then(setHistory).catch(() => setHistory([]));
  }, []);

  const running = jobs.filter((j) => j.status === "running").length;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const task = view.type === "task" ? taskById(view.taskId)! : null;
  const values = task ? (valuesByTask[task.id] ?? defaultValues(task)) : {};
  const missingKeys = task ? task.providers.filter((p) => (p === "gemini" ? !settings.geminiKey : !settings.falKey)) : [];

  const openTask = useCallback((taskId: string) => {
    setView({ type: "task", taskId });
    setFormError("");
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }, []);

  /** Open a task with some fields filled in, keeping what the user already entered there. */
  const openWith = useCallback(
    (taskId: string, patch: Values) => {
      const t = taskById(taskId)!;
      setValuesByTask((all) => ({ ...all, [taskId]: { ...(all[taskId] ?? defaultValues(t)), ...patch } }));
      openTask(taskId);
    },
    [openTask],
  );

  const sendTo = useCallback(
    (taskId: string, src: string) => {
      const field = primaryImageField(taskById(taskId)!)!;
      openWith(taskId, { [field.key]: field.type === "images" ? [{ image: src, role: field.roles?.[0]?.value ?? "" }] : src });
    },
    [openWith],
  );

  function updateJob(id: string, patch: Partial<Job>) {
    setJobs((all) => all.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }

  async function run(t: Task) {
    const missing = missingField(t, values);
    if (missing) return setFormError(missing);
    if (missingKeys.length) return setSettingsOpen(true);
    setFormError("");

    const job: Job = {
      id: crypto.randomUUID(),
      taskId: t.id,
      startedAt: Date.now(),
      status: "running",
      progress: "Starting…",
      outputs: [],
      controller: new AbortController(),
    };
    setJobs((all) => [job, ...all]);

    try {
      const outputs = await t.run(values, {
        settings,
        signal: job.controller.signal,
        progress: (progress) => updateJob(job.id, { progress }),
      });
      // Library records remember where they are stored, so later tools can pick and update them.
      const stored = outputs.map((o) =>
        o.kind === "data" && !(o.data as RecordData).recordId ? { ...o, data: { ...(o.data as object), recordId: job.id } } : o,
      );
      updateJob(job.id, { status: "done", outputs: stored, progress: "" });
      const item: HistoryItem = {
        id: job.id,
        taskId: t.id,
        title: stored.find((o) => o.kind === "data")?.label ?? t.title,
        createdAt: job.startedAt,
        values,
        outputs: stored,
      };
      // Updating a record (e.g. adding a colourway) changes the original; don't save a duplicate.
      const updatesExisting = stored.some((o) => o.kind === "data" && (o.data as RecordData).recordId !== job.id);
      if (!updatesExisting) {
        await addHistory(item).catch(() => {});
        setHistory((h) => [item, ...h]);
      } else {
        listHistory().then(setHistory).catch(() => {});
      }
    } catch (e) {
      const aborted = job.controller.signal.aborted;
      updateJob(job.id, {
        status: aborted ? "cancelled" : "error",
        error: aborted ? "Cancelled." : e instanceof Error ? e.message : String(e),
        progress: "",
      });
    }
  }

  const taskJobs = task ? jobs.filter((j) => j.taskId === task.id) : [];
  const historyItem = view.type === "history" ? history.find((h) => h.id === view.itemId) : undefined;

  const sidebar = (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto p-5" aria-label="Tools">
      <div className="hidden lg:block">
        <div className="font-display text-3xl leading-none">Open Fashion Studio</div>
        <div className="mt-1 text-xs text-muted">Open-source AI fashion studio</div>
      </div>
      {CATEGORIES.map((c) => (
        <div key={c.id}>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{c.title}</div>
          <ul className="space-y-0.5">
            {TASKS.filter((t) => t.category === c.id).map((t) => {
              const active = view.type === "task" && view.taskId === t.id;
              const busy = jobs.some((j) => j.taskId === t.id && j.status === "running");
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => openTask(t.id)}
                    aria-current={active ? "page" : undefined}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                      active ? "bg-ink text-paper" : "hover:bg-line/60"
                    }`}
                  >
                    {t.title}
                    {busy && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-label="running" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="mt-auto space-y-1 border-t border-line pt-4">
        <button
          type="button"
          onClick={() => {
            setView({ type: "history" });
            setMenuOpen(false);
          }}
          className={`flex w-full justify-between rounded-md px-2.5 py-1.5 text-left text-sm ${view.type === "history" ? "bg-ink text-paper" : "hover:bg-line/60"}`}
        >
          History <span className="opacity-60">{history.length}</span>
        </button>
        <button type="button" onClick={() => setSettingsOpen(true)} className="flex w-full justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-line/60">
          Settings & API keys
          {ready && (!settings.geminiKey || !settings.falKey) && <span className="h-2 w-2 self-center rounded-full bg-accent" aria-label="missing key" />}
        </button>
      </div>
    </nav>
  );

  return (
    <div className="lg:grid lg:grid-cols-[250px_1fr]">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-paper/95 px-4 py-3 backdrop-blur lg:hidden">
        <span className="font-display text-2xl">Open Fashion Studio</span>
        <button type="button" onClick={() => setMenuOpen((o) => !o)} className="rounded-md border border-line px-3 py-1 text-sm" aria-expanded={menuOpen}>
          {menuOpen ? "Close" : "Menu"}
          {running > 0 && ` · ${running}`}
        </button>
      </header>
      {menuOpen && <div className="fixed inset-x-0 bottom-0 top-[57px] z-20 bg-paper lg:hidden">{sidebar}</div>}
      <aside className="sticky top-0 hidden h-screen border-r border-line lg:block">{sidebar}</aside>

      <main className="min-w-0 px-4 py-6 sm:px-8 lg:py-10">
        {task && (
          <>
            <div className="mb-8 max-w-3xl">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{CATEGORIES.find((c) => c.id === task.category)?.title}</div>
              <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">{task.title}</h1>
              <p className="mt-2 text-muted">{task.description}</p>
              <div className="mt-3 flex gap-1.5">
                {task.providers.map((p) => (
                  <span key={p} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
                    {PROVIDER_NAMES[p]}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-8 xl:grid-cols-[minmax(320px,420px)_1fr]">
              <section aria-label="Inputs">
                {ready && missingKeys.length > 0 && (
                  <div className="mb-5 rounded-lg border border-accent/40 bg-accent/5 p-3 text-sm">
                    This tool needs a {missingKeys.map((p) => PROVIDER_NAMES[p]).join(" and ")} API key.{" "}
                    <button type="button" className="font-medium underline" onClick={() => setSettingsOpen(true)}>
                      Open settings
                    </button>
                  </div>
                )}
                <TaskForm key={task.id} task={task} values={values} onChange={(v) => setValuesByTask((all) => ({ ...all, [task.id]: v }))} />
                <div className="sticky bottom-0 -mx-1 mt-6 bg-gradient-to-t from-paper via-paper to-transparent px-1 pb-4 pt-4">
                  {formError && <p className="mb-2 text-sm text-danger">{formError}</p>}
                  <button
                    type="button"
                    onClick={() => run(task)}
                    className="w-full rounded-xl bg-accent px-5 py-3 font-medium text-accent-ink shadow-sm transition-transform active:scale-[0.99]"
                  >
                    Generate
                  </button>
                </div>
              </section>

              <section aria-label="Results" aria-live="polite" className="min-w-0 space-y-6">
                {taskJobs.length === 0 && (
                  <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
                    Results appear here. Chain tools by sending any result on with “Send to →”.
                  </div>
                )}
                {taskJobs.map((job) => (
                  <article key={job.id} className="rounded-2xl border border-line bg-card/60 p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{new Date(job.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      {job.status === "running" && (
                        <>
                          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                          <span className="text-muted">
                            {job.progress} · {elapsed(job.startedAt)}
                          </span>
                          <button type="button" onClick={() => job.controller.abort()} className="ml-auto rounded-md border border-line px-2 py-0.5 text-xs">
                            Cancel
                          </button>
                        </>
                      )}
                      {job.status === "done" && <span className="text-ok">Done</span>}
                      {(job.status === "error" || job.status === "cancelled") && <span className="text-danger">{job.error}</span>}
                    </div>
                    {job.status === "running" && <div className="h-48 animate-pulse rounded-xl bg-line/40" />}
                    {job.outputs.length > 0 && <Outputs outputs={job.outputs} onSend={sendTo} onUse={openWith} />}
                  </article>
                ))}
              </section>
            </div>
          </>
        )}

        {view.type === "history" && (
          <>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="font-display text-4xl sm:text-5xl">History & library</h1>
                <p className="mt-1 text-sm text-muted">Saved in this browser only (IndexedDB).</p>
              </div>
              {history.length > 0 && (
                <button
                  type="button"
                  className="rounded-md border border-line px-3 py-1.5 text-sm text-danger"
                  onClick={async () => {
                    if (!confirm("Delete your whole history and library? This cannot be undone.")) return;
                    await clearHistory();
                    setHistory([]);
                    setView({ type: "history" });
                  }}
                >
                  Delete all
                </button>
              )}
            </div>
            {history.length === 0 && <p className="text-muted">Nothing here yet.</p>}
            <div className="grid gap-8 xl:grid-cols-[360px_1fr]">
              <ul className="grid grid-cols-2 gap-2 self-start sm:grid-cols-3 xl:grid-cols-2">
                {history.map((h) => {
                  const thumb = thumbOf(h.outputs, h.values);
                  const active = view.itemId === h.id;
                  return (
                    <li key={h.id}>
                      <button
                        type="button"
                        onClick={() => setView({ type: "history", itemId: h.id })}
                        className={`w-full overflow-hidden rounded-lg border text-left ${active ? "border-accent ring-2 ring-accent/30" : "border-line"}`}
                      >
                        <div className="checker aspect-square">
                          {/* eslint-disable-next-line @next/next/no-img-element -- local data URLs */}
                          {thumb && <img src={thumb} alt="" className="h-full w-full object-cover" />}
                        </div>
                        <div className="p-2 text-xs">
                          <div className="truncate font-medium">{h.title}</div>
                          <div className="truncate text-muted">{taskById(h.taskId)?.title}</div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {historyItem && (
                <section className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <h2 className="mr-auto font-display text-3xl">{taskById(historyItem.taskId)?.title}</h2>
                    <button
                      type="button"
                      className="rounded-md border border-line px-3 py-1 text-sm"
                      onClick={() => {
                        setValuesByTask((all) => ({ ...all, [historyItem.taskId]: historyItem.values }));
                        openTask(historyItem.taskId);
                      }}
                    >
                      Reopen with these settings
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-line px-3 py-1 text-sm text-danger"
                      onClick={async () => {
                        await deleteHistory(historyItem.id);
                        setHistory((h) => h.filter((x) => x.id !== historyItem.id));
                        setView({ type: "history" });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  <Outputs outputs={historyItem.outputs} onSend={sendTo} onUse={openWith} />
                </section>
              )}
            </div>
          </>
        )}
      </main>

      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={(s) => {
            setSettings(s);
            saveSettings(s);
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}
