import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Stack,
  Typography,
  IconButton,
  Alert,
  Divider,
} from "@mui/material";
import { Close, Add, DeleteOutlined } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { Task, Category, User, Rule } from "./types";
import { localInput, toUTC } from "./dates";
import { api } from "./api";
const schema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string(),
  notes: z.string(),
  category: z.string(),
  status: z.enum(["todo", "in_progress", "completed", "cancelled"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  all_day: z.boolean(),
  start: z.string(),
  end: z.string(),
  due: z.string(),
  date: z.string(),
  end_date: z.string(),
  frequency: z.string(),
  count: z.number().int().min(2).max(366),
  scope: z.string(),
});
type Form = z.infer<typeof schema>;
export default function TaskEditor({
  task: taskProp,
  allTasks = [],
  initial,
  user,
  categories,
  onClose,
  onSaved,
}: {
  task?: Task;
  allTasks?: Task[];
  initial?: Partial<Task>;
  user: User;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [task] = useState(taskProp);
  const base = task || initial || {};
  const [scopeVersions] = useState(() =>
    Object.fromEntries(
      allTasks
        .filter((x) => x.series === task?.series)
        .map((x) => [String(x.id), x.version]),
    ),
  );
  const zone = task?.timezone || user.timezone;
  const [subtasks, setSubtasks] = useState(base.subtasks || []);
  const [sub, setSub] = useState("");
  const [rules, setRules] = useState<Rule[]>(base.reminder_rules || []);
  const [days, setDays] = useState<number[]>(base.recurrence?.days || [0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const {
    register,
    control,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: base.title || "",
      description: base.description || "",
      notes: base.notes || "",
      category: String(base.category || ""),
      status: base.status || "todo",
      priority: base.priority || "medium",
      all_day: base.all_day || false,
      start: localInput(base.start, zone),
      end: localInput(base.end, zone),
      due: localInput(base.due, zone),
      date: base.date || "",
      end_date: base.end_date || "",
      frequency: base.recurrence?.frequency || "",
      count: base.recurrence?.count || 12,
      scope: "one",
    },
  });
  const allDay = watch("all_day"),
    frequency = watch("frequency");
  const submit = handleSubmit(async (data) => {
    setBusy(true);
    setError("");
    try {
      const body = {
        title: data.title,
        description: data.description,
        notes: data.notes,
        category: data.category ? Number(data.category) : null,
        status: data.status,
        priority: data.priority,
        all_day: data.all_day,
        start: allDay ? null : toUTC(data.start, zone),
        end: allDay ? null : toUTC(data.end, zone),
        due: allDay ? null : toUTC(data.due, zone),
        date: allDay ? data.date : null,
        end_date: allDay ? data.end_date || null : null,
        timezone: zone,
        subtasks,
        reminder_rules: rules,
        recurrence: frequency
          ? {
              frequency,
              count: data.count,
              ...(frequency === "weekdays" ? { days } : {}),
            }
          : {},
        scope: data.scope,
        scope_versions: scopeVersions,
        ...(task ? { version: task.version } : {}),
      };
      await api(
        task ? `tasks/${task.id}/` : "tasks/",
        task ? "PATCH" : "POST",
        body,
      );
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  });
  const remove = async () => {
    if (!task) return;
    setBusy(true);
    try {
      await api(`tasks/${task.id}/`, "DELETE", {
        version: task.version,
        scope: watch("scope"),
        scope_versions: scopeVersions,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const select = (
    name: "category" | "status" | "priority" | "frequency" | "scope",
    label: string,
    options: [string, string][],
  ) => (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <TextField {...field} select label={label} fullWidth>
          {options.map(([v, label]) => (
            <MenuItem key={v} value={v}>
              {label}
            </MenuItem>
          ))}
        </TextField>
      )}
    />
  );
  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <form onSubmit={submit}>
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {task ? t("edit") : t("newTask")}
          <IconButton onClick={onClose} aria-label={t("cancel")}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              autoFocus
              label={t("title")}
              {...register("title")}
              error={!!errors.title}
              helperText={errors.title?.message}
              fullWidth
            />
            <TextField
              label={t("description")}
              {...register("description")}
              multiline
              minRows={2}
            />
            <div className="form-grid">
              {select("category", t("category"), [
                ["", t("uncategorized")],
                ...categories.map(
                  (c) => [String(c.id), c.name] as [string, string],
                ),
              ])}
              {select(
                "priority",
                t("priority"),
                ["low", "medium", "high", "urgent"].map((x) => [x, t(x)]),
              )}
              {select(
                "status",
                t("status"),
                ["todo", "in_progress", "completed", "cancelled"].map((x) => [
                  x,
                  t(x),
                ]),
              )}
            </div>
            <Controller
              name="all_day"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={
                    <Checkbox checked={field.value} onChange={field.onChange} />
                  }
                  label={t("allDay")}
                />
              )}
            />
            <Typography variant="caption" color="text.secondary">
              {t("dateHint")} · {zone}
            </Typography>
            <div className="form-grid">
              {(allDay ? ["date", "end_date"] : ["start", "end", "due"]).map(
                (name) => (
                  <TextField
                    key={name}
                    label={t(name === "end_date" ? "endDate" : name)}
                    type={allDay ? "date" : "datetime-local"}
                    slotProps={{ inputLabel: { shrink: true } }}
                    {...register(name as keyof Form)}
                  />
                ),
              )}
            </div>
            <Divider />
            <Typography sx={{ fontWeight: 700 }}>{t("subtasks")}</Typography>
            {subtasks.map((s, i) => (
              <Stack key={i} direction="row" sx={{ alignItems: "center" }}>
                <Checkbox
                  slotProps={{ input: { "aria-label": s.title } }}
                  checked={s.done}
                  onChange={(_, done) =>
                    setSubtasks(
                      subtasks.map((x, j) => (j === i ? { ...x, done } : x)),
                    )
                  }
                />
                <TextField
                  value={s.title}
                  size="small"
                  fullWidth
                  onChange={(e) =>
                    setSubtasks(
                      subtasks.map((x, j) =>
                        j === i ? { ...x, title: e.target.value } : x,
                      ),
                    )
                  }
                />
                <IconButton
                  aria-label={t("delete")}
                  onClick={() =>
                    setSubtasks(subtasks.filter((_, j) => i !== j))
                  }
                >
                  <Close />
                </IconButton>
              </Stack>
            ))}
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                fullWidth
                label={t("addSubtask")}
                value={sub}
                onChange={(e) => setSub(e.target.value)}
              />
              <Button
                onClick={() => {
                  if (sub.trim()) {
                    setSubtasks([
                      ...subtasks,
                      { title: sub.trim(), done: false },
                    ]);
                    setSub("");
                  }
                }}
              >
                {t("add")}
              </Button>
            </Stack>
            <TextField
              label={t("notes")}
              {...register("notes")}
              multiline
              minRows={2}
            />
            <Divider />
            <div className="form-grid">
              {select(
                "frequency",
                t("repeat"),
                ["", "daily", "weekly", "weekdays"].map((x) => [
                  x,
                  t(x || "none"),
                ]),
              )}
              {frequency && (
                <TextField
                  label={t("count")}
                  type="number"
                  {...register("count", { valueAsNumber: true })}
                  error={!!errors.count}
                  helperText={errors.count?.message}
                />
              )}
            </div>
            {frequency === "weekdays" && (
              <div>
                {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(
                  (day, i) => (
                    <FormControlLabel
                      key={day}
                      label={t(day)}
                      control={
                        <Checkbox
                          checked={days.includes(i)}
                          onChange={(_, v) =>
                            setDays(
                              v ? [...days, i] : days.filter((d) => d !== i),
                            )
                          }
                        />
                      }
                    />
                  ),
                )}
              </div>
            )}
            {frequency && (
              <Typography variant="caption">{t("recurrenceHint")}</Typography>
            )}
            {task?.recurrence.frequency &&
              select(
                "scope",
                t("scope"),
                ["one", "future", "series"].map((x) => [x, t(x)]),
              )}
            <Divider />
            <Stack direction="row" sx={{ justifyContent: "space-between" }}>
              <Typography sx={{ fontWeight: 700 }}>{t("reminders")}</Typography>
              <Button
                startIcon={<Add />}
                onClick={() =>
                  setRules([...rules, { channel: "in_app", minutes: 10 }])
                }
                disabled={rules.length >= 12}
              >
                {t("add")}
              </Button>
            </Stack>
            {rules.map((rule, i) => (
              <div className="reminder-row" key={i}>
                <TextField
                  select
                  size="small"
                  label={t("reminders")}
                  value={rule.channel}
                  onChange={(e) =>
                    setRules(
                      rules.map((x, j) =>
                        j === i
                          ? { ...x, channel: e.target.value as Rule["channel"] }
                          : x,
                      ),
                    )
                  }
                >
                  {["in_app", "email", "sms"].map((c) => (
                    <MenuItem
                      disabled={
                        c === "sms" &&
                        !(user.phone_verified && user.sms_consent)
                      }
                      key={c}
                      value={c}
                    >
                      {t(c)}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  size="small"
                  label={t("schedule")}
                  value={
                    rule.at !== undefined ? "custom" : String(rule.minutes)
                  }
                  onChange={(e) =>
                    setRules(
                      rules.map((x, j) =>
                        j === i
                          ? {
                              channel: x.channel,
                              ...(e.target.value === "custom"
                                ? { at: new Date().toISOString() }
                                : { minutes: Number(e.target.value) }),
                            }
                          : x,
                      ),
                    )
                  }
                >
                  {[0, 10, 30, 60, 1440].map((n) => (
                    <MenuItem key={n} value={String(n)}>
                      {n} · {t("minutes")}
                    </MenuItem>
                  ))}
                  <MenuItem value="custom">{t("custom")}</MenuItem>
                </TextField>
                {rule.at !== undefined && (
                  <TextField
                    size="small"
                    type="datetime-local"
                    value={localInput(rule.at, zone)}
                    onChange={(e) => {
                      try {
                        const at = toUTC(e.target.value, zone);
                        if (at)
                          setRules(
                            rules.map((x, j) =>
                              j === i ? { channel: x.channel, at } : x,
                            ),
                          );
                      } catch (err) {
                        setError((err as Error).message);
                      }
                    }}
                  />
                )}
                <IconButton
                  aria-label={t("delete")}
                  onClick={() => setRules(rules.filter((_, j) => i !== j))}
                >
                  <DeleteOutlined />
                </IconButton>
              </div>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3, flexWrap: "wrap", gap: 1 }}>
          {task && (
            <Button color="error" onClick={() => setDeleting(true)}>
              {t("delete")}
            </Button>
          )}
          <span style={{ flex: 1 }} />
          <Button onClick={onClose}>{t("cancel")}</Button>
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? t("loading") : t("save")}
          </Button>
        </DialogActions>
      </form>
      <Dialog open={deleting} onClose={() => setDeleting(false)}>
        <DialogTitle>{t("confirmDelete")}</DialogTitle>
        <DialogContent>
          {t("deleteWarning")} {t(watch("scope"))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(false)}>{t("cancel")}</Button>
          <Button color="error" disabled={busy} onClick={remove}>
            {t("delete")}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
