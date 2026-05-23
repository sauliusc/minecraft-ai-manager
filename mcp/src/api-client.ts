/**
 * Authenticated HTTP client for the CraftControl REST API.
 *
 * Logs in with email + password on first request, automatically re-logs when
 * the JWT expires (401 response), and exposes typed get/post/patch/delete helpers.
 */

export class ApiClient {
  private baseUrl: string;
  private email: string;
  private password: string;
  private token: string | null = null;

  constructor(baseUrl: string, email: string, password: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.email = email;
    this.password = password;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  private async login(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`CraftControl login failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as { token?: string; accessToken?: string };
    this.token = data.token ?? data.accessToken ?? null;
    if (!this.token) throw new Error("Login response did not include a token");
  }

  private async ensureAuth(): Promise<void> {
    if (!this.token) await this.login();
  }

  // ── Core request ──────────────────────────────────────────────────────────

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    await this.ensureAuth();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      // Token expired — refresh and retry once
      this.token = null;
      await this.login();
      return this.request(method, path, body);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${method} ${path} failed (${res.status}): ${text}`);
    }

    // 204 No Content
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }
  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }
  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }
  del<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }
}
