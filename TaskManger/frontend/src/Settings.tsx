import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  TextField,
  MenuItem,
  Button,
  Stack,
  Alert,
  FormControlLabel,
  Checkbox,
  Chip,
  Typography,
  Divider,
} from "@mui/material";
import { api } from "./api";
import type { User } from "./types";
export default function Settings({
  user,
  onSaved,
}: {
  user: User;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [values, setValues] = useState({
    first_name: user.first_name,
    timezone: user.timezone,
    theme: user.theme,
    language: user.language,
    email_notifications: user.email_notifications,
  });
  const [phone, setPhone] = useState(user.phone),
    [consent, setConsent] = useState(false),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const history = useQuery({
    queryKey: ["reminders", user.id],
    queryFn: () =>
      api<
        {
          id: number;
          task: number;
          channel: string;
          state: string;
          scheduled_at: string;
          attempts: number;
        }[]
      >("reminders/"),
  });
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      onSaved();
      setMessage("saved");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const phoneAction = (action: string) =>
    run(() => api("phone/", "POST", { action, phone, consent, code }));
  return (
    <div className="settings-grid">
      <section className="panel">
        <h2>{t("account")}</h2>
        <Stack spacing={2.5}>
          {error && <Alert severity="error">{error}</Alert>}
          {message && <Alert severity="success">{t(message)}</Alert>}
          <TextField
            label={t("name")}
            value={values.first_name}
            onChange={(e) =>
              setValues({ ...values, first_name: e.target.value })
            }
          />
          <TextField
            label={t("timezone")}
            value={values.timezone}
            onChange={(e) => setValues({ ...values, timezone: e.target.value })}
            helperText="Asia/Jerusalem · Europe/London · America/New_York · UTC"
          />
          <TextField
            select
            label={t("theme")}
            value={values.theme}
            onChange={(e) =>
              setValues({ ...values, theme: e.target.value as User["theme"] })
            }
          >
            {["light", "dark", "system"].map((x) => (
              <MenuItem key={x} value={x}>
                {t(x)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label={t("language")}
            value={values.language}
            onChange={(e) =>
              setValues({
                ...values,
                language: e.target.value as User["language"],
              })
            }
          >
            <MenuItem value="en">English</MenuItem>
            <MenuItem value="ar">العربية</MenuItem>
          </TextField>
          <FormControlLabel
            label={t("emailNotifications")}
            control={
              <Checkbox
                checked={values.email_notifications}
                onChange={(_, v) =>
                  setValues({ ...values, email_notifications: v })
                }
              />
            }
          />
          <Button
            disabled={busy}
            variant="contained"
            onClick={() => run(() => api("profile/", "PATCH", values))}
          >
            {t("save")}
          </Button>
          <Divider />
          <Typography>
            {user.email}{" "}
            <Chip
              size="small"
              color={user.email_verified ? "success" : "default"}
              label={t(user.email_verified ? "verified" : "unverified")}
            />
          </Typography>
          {!user.email_verified && (
            <>
              <Alert severity="info">{t("verifyHint")}</Alert>
              <Button
                disabled={busy}
                onClick={() => run(() => api("auth/resend/", "POST"))}
              >
                {t("resend")}
              </Button>
            </>
          )}
        </Stack>
      </section>
      <section className="panel">
        <h2>SMS</h2>
        <Stack spacing={2.5}>
          <Typography>{t("phonePrompt")}</Typography>
          <Typography variant="caption">{t("phoneCost")}</Typography>
          {user.sms_provider === "mock" && (
            <Alert severity="info">{t("simulation")}</Alert>
          )}
          <Chip
            label={t(user.phone_verified ? "verified" : "unverified")}
            color={user.phone_verified ? "success" : "default"}
          />
          <TextField
            label={t("phone")}
            placeholder="+972501234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            slotProps={{ htmlInput: { dir: "ltr" } }}
          />
          <FormControlLabel
            label={t("consent")}
            control={
              <Checkbox checked={consent} onChange={(_, v) => setConsent(v)} />
            }
          />
          <Button
            disabled={!consent || busy || user.sms_provider === "disabled"}
            variant="outlined"
            onClick={() => phoneAction("start")}
          >
            {t("verify")} · {t("phone")}
          </Button>
          <TextField
            label={t("code")}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="one-time-code"
          />
          <Button
            disabled={busy || !code}
            onClick={() => phoneAction("verify")}
          >
            {t("verify")}
          </Button>
          {user.phone && (
            <Stack direction="row">
              <Button
                disabled={busy}
                onClick={() => phoneAction("unsubscribe")}
              >
                {t("unsubscribe")}
              </Button>
              <Button
                disabled={busy}
                color="error"
                onClick={() => phoneAction("remove")}
              >
                {t("removePhone")}
              </Button>
            </Stack>
          )}
        </Stack>
      </section>
      <section className="panel history-panel">
        <h2>{t("history")}</h2>
        {history.isError && (
          <Alert severity="error">{String(history.error)}</Alert>
        )}
        {history.isPending ? (
          <p>{t("loading")}</p>
        ) : history.data?.length ? (
          history.data.slice(0, 50).map((r) => (
            <div className="history-row" key={r.id}>
              <span>
                #{r.task} · {t(r.channel)}
              </span>
              <span>
                {new Date(r.scheduled_at).toLocaleString(user.language, {
                  timeZone: user.timezone,
                })}
              </span>
              <Chip
                size="small"
                label={t(r.state === "created" ? "createdState" : r.state)}
              />
              <small>×{r.attempts}</small>
            </div>
          ))
        ) : (
          <p>{t("noHistory")}</p>
        )}
      </section>
    </div>
  );
}
