import { test, expect } from "@playwright/test";
test("account, category, calendar, realtime, reminders, appearance and mobile", async ({
  page,
  context,
  request,
}) => {
  const suffix = Date.now();
  const username = `flow${suffix}`;
  const email = `flow${suffix}@example.test`;
  const password = "Strong-TaskFlow-42!";
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/register");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Let’s make today a good day." }),
  ).toBeVisible();
  await expect(page.getByText("Live updates", { exact: true })).toBeVisible();
  // Verify via the local Mailpit inbox. No email leaves the machine.
  const inbox = await (
    await request.get(
      process.env.MAILPIT_URL || "http://localhost:58025/api/v1/messages",
    )
  ).json();
  const message = inbox.messages.find((m: { To: { Address: string }[] }) =>
    m.To.some((to) => to.Address === email),
  );
  expect(message).toBeTruthy();
  const mail = await (
    await request.get(
      `${process.env.MAILPIT_DETAIL_URL || "http://localhost:58025/api/v1/message"}/${message.ID}`,
    )
  ).json();
  const link = mail.Text.match(/http[^\s]+\/verify\?token=[^\s]+/)[0];
  await page.goto(link);
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(
    page.getByText("Your email is verified. You can sign in."),
  ).toBeVisible();
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Username or email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Live updates", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Categories", exact: true }).click();
  await page.getByRole("button", { name: "Add · Category" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("Creative projects");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save changes" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Creative projects" }),
  ).toBeVisible();
  const second = await context.newPage();
  await second.goto("/tasks");
  await expect(second.getByText("Live updates", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "New task", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Title", { exact: true })
    .fill("Plan the next chapter");
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("A focused session for the things that matter.");
  await dialog.getByLabel("Category", { exact: true }).click();
  await page
    .getByRole("option", { name: "Creative projects", exact: true })
    .click();
  const today = new Date().toISOString().slice(0, 10);
  await dialog.getByLabel("All day", { exact: true }).check();
  await dialog.getByLabel("Date", { exact: true }).fill(today);
  await dialog.getByLabel("Add a checklist item").fill("Write an outline");
  await dialog
    .getByRole("button", { name: "Add", exact: true })
    .first()
    .click();
  await dialog.getByRole("button", { name: "Add", exact: true }).last().click();
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    second.getByRole("button", { name: "Plan the next chapter", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Calendar", exact: true }).click();
  await page
    .locator(".fc-event")
    .filter({ hasText: "Plan the next chapter" })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Title", { exact: true })
    .fill("Calendar updated task");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save changes" })
    .click();
  await expect(
    second.getByRole("button", { name: "Calendar updated task", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".MuiBackdrop-root")).toHaveCount(0);
  // Move one calendar day using drag-and-drop and verify persisted date.
  const event = page
    .locator(".fc-daygrid-event")
    .filter({ hasText: "Calendar updated task" });
  const next = new Date(today + "T12:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  const nextDay = next.toISOString().slice(0, 10);
  await page.bringToFront();
  await event.scrollIntoViewIfNeeded();
  const source = await event.boundingBox();
  const target = await page.locator(`[data-date="${nextDay}"]`).boundingBox();
  if (!source || !target) throw new Error("Calendar drag targets missing");
  await page.mouse.move(source.x + 30, source.y + 10);
  await page.mouse.down();
  await page.mouse.move(source.x + 40, source.y + 10, { steps: 3 });
  await page.waitForTimeout(400);
  await page.mouse.move(target.x + 30, source.y + 10, { steps: 20 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await expect
    .poll(async () => {
      const tasks = await (await page.request.get("/api/tasks/")).json();
      return tasks.find(
        (x: { title: string }) => x.title === "Calendar updated task",
      ).date;
    })
    .toBe(nextDay);
  await expect(second.locator(".task-meta")).toContainText(nextDay);
  await second
    .getByRole("checkbox", { name: "Complete Calendar updated task" })
    .click();
  await expect(
    second.getByRole("checkbox", { name: "Reopen Calendar updated task" }),
  ).toBeChecked();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(
    page.locator(".stat").filter({ hasText: "Completed" }).locator("strong"),
  ).toHaveText("1");
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await page.getByLabel("Appearance", { exact: true }).click();
  await page.getByRole("option", { name: "Dark", exact: true }).click();
  await page.getByLabel("Language", { exact: true }).click();
  await page.getByRole("option", { name: "العربية", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "test-results/taskflow-account-ar-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("link", { name: "نظرة عامة", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "لنصنع يومًا جميلًا." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/taskflow-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await second.close();
});

test("beat and worker persist email, in-app and simulated SMS outcomes", async ({
  request,
}) => {
  const suffix = Date.now();
  const email = `reminder${suffix}@example.test`;
  const post = async (path: string, body: unknown) => {
    const csrf = await (await request.get("/api/auth/csrf/")).json();
    const response = await request.post("/api/" + path, {
      data: body,
      headers: {
        "X-CSRFToken": csrf.csrfToken,
        Origin: process.env.E2E_URL || "http://localhost:5173",
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  await post("auth/register/", {
    username: `reminder${suffix}`,
    email,
    password: "Strong-TaskFlow-42!",
  });
  const inbox = await (
    await request.get(
      process.env.MAILPIT_URL || "http://localhost:58025/api/v1/messages",
    )
  ).json();
  const message = inbox.messages.find((m: { To: { Address: string }[] }) =>
    m.To.some((to) => to.Address === email),
  );
  const mail = await (
    await request.get(
      `${process.env.MAILPIT_DETAIL_URL || "http://localhost:58025/api/v1/message"}/${message.ID}`,
    )
  ).json();
  await post("auth/verify/", {
    token: new URL(
      mail.Text.match(/http[^\s]+\/verify\?token=[^\s]+/)[0],
    ).searchParams.get("token"),
  });
  await post("phone/", {
    action: "start",
    phone: "+15551234567",
    consent: true,
  });
  await post("phone/", { action: "verify", code: "000000" });
  const task = await post("tasks/", {
    title: "Local worker delivery check",
    due: new Date(Date.now() - 3000).toISOString(),
    reminder_rules: [
      { channel: "email", minutes: 0 },
      { channel: "in_app", minutes: 0 },
      { channel: "sms", minutes: 0 },
    ],
  });
  await expect
    .poll(
      async () => {
        const reminders = await (await request.get("/api/reminders/")).json();
        return reminders
          .filter((r: { task: number }) => r.task === task.id)
          .map((r: { state: string }) => r.state)
          .sort();
      },
      { timeout: 70000, intervals: [1000, 3000, 5000] },
    )
    .toEqual(["accepted", "created", "simulated"]);
  const notices = await (await request.get("/api/notifications/")).json();
  expect(
    notices.filter((n: { task: number }) => n.task === task.id),
  ).toHaveLength(1);
  const messages = await (
    await request.get(
      process.env.MAILPIT_URL || "http://localhost:58025/api/v1/messages",
    )
  ).json();
  expect(
    messages.messages.some(
      (m: { Subject: string; To: { Address: string }[] }) =>
        m.Subject.includes("Local worker delivery check") &&
        m.To.some((to) => to.Address === email),
    ),
  ).toBeTruthy();
});
