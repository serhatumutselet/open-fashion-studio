import type { Category, Task } from "../types";
import { designTasks } from "./design";
import { editTasks } from "./edit";
import { libraryTasks } from "./library";
import { photoshootTasks } from "./photoshoot";
import { techpackTasks } from "./techpack";

export const TASKS: Task[] = [...designTasks, ...photoshootTasks, ...editTasks, ...techpackTasks, ...libraryTasks];

export const CATEGORIES: { id: Category; title: string }[] = [
  { id: "design", title: "AI Design" },
  { id: "photoshoot", title: "AI Photoshoot" },
  { id: "edit", title: "Image Editing" },
  { id: "techpack", title: "Tech Pack" },
  { id: "library", title: "Library" },
];

export const taskById = (id: string) => TASKS.find((t) => t.id === id);

/** The first image field of a task, which a result can be sent into. */
export function primaryImageField(task: Task) {
  return task.fields.find((f) => f.type === "image" || f.type === "images");
}
