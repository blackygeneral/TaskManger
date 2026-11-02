export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function readResponse(
  response: Response,
  path: string,
): Promise<unknown> {
  if (response.status === 204) return null;
  const type = response.headers.get("content-type")?.split(";")[0].trim();
  if (type !== "application/json" && !type?.endsWith("+json")) {
    const reason =
      response.status === 403
        ? "Request rejected. Refresh the page and use the same hostname for the app and login."
        : response.status >= 500
          ? "The server is unavailable or encountered an error. Check the backend logs and try again."
          : "The API returned a web page instead of JSON. Check that /api/ is routed to the Django backend.";
    throw new ApiError(
      `${reason} (${path}, HTTP ${response.status})`,
      response.status,
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      `Invalid JSON response from ${path} (HTTP ${response.status}).`,
      response.status,
    );
  }
  if (!response.ok) {
    const detail =
      data && typeof data === "object" && "detail" in data
        ? data.detail
        : undefined;
    throw new ApiError(
      typeof detail === "string" ? detail : JSON.stringify(data),
      response.status,
    );
  }
  return data;
}

export async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let csrf: string | undefined;
  if (method !== "GET") {
    const csrfPath = "/api/auth/csrf/";
    const response = await fetch(csrfPath, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const data = await readResponse(response, csrfPath);
    if (
      !data ||
      typeof data !== "object" ||
      !("csrfToken" in data) ||
      typeof data.csrfToken !== "string" ||
      !data.csrfToken
    ) {
      throw new ApiError(
        "Could not obtain a CSRF token. Refresh the page and try again.",
        response.status,
      );
    }
    csrf = data.csrfToken;
  }
  const url = "/api/" + path;
  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRFToken": csrf } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return (await readResponse(response, url)) as T;
}
