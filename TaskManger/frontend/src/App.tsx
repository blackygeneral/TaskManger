import {
  useEffect,
  useMemo,
  useState,
  lazy,
  Suspense,
  useCallback,
} from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { prefixer } from "stylis";
import rtlPlugin from "stylis-plugin-rtl";
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Button,
  IconButton,
  TextField,
  MenuItem,
  Checkbox,
  Chip,
  Alert,
  Snackbar,
  LinearProgress,
  Skeleton,
  Drawer,
  Badge,
  Avatar,
  Stack,
  useMediaQuery,
} from "@mui/material";
import {
  Add,
  GridViewOutlined,
  CheckCircleOutlined,
  ViewKanbanOutlined,
  CalendarMonthOutlined,
  CategoryOutlined,
  SettingsOutlined,
  NotificationsNoneOutlined,
  Menu,
  Search,
  Logout,
  ArrowForward,
  ArrowOutward,
  MoreHoriz,
} from "@mui/icons-material";
import { DateTime } from "luxon";
import { api, ApiError } from "./api";
import type { Task, Category, User, Notice } from "./types";
import { taskDay } from "./dates";
import TaskEditor from "./TaskEditor";
import Auth from "./Auth";
import Settings from "./Settings";
import Categories from "./Categories";
const CalendarView = lazy(() => import("./CalendarView"));
const statuses: Task["status"][] = [
  "todo",
  "in_progress",
  "completed",
  "cancelled",
];
function useUpdates(userId: number | undefined) {
  const client = useQueryClient();
  const [online, setOnline] = useState(false);
  useEffect(() => {
    if (!userId) return;
    let socket: WebSocket;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    let delay = 1000;
    const connect = () => {
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/updates/`,
      );
      socket.onopen = () => {
        delay = 1000;
        setOnline(true);
        client.invalidateQueries();
      };
      socket.onmessage = () => client.invalidateQueries();
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        setOnline(false);
        if (!stopped) {
          timer = setTimeout(connect, delay);
          delay = Math.min(delay * 2, 30000);
        }
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket.close();
    };
  }, [userId, client]);
  return online;
}
export default function App() {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const darkSystem = useMediaQuery("(prefers-color-scheme: dark)");

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("auth/me/"),
    retry: false,
  });
  const user =
    me.error instanceof ApiError && me.error.status === 401
      ? undefined
      : me.data;
  const tasksQ = useQuery({
    queryKey: ["tasks", user?.id],
    queryFn: () => api<Task[]>("tasks/"),
    enabled: !!user,
  });
  const catsQ = useQuery({
    queryKey: ["categories", user?.id],
    queryFn: () => api<Category[]>("categories/"),
    enabled: !!user,
  });
  const noticesQ = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: () => api<Notice[]>("notifications/"),
    enabled: !!user,
  });
  const tasks = tasksQ.data || [],
    categories = catsQ.data || [],
    notices = noticesQ.data || [];
  const online = useUpdates(user?.id);
  const [drawer, setDrawer] = useState(false),
    [editor, setEditor] = useState<{
      task?: Task;
      initial?: Partial<Task>;
    } | null>(null),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [category, setCategory] = useState(""),
    [priority, setPriority] = useState(""),
    [sort, setSort] = useState("created");
  const preference =
    user?.theme || localStorage.getItem("taskflow-theme") || "system";
  const mode =
    preference === "system"
      ? darkSystem
        ? "dark"
        : "light"
      : (preference as "dark" | "light");
  const rtl = i18n.language === "ar";
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.documentElement.dataset.theme = mode;
    localStorage.setItem("taskflow-language", i18n.language);
    localStorage.setItem("taskflow-theme", preference);
  }, [i18n.language, rtl, mode, preference]);
  useEffect(() => {
    if (user) i18n.changeLanguage(user.language);
  }, [user?.language, i18n]);
  const theme = useMemo(
    () =>
      createTheme({
        direction: rtl ? "rtl" : "ltr",
        palette: {
          mode,
          primary: { main: mode === "dark" ? "#a79bff" : "#6b5cdb" },
          background: {
            default: mode === "dark" ? "#14151d" : "#f6f7fb",
            paper: mode === "dark" ? "#20212c" : "#fff",
          },
          text: {
            primary: mode === "dark" ? "#edecf6" : "#242536",
            secondary: mode === "dark" ? "#aaaabd" : "#858598",
          },
        },
        typography: {
          fontFamily: '"Segoe UI", Tahoma, Arial, sans-serif',
          button: { textTransform: "none", fontWeight: 600 },
        },
        shape: { borderRadius: 12 },
        components: {
          MuiButton: {
            styleOverrides: {
              root: {
                boxShadow: "none",
                borderRadius: 10,
                padding: "9px 18px",
              },
            },
          },
          MuiTextField: { defaultProps: { size: "small" } },
          MuiDialog: { styleOverrides: { paper: { borderRadius: 20 } } },
        },
      }),
    [mode, rtl],
  );
  const cache = useMemo(
    () =>
      createCache({
        key: rtl ? "taskflow-rtl" : "taskflow",
        stylisPlugins: rtl ? [prefixer, rtlPlugin] : [prefixer],
      }),
    [rtl],
  );
  const refresh = () => {
    client.invalidateQueries();
    setToast("saved");
  };
  const patch = useCallback(
    async (task: Task, data: Partial<Task>) => {
      try {
        await api(`tasks/${task.id}/`, "PATCH", {
          ...data,
          version: task.version,
        });
        client.invalidateQueries({ queryKey: ["tasks"] });
      } catch (e) {
        setError((e as Error).message);
        client.invalidateQueries({ queryKey: ["tasks"] });
        throw e;
      }
    },
    [client],
  );
  const requestedTask = new URLSearchParams(location.search).get("task");
  const linkedTask = tasks.find((x) => String(x.id) === requestedTask);
  const closeEditor = () => {
    setEditor(null);
    if (requestedTask) navigate(location.pathname, { replace: true });
  };
  const page = location.pathname.split("/")[1] || "dashboard";
  const nav = [
    ["dashboard", GridViewOutlined],
    ["tasks", CheckCircleOutlined],
    ["kanban", ViewKanbanOutlined],
    ["calendar", CalendarMonthOutlined],
    ["categories", CategoryOutlined],
    ["notifications", NotificationsNoneOutlined],
    ["account", SettingsOutlined],
  ] as const;
  const filtered = tasks
    .filter(
      (x) =>
        (!search ||
          `${x.title} ${x.description}`
            .toLowerCase()
            .includes(search.toLowerCase())) &&
        (!status || x.status === status) &&
        (!category || String(x.category) === category) &&
        (!priority || x.priority === priority),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : sort === "due"
          ? (a.due || a.date || a.start || "9999").localeCompare(
              b.due || b.date || b.start || "9999",
            )
          : b.created_at.localeCompare(a.created_at),
    );
  const now = DateTime.now().setZone(user?.timezone || "UTC"),
    today = now.toISODate()!;
  const active = tasks.filter(
    (x) => !["completed", "cancelled"].includes(x.status),
  );
  const todays = active.filter(
    (x) => taskDay(x, user?.timezone || "UTC") === today,
  );
  const overdue = active.filter((x) => {
    const day = taskDay(x, user?.timezone || "UTC");
    if (x.all_day) return !!day && day < today;
    const deadline = x.due || x.end || x.start;
    return !!deadline && DateTime.fromISO(deadline).toMillis() < now.toMillis();
  });
  const upcoming = active.filter((x) => {
    const day = taskDay(x, user?.timezone || "UTC");
    return day && day > today;
  });
  const completed = tasks.filter((x) => x.status === "completed").length;
  const card = (task: Task) => {
    const cat = categories.find((c) => c.id === task.category);
    return (
      <article
        className={`task-card ${task.status === "completed" ? "is-complete" : ""}`}
        key={task.id}
        draggable
        onDragStart={(e) => e.dataTransfer.setData("task", String(task.id))}
      >
        <div className="task-card-top">
          <Chip
            size="small"
            label={cat?.name || t("uncategorized")}
            sx={{
              background: (cat?.color || "#8b8b99") + "18",
              color: cat?.color || "text.secondary",
              borderRadius: "6px",
              fontSize: 11,
              fontWeight: 700,
            }}
          />
          <IconButton
            size="small"
            aria-label={t("edit") + " " + task.title}
            onClick={() => setEditor({ task })}
          >
            <MoreHoriz fontSize="small" />
          </IconButton>
        </div>
        <button className="task-title" onClick={() => setEditor({ task })}>
          {task.title}
        </button>
        {task.description && (
          <p className="task-description">{task.description}</p>
        )}
        <div className="task-meta">
          <span className={"priority " + task.priority}>
            ● {t(task.priority)}
          </span>
          <span>
            {task.all_day
              ? task.date
              : task.start || task.due
                ? DateTime.fromISO(task.due || task.start!, {
                    zone: user?.timezone,
                  })
                    .setLocale(i18n.language)
                    .toFormat("MMM d · HH:mm")
                : "—"}
          </span>
        </div>
        {task.subtasks.length > 0 && (
          <div className="task-checklist">
            <LinearProgress
              variant="determinate"
              value={
                (task.subtasks.filter((x) => x.done).length /
                  task.subtasks.length) *
                100
              }
            />
            <small>
              {task.subtasks.filter((x) => x.done).length}/
              {task.subtasks.length} {t("done")}
            </small>
          </div>
        )}
        <div className="task-card-bottom">
          <Checkbox
            size="small"
            checked={task.status === "completed"}
            slotProps={{
              input: {
                "aria-label":
                  t(task.status === "completed" ? "reopen" : "complete") +
                  " " +
                  task.title,
              },
            }}
            onChange={(_, checked) =>
              void patch(task, {
                status: checked ? "completed" : "todo",
              }).catch(() => {})
            }
          />
          <TextField
            variant="standard"
            select
            value={task.status}
            size="small"
            slotProps={{
              input: { disableUnderline: true },
              select: { inputProps: { "aria-label": t("status") } },
            }}
            onChange={(e) =>
              void patch(task, {
                status: e.target.value as Task["status"],
              }).catch(() => {})
            }
          >
            {statuses.map((s) => (
              <MenuItem key={s} value={s}>
                {t(s)}
              </MenuItem>
            ))}
          </TextField>
          {task.recurrence.frequency && <span title={t("repeat")}>↻</span>}
        </div>
      </article>
    );
  };
  const empty = (
    <div className="empty">
      <CheckCircleOutlined sx={{ fontSize: 42, color: "primary.main" }} />
      <h3>{t("empty")}</h3>
      <p>{t("emptyBody")}</p>
      <Button onClick={() => setEditor({})} startIcon={<Add />}>
        {t("newTask")}
      </Button>
    </div>
  );
  const sidebar = (
    <>
      <NavLink to="/dashboard" className="brand">
        <span className="brand-mark">✓</span>TaskFlow
        <span className="brand-dot">.</span>
      </NavLink>
      <p className="workspace-label">{t("workspace")}</p>
      <nav>
        {nav.map(([key, Icon]) => (
          <NavLink
            key={key}
            to={"/" + key}
            onClick={() => setDrawer(false)}
            className={({ isActive }) =>
              isActive ? "nav-item active" : "nav-item"
            }
          >
            <Icon fontSize="small" />
            <span>{t(key)}</span>
            {key === "notifications" &&
              notices.filter((n) => !n.read).length > 0 && (
                <span className="nav-count">
                  {notices.filter((n) => !n.read).length}
                </span>
              )}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-note">
        <span>✦</span>
        <strong>{t("tagline")}</strong>
        <p>{t("focus")}</p>
      </div>
      <div className="sidebar-user">
        <Avatar
          sx={{ width: 36, height: 36, bgcolor: "#e8e2ff", color: "#6754ce" }}
        >
          {(user?.first_name || user?.username || "?")[0].toUpperCase()}
        </Avatar>
        <div>
          <strong>{user?.first_name || user?.username}</strong>
          <small>{user?.email}</small>
        </div>
        <IconButton
          aria-label={t("logout")}
          onClick={async () => {
            await api("auth/logout/", "POST");
            client.clear();
            navigate("/login");
            window.location.reload();
          }}
        >
          <Logout fontSize="small" />
        </IconButton>
      </div>
    </>
  );
  return (
    <CacheProvider value={cache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {me.isPending ? (
          <div className="boot">
            <Skeleton width={240} height={80} />
          </div>
        ) : !user || ["verify", "reset", "forgot"].includes(page) ? (
          <Auth
            key={location.pathname}
            onLogin={() => {
              client.invalidateQueries({ queryKey: ["me"] });
              navigate("/dashboard");
            }}
          />
        ) : (
          <div className="app-shell">
            <aside className="sidebar">{sidebar}</aside>
            <Drawer
              open={drawer}
              onClose={() => setDrawer(false)}
              anchor={rtl ? "right" : "left"}
            >
              <div className="drawer-content">{sidebar}</div>
            </Drawer>
            <main className="main">
              <header className="topbar">
                <div>
                  <IconButton
                    className="mobile-menu"
                    aria-label="Menu"
                    onClick={() => setDrawer(true)}
                  >
                    <Menu />
                  </IconButton>
                  <span className="breadcrumb">
                    {t("workspace")} <span>/</span> {t(page)}
                  </span>
                </div>
                <Stack
                  direction="row"
                  sx={{ alignItems: "center" }}
                  spacing={2}
                >
                  <span className={`connection ${online ? "online" : ""}`}>
                    <i />
                    {t(online ? "connected" : "disconnected")}
                  </span>
                  <IconButton
                    component={NavLink}
                    to="/notifications"
                    aria-label={t("notifications")}
                  >
                    <Badge
                      badgeContent={notices.filter((n) => !n.read).length}
                      color="primary"
                    >
                      <NotificationsNoneOutlined />
                    </Badge>
                  </IconButton>
                </Stack>
              </header>
              <div className="page">
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">
                      {now
                        .setLocale(i18n.language)
                        .toLocaleString(DateTime.DATE_HUGE)}
                    </div>
                    <h1>{page === "dashboard" ? t("greeting") : t(page)}</h1>
                    <p>{page === "dashboard" ? t("focus") : t("tagline")}</p>
                  </div>
                  <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={() => setEditor({})}
                  >
                    {t("newTask")}
                  </Button>
                </div>
                {(tasksQ.isError || catsQ.isError) && (
                  <Alert
                    severity="error"
                    action={
                      <Button onClick={() => client.invalidateQueries()}>
                        {t("retry")}
                      </Button>
                    }
                  >
                    {String(tasksQ.error || catsQ.error)}
                  </Alert>
                )}
                {tasksQ.isPending || catsQ.isPending ? (
                  <div className="task-grid">
                    {[1, 2, 3].map((n) => (
                      <Skeleton key={n} variant="rounded" height={230} />
                    ))}
                  </div>
                ) : page === "dashboard" ? (
                  <>
                    <div className="stats-grid">
                      {[
                        [t("today"), todays.length, "#6c5cdd"],
                        [t("upcoming"), upcoming.length, "#4f9ca9"],
                        [t("overdue"), overdue.length, "#dc8a60"],
                        [t("completed"), completed, "#5baf87"],
                      ].map(([label, value, color]) => (
                        <div className="stat" key={label}>
                          <div
                            className="stat-icon"
                            style={{
                              color: String(color),
                              background: String(color) + "15",
                            }}
                          >
                            <ArrowOutward />
                          </div>
                          <span>{label}</span>
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </div>
                    <div className="dashboard-columns">
                      <section>
                        <div className="section-heading">
                          <h2>
                            {t("today")} <span>{todays.length}</span>
                          </h2>
                          <Button
                            onClick={() => navigate("/tasks")}
                            endIcon={<ArrowForward />}
                          >
                            {t("viewAll")}
                          </Button>
                        </div>
                        <div className="task-grid">
                          {todays.length ? todays.map(card) : empty}
                        </div>
                        <div className="section-heading">
                          <h2>{t("upcoming")}</h2>
                        </div>
                        <div className="task-grid">
                          {upcoming.length ? (
                            upcoming.slice(0, 4).map(card)
                          ) : (
                            <p className="muted">{t("emptyBody")}</p>
                          )}
                        </div>
                        {overdue.length > 0 && (
                          <>
                            <div className="section-heading">
                              <h2>{t("overdue")}</h2>
                            </div>
                            <div className="task-grid">
                              {overdue.slice(0, 4).map(card)}
                            </div>
                          </>
                        )}
                      </section>
                      <aside>
                        <div className="progress-panel">
                          <span className="eyebrow">{t("progress")}</span>
                          <div
                            className="progress-ring"
                            style={{
                              background: `conic-gradient(#8b79ed ${tasks.length ? (completed / tasks.length) * 360 : 0}deg, var(--line) 0deg)`,
                            }}
                          >
                            <div>
                              <strong>
                                {tasks.length
                                  ? Math.round((completed / tasks.length) * 100)
                                  : 0}
                                %
                              </strong>
                              <small>{t("done")}</small>
                            </div>
                          </div>
                          <h3>
                            {completed} / {tasks.length} {t("tasks")}
                          </h3>
                          <p>{t("tagline")}</p>
                        </div>
                        <div className="category-panel">
                          <h3>{t("categories")}</h3>
                          {categories.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => {
                                setCategory(String(c.id));
                                navigate("/tasks");
                              }}
                            >
                              <span>
                                <i style={{ background: c.color }} />
                                {c.name}
                              </span>
                              <strong>
                                {
                                  tasks.filter((x) => x.category === c.id)
                                    .length
                                }
                              </strong>
                            </button>
                          ))}
                        </div>
                      </aside>
                    </div>
                  </>
                ) : ["tasks", "kanban"].includes(page) ? (
                  <>
                    <div className="filters">
                      <TextField
                        label={t("search")}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        slotProps={{
                          input: {
                            startAdornment: (
                              <Search sx={{ mr: 1, color: "text.secondary" }} />
                            ),
                          },
                        }}
                      />
                      <TextField
                        select
                        label={t("status")}
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                      >
                        <MenuItem value="">{t("all")}</MenuItem>
                        {statuses.map((s) => (
                          <MenuItem key={s} value={s}>
                            {t(s)}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        select
                        label={t("category")}
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        <MenuItem value="">{t("all")}</MenuItem>
                        {categories.map((c) => (
                          <MenuItem key={c.id} value={c.id}>
                            {c.name}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        select
                        label={t("priority")}
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                      >
                        <MenuItem value="">{t("all")}</MenuItem>
                        {["low", "medium", "high", "urgent"].map((s) => (
                          <MenuItem key={s} value={s}>
                            {t(s)}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        select
                        label={t("sort")}
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        {["created", "title", "due"].map((s) => (
                          <MenuItem key={s} value={s}>
                            {t(s)}
                          </MenuItem>
                        ))}
                      </TextField>
                    </div>
                    {page === "kanban" ? (
                      <div className="kanban">
                        {statuses.map((s) => (
                          <section
                            key={s}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              const task = tasks.find(
                                (x) =>
                                  String(x.id) ===
                                  e.dataTransfer.getData("task"),
                              );
                              if (task)
                                void patch(task, { status: s }).catch(() => {});
                            }}
                          >
                            <h3>
                              <i className={"status-dot " + s} />
                              {t(s)}
                              <span>
                                {filtered.filter((x) => x.status === s).length}
                              </span>
                            </h3>
                            {filtered.filter((x) => x.status === s).map(card)}
                            <Button
                              fullWidth
                              startIcon={<Add />}
                              onClick={() =>
                                setEditor({ initial: { status: s } })
                              }
                            >
                              {t("newTask")}
                            </Button>
                          </section>
                        ))}
                      </div>
                    ) : (
                      <div className="task-grid all-tasks">
                        {filtered.length ? filtered.map(card) : empty}
                      </div>
                    )}
                  </>
                ) : page === "calendar" ? (
                  <Suspense
                    fallback={<Skeleton variant="rounded" height={500} />}
                  >
                    <CalendarView
                      user={user}
                      tasks={tasks}
                      categories={categories}
                      setEditor={setEditor}
                      patch={patch}
                    />
                  </Suspense>
                ) : page === "categories" ? (
                  <Categories
                    categories={categories}
                    tasks={tasks}
                    onSaved={refresh}
                  />
                ) : page === "account" ? (
                  <Settings key={user.id} user={user} onSaved={refresh} />
                ) : page === "notifications" ? (
                  <section className="panel">
                    <Button
                      onClick={async () => {
                        await api("notifications/read_all/", "POST");
                        refresh();
                      }}
                    >
                      {t("readAll")}
                    </Button>
                    {noticesQ.isError && (
                      <Alert severity="error">{String(noticesQ.error)}</Alert>
                    )}
                    {noticesQ.isPending ? (
                      <Skeleton variant="rounded" height={180} />
                    ) : notices.length ? (
                      notices.map((n) => (
                        <div
                          className={"notice " + (!n.read ? "unread" : "")}
                          key={n.id}
                        >
                          <NotificationsNoneOutlined />
                          <div>
                            <strong>{n.title}</strong>
                            <small>
                              {DateTime.fromISO(n.created_at, {
                                zone: user.timezone,
                              })
                                .setLocale(i18n.language)
                                .toLocaleString(DateTime.DATETIME_MED)}
                            </small>
                          </div>
                          {n.task && (
                            <Button
                              onClick={() => navigate("/tasks?task=" + n.task)}
                            >
                              {t("openTask")}
                            </Button>
                          )}
                          {!n.read && (
                            <Button
                              onClick={async () => {
                                await api(
                                  `notifications/${n.id}/read/`,
                                  "POST",
                                );
                                refresh();
                              }}
                            >
                              {t("read")}
                            </Button>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="empty">{t("noNotifications")}</div>
                    )}
                  </section>
                ) : (
                  <Alert severity="info">
                    <Button onClick={() => navigate("/dashboard")}>
                      {t("dashboard")}
                    </Button>
                  </Alert>
                )}
              </div>
            </main>
            {(editor || linkedTask) && (
              <TaskEditor
                allTasks={tasks}
                key={editor?.task?.id || linkedTask?.id || "new"}
                {...(editor || { task: linkedTask })}
                user={user}
                categories={categories}
                onClose={closeEditor}
                onSaved={refresh}
              />
            )}
          </div>
        )}
        <Snackbar
          open={!!toast}
          autoHideDuration={3500}
          onClose={() => setToast("")}
          message={t(toast)}
        />
        <Snackbar open={!!error} onClose={() => setError("")}>
          <Alert severity="error" onClose={() => setError("")}>
            {error}
          </Alert>
        </Snackbar>
      </ThemeProvider>
    </CacheProvider>
  );
}
