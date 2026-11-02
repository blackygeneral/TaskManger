import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Button,
  TextField,
  Alert,
  Stack,
  Typography,
  Chip,
} from "@mui/material";
import { ArrowForward, CheckCircleOutlined } from "@mui/icons-material";
import { api } from "./api";
const authSchema = z.object({
  username: z.string(),
  email: z.string(),
  identifier: z.string(),
  password: z.string(),
});
export default function Auth({ onLogin }: { onLogin: () => void }) {
  const location = useLocation(),
    { t, i18n } = useTranslation();
  const requestedMode = location.pathname.slice(1);
  const mode = ["register", "forgot", "reset", "verify"].includes(requestedMode)
    ? requestedMode
    : "login";
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit } = useForm({
    resolver: zodResolver(authSchema),
    defaultValues: { username: "", email: "", identifier: "", password: "" },
  });
  const submit = handleSubmit(async (data) => {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams(location.search);
      await api(`auth/${mode}/`, "POST", {
        ...data,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        uid: params.get("uid"),
        token: params.get("token"),
      });
      if (mode === "login" || mode === "register") onLogin();
      else
        setMessage(
          t(
            mode === "verify"
              ? "verificationSuccess"
              : mode === "reset"
                ? "resetSuccess"
                : "sent",
          ),
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  });
  return (
    <div className="auth-layout">
      <section className="auth-art">
        <Link to="/" className="brand">
          <span className="brand-mark">✓</span>TaskFlow
          <span className="brand-dot">.</span>
        </Link>
        <div>
          <Chip
            label={t("calm")}
            sx={{ color: "#ded9ff", background: "#ffffff12", mb: 3 }}
          />
          <h1>{t("welcome")}</h1>
          <p>{t("welcomeBody")}</p>
          <div className="orbit">
            <div className="orbit-card">
              <CheckCircleOutlined />
              <span>{t("tagline")}</span>
            </div>
            <div className="orbit-small">✦</div>
          </div>
        </div>
        <span className="auth-footer">{t("everyday")}</span>
      </section>
      <section className="auth-form">
        <Button
          className="language-button"
          onClick={() =>
            i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar")
          }
        >
          {i18n.language === "ar" ? "English" : "العربية"}
        </Button>
        <form onSubmit={submit}>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {t(mode === "forgot" ? "forgot" : mode)}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1, mb: 4 }}>
            {t("tagline")}
          </Typography>
          <Stack spacing={2.5}>
            {error && <Alert severity="error">{error}</Alert>}
            {message && <Alert severity="success">{message}</Alert>}
            {mode === "register" && (
              <TextField
                required
                label={t("username")}
                autoComplete="username"
                {...register("username")}
              />
            )}
            {["register", "forgot"].includes(mode) && (
              <TextField
                required
                label={t("email")}
                type="email"
                autoComplete="email"
                {...register("email")}
              />
            )}
            {mode === "login" && (
              <TextField
                required
                label={t("identifier")}
                autoComplete="username"
                {...register("identifier")}
              />
            )}
            {["login", "register", "reset"].includes(mode) && (
              <TextField
                required
                label={t("password")}
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                {...register("password")}
              />
            )}
            <Button
              size="large"
              type="submit"
              disabled={busy}
              variant="contained"
              endIcon={<ArrowForward />}
            >
              {busy
                ? t("loading")
                : t(
                    mode === "forgot"
                      ? "sendLink"
                      : mode === "verify"
                        ? "verifyEmail"
                        : mode,
                  )}
            </Button>
            {mode === "login" ? (
              <>
                <Button component={Link} to="/forgot">
                  {t("forgot")}
                </Button>
                <Button component={Link} to="/register" variant="outlined">
                  {t("register")}
                </Button>
              </>
            ) : (
              <Button component={Link} to="/login">
                {t("back")}
              </Button>
            )}
          </Stack>
        </form>
      </section>
    </div>
  );
}
