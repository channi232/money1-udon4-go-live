export type ServerSession = {
  authenticated: boolean;
  username: string | null;
  role: "finance" | "personnel" | "admin" | "guest";
};

const FALLBACK: ServerSession = {
  authenticated: false,
  username: null,
  role: "guest",
};

export async function fetchSession(): Promise<ServerSession> {
  try {
    const res = await fetch("/api/session.php", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });
    if (!res.ok) return FALLBACK;
    const data = (await res.json()) as ServerSession;
    if (!data || typeof data.authenticated !== "boolean") return FALLBACK;
    return data;
  } catch {
    return FALLBACK;
  }
}
