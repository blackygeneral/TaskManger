import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";
afterEach(() => vi.unstubAllGlobals());
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
describe("API response handling", () => {
  it("reports HTML fallback pages without exposing HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<!DOCTYPE html><secret>", {
            headers: { "Content-Type": "text/html" },
          }),
        ),
    );
    await expect(api("tasks/")).rejects.toThrow("Check that /api/ is routed");
  });
  it("stops the mutation when CSRF returns an HTML error", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("<!DOCTYPE html>", {
          status: 502,
          headers: { "Content-Type": "text/html" },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(api("auth/login/", "POST", {})).rejects.toMatchObject({
      name: "ApiError",
      status: 502,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("preserves JSON validation errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ detail: "Sign in required" }, 401)),
    );
    await expect(api("auth/me/")).rejects.toThrow("Sign in required");
  });
  it("rejects malformed JSON as an API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<!DOCTYPE html>", {
            headers: { "Content-Type": "application/json" },
          }),
        ),
    );
    await expect(api("tasks/")).rejects.toBeInstanceOf(ApiError);
  });
  it("rejects a missing CSRF token before submitting", async () => {
    const fetch = vi.fn().mockResolvedValue(json({}));
    vi.stubGlobal("fetch", fetch);
    await expect(api("tasks/", "POST", {})).rejects.toThrow("CSRF token");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("sends the fresh CSRF token and accepts an empty delete response", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ csrfToken: "fresh-token" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    await expect(api("tasks/1/", "DELETE", { version: 1 })).resolves.toBeNull();
    expect(fetch.mock.calls[1][1].headers["X-CSRFToken"]).toBe("fresh-token");
  });
});
