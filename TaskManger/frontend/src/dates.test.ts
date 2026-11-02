import { describe, it, expect } from "vitest";
import { localInput, toUTC, taskDay, shiftDue } from "./dates";
import type { Task } from "./types";
describe("dates", () => {
  it("preserves an all day date across zones", () =>
    expect(
      taskDay(
        { all_day: true, date: "2026-10-26" } as Task,
        "Pacific/Auckland",
      ),
    ).toBe("2026-10-26"));
  it("converts account wall time to UTC with DST", () => {
    expect(toUTC("2026-03-07T09:00", "America/New_York")).toBe(
      "2026-03-07T14:00:00.000Z",
    );
    expect(toUTC("2026-03-08T09:00", "America/New_York")).toBe(
      "2026-03-08T13:00:00.000Z",
    );
  });
  it("rejects nonexistent spring-forward wall times", () =>
    expect(() => toUTC("2026-03-08T02:30", "America/New_York")).toThrow());
  it("renders in account zone", () =>
    expect(localInput("2026-03-08T13:00:00Z", "America/New_York")).toBe(
      "2026-03-08T09:00",
    ));
});

it("chooses the earlier instant in an ambiguous fall-back hour", () =>
  expect(toUTC("2026-11-01T01:30", "America/New_York")).toBe(
    "2026-11-01T05:30:00.000Z",
  ));
it("moves a separate due time with a calendar drag across DST", () =>
  expect(
    shiftDue("2026-03-07T15:00:00Z", "America/New_York", {
      years: 0,
      months: 0,
      days: 1,
      milliseconds: 0,
    }),
  ).toBe("2026-03-08T14:00:00.000Z"));
