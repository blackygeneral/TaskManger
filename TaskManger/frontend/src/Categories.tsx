import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TextField,
  MenuItem,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Stack,
  IconButton,
} from "@mui/material";
import { Add, EditOutlined, DeleteOutlined } from "@mui/icons-material";
import { api } from "./api";
import type { Category, Task } from "./types";
export default function Categories({
  categories,
  tasks,
  onSaved,
}: {
  categories: Category[];
  tasks: Task[];
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Partial<Category> | null>(null),
    [deleting, setDeleting] = useState<Category | null>(null),
    [replacement, setReplacement] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      await api(
        editing.id ? `categories/${editing.id}/` : "categories/",
        editing.id ? "PATCH" : "POST",
        editing,
      );
      onSaved();
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`categories/${deleting.id}/`, "DELETE", {
        replacement: replacement ? Number(replacement) : null,
      });
      onSaved();
      setDeleting(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const symbols: Record<string, string> = {
    fitness: "⚡",
    restaurant: "♨",
    work: "▣",
    school: "▤",
    person: "◉",
    cart: "▱",
    heart: "♡",
    label: "◇",
  };
  return (
    <>
      <Button
        variant="outlined"
        startIcon={<Add />}
        sx={{ mb: 3 }}
        onClick={() => {
          setError("");
          setEditing({ name: "", color: "#6b5cdb", icon: "label" });
        }}
      >
        {t("add")} · {t("category")}
      </Button>
      <div className="category-grid">
        {categories.map((c) => (
          <section className="panel category-tile" key={c.id}>
            <div
              className="category-symbol"
              style={{ color: c.color, background: c.color + "18" }}
            >
              {symbols[c.icon] || "◇"}
            </div>
            <h3>{c.name}</h3>
            <p>
              {tasks.filter((x) => x.category === c.id).length} {t("tasks")}
            </p>
            <IconButton
              aria-label={t("edit") + " " + c.name}
              onClick={() => {
                setError("");
                setEditing(c);
              }}
            >
              <EditOutlined />
            </IconButton>
            <IconButton
              aria-label={t("delete") + " " + c.name}
              onClick={() => {
                setError("");
                setReplacement("");
                setDeleting(c);
              }}
            >
              <DeleteOutlined />
            </IconButton>
          </section>
        ))}
      </div>
      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{t("category")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label={t("name")}
              value={editing?.name || ""}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <TextField
              label={t("color")}
              type="color"
              value={editing?.color || "#6b5cdb"}
              onChange={(e) =>
                setEditing({ ...editing, color: e.target.value })
              }
            />
            <TextField
              select
              label={t("icon")}
              value={editing?.icon || "label"}
              onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
            >
              {Object.entries(symbols).map(([k, v]) => (
                <MenuItem key={k} value={k}>
                  {v} · {k}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>{t("cancel")}</Button>
          <Button disabled={busy || !editing?.name?.trim()} onClick={save}>
            {t("save")}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {t("deleteCategory")} · {deleting?.name}
        </DialogTitle>
        <DialogContent>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            sx={{ mt: 2 }}
            select
            fullWidth
            label={t("replacement")}
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
          >
            <MenuItem value="">{t("uncategorized")}</MenuItem>
            {categories
              .filter((c) => c.id !== deleting?.id)
              .map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {c.name}
                </MenuItem>
              ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>{t("cancel")}</Button>
          <Button color="error" disabled={busy} onClick={remove}>
            {t("delete")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
