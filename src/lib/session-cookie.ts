export const SESSION_COOKIE_NAME = "mundial_session";

export const PUBLIC_PATHS = new Set(["/login", "/register"]);

export function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/api/calendar/") ||
    // Autenticadas con su propio secreto (verifyIntegrationSecret), no con cookie de sesion:
    // las llama n8n server-to-server, nunca un navegador con sesion de usuario.
    pathname.startsWith("/api/integrations/football/")
  );
}

export function safeRedirectPath(path: string | null | undefined) {
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return "/dashboard";
  }

  if (isPublicPath(path)) {
    return "/dashboard";
  }

  return path;
}

export function loginRedirectUrl(
  requestPath: string,
  reason: "missing" | "expired" = "expired",
) {
  const params = new URLSearchParams();
  params.set("reason", reason);

  if (!isPublicPath(requestPath) && requestPath !== "/") {
    params.set("next", requestPath);
  }

  return `/login?${params.toString()}`;
}
