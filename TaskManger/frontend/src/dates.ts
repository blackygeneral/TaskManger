import { DateTime } from "luxon";
import type { Task } from "./types";
export function taskDay(task: Task, zone: string) {
  return task.all_day
    ? task.date
    : DateTime.fromISO(task.due || task.start || "", { zone }).toISODate();
}
export function localInput(value: string | null | undefined, zone: string) {
  return value
    ? DateTime.fromISO(value, { zone }).toFormat("yyyy-MM-dd'T'HH:mm")
    : "";
}
export function toUTC(value: string, zone: string) {
  if (!value) return null;
  const date = DateTime.fromISO(value, { zone });
  if (!date.isValid || date.toFormat("yyyy-MM-dd'T'HH:mm") !== value)
    throw new Error("Invalid local time (daylight saving transition)");
  return date
    .getPossibleOffsets()
    .sort((a, b) => a.toMillis() - b.toMillis())[0]
    .toUTC()
    .toISO();
}

export function shiftDue(
  due: string,
  zone: string,
  delta: { years: number; months: number; days: number; milliseconds: number },
) {
  return DateTime.fromISO(due, { zone }).plus(delta).toUTC().toISO();
}
