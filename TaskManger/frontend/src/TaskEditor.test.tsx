import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "./i18n";
import TaskEditor from "./TaskEditor";
import type { User } from "./types";
import { api } from "./api";
vi.mock("./api", () => ({ api: vi.fn().mockResolvedValue({}) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const user = {
  timezone: "UTC",
  phone_verified: false,
  sms_consent: false,
} as User;
describe("task editor", () => {
  it("validates title before posting", async () => {
    render(
      <TaskEditor
        user={user}
        categories={[]}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(screen.getByText(/Too small/)).toBeInTheDocument(),
    );
    expect(api).not.toHaveBeenCalled();
  });
  it("creates an all-day task and checklist", async () => {
    const saved = vi.fn();
    render(
      <TaskEditor
        user={user}
        categories={[]}
        initial={{ all_day: true, date: "2026-10-26" }}
        onClose={() => {}}
        onSaved={saved}
      />,
    );
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Plan dinner" },
    });
    fireEvent.change(screen.getByLabelText("Add a checklist item"), {
      target: { value: "Vegetables" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(api).toHaveBeenCalledWith(
      "tasks/",
      "POST",
      expect.objectContaining({
        title: "Plan dinner",
        date: "2026-10-26",
        start: null,
        subtasks: [{ title: "Vegetables", done: false }],
      }),
    );
  });
});
