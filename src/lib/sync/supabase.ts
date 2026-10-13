/**
 * Minimal Supabase client over fetch (Auth password grant + PostgREST), so cloud backup needs no SDK.
 * Only the public anon key is used; the service-role key must never be in this app.
 */
import type { CloudCredentials, WrappedKey } from "./crypto";
import { type CommitInput, type CommitResult, RemoteError, type SyncRemote } from "./engine";

export interface CloudConfig {
  url: string;
  anonKey: string;
  /** Domain for the login emails derived from recovery keys (no mail is sent). */
  emailDomain: string;
}

export function cloudConfig(): CloudConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // HTTPS only, except a local Supabase (`supabase start`) on this machine.
  if (!url || !anonKey || !/^(https:\/\/|http:\/\/(127\.0\.0\.1|localhost)[:/])/.test(url)) return null;
  return {
    url: url.replace(/\/+$/, ""),
    anonKey,
    emailDomain: process.env.NEXT_PUBLIC_BACKUP_EMAIL_DOMAIN || "backup.moneytrack.invalid",
  };
}

export interface SnapshotInfo {
  id: string;
  deviceId: string;
  revision: number;
  format: number;
  sizeBytes: number;
  createdAt: string;
}

export interface SnapshotPayload extends SnapshotInfo {
  iv: string;
  ciphertext: string;
  sha256: string;
}

interface Session {
  accessToken: string;
  userId: string;
  expiresAt: number;
}

const COMMIT_TIMEOUT_MS = 60_000;

export class SupabaseBackupClient implements SyncRemote {
  private session: Session | null = null;
  private readonly config: CloudConfig;
  private readonly credentials: CloudCredentials;

  constructor(config: CloudConfig, credentials: CloudCredentials) {
    this.config = config;
    this.credentials = credentials;
  }

  /** Create the login (first enable). Succeeds if it already exists with the same password. */
  async signUp(): Promise<string> {
    const response = await this.request("/auth/v1/signup", { method: "POST", body: this.credentials, auth: false });
    // Already registered (422/400, or a session-less reply when Supabase hides existing users): sign in instead.
    const body = response.status === 422 || response.status === 400 ? {} : await this.json(response);
    if (body.access_token) return this.keepSession(body);
    try {
      return await this.signIn();
    } catch (e) {
      if (e instanceof RemoteError && e.kind === "auth") {
        throw new RemoteError("Cloud sign-up failed. In Supabase, turn off Auth → Email → \"Confirm email\".", "rejected");
      }
      throw e;
    }
  }

  async signIn(): Promise<string> {
    const response = await this.request("/auth/v1/token?grant_type=password", { method: "POST", body: this.credentials, auth: false });
    if (response.status === 400) throw new RemoteError("No cloud backup matches this recovery key.", "auth");
    return this.keepSession(await this.json(response));
  }

  get userId(): string | null {
    return this.session?.userId ?? null;
  }

  async getWrappedKey(): Promise<WrappedKey | null> {
    const rows = (await this.rest("GET", "/rest/v1/backup_keys?select=wrapped_dek,wrap_iv")) as { wrapped_dek: string; wrap_iv: string }[];
    return rows[0] ? { wrapped: rows[0].wrapped_dek, iv: rows[0].wrap_iv } : null;
  }

  async putWrappedKey(key: WrappedKey): Promise<void> {
    await this.rest("POST", "/rest/v1/backup_keys", { wrapped_dek: key.wrapped, wrap_iv: key.iv });
  }

  async registerDevice(deviceId: string): Promise<void> {
    await this.rest("POST", "/rest/v1/backup_devices", { id: deviceId });
  }

  async listSnapshots(): Promise<SnapshotInfo[]> {
    const rows = (await this.rest(
      "GET",
      "/rest/v1/backup_snapshots?select=id,device_id,revision,format,size_bytes,created_at&order=created_at.desc&limit=50",
    )) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      deviceId: String(r.device_id),
      revision: Number(r.revision),
      format: Number(r.format),
      sizeBytes: Number(r.size_bytes),
      createdAt: String(r.created_at),
    }));
  }

  async getSnapshot(id: string): Promise<SnapshotPayload> {
    const rows = (await this.rest(
      "GET",
      `/rest/v1/backup_snapshots?select=id,device_id,revision,format,size_bytes,created_at,iv,ciphertext,sha256&id=eq.${encodeURIComponent(id)}`,
    )) as Record<string, unknown>[];
    const r = rows[0];
    if (!r || typeof r.ciphertext !== "string" || typeof r.iv !== "string" || typeof r.sha256 !== "string") {
      throw new RemoteError("That backup is no longer available.", "rejected");
    }
    return {
      id: String(r.id),
      deviceId: String(r.device_id),
      revision: Number(r.revision),
      format: Number(r.format),
      sizeBytes: Number(r.size_bytes),
      createdAt: String(r.created_at),
      iv: r.iv,
      ciphertext: r.ciphertext,
      sha256: r.sha256,
    };
  }

  async commit(input: CommitInput, options: { keepalive?: boolean } = {}): Promise<CommitResult> {
    const body = {
      p_device_id: input.deviceId,
      p_snapshot_id: input.snapshotId,
      p_revision: input.revision,
      p_format: input.format,
      p_iv: input.iv,
      p_ciphertext: input.ciphertext,
      p_sha256: input.sha256,
    };
    // Browsers cap keepalive bodies at 64 KB; bigger snapshots wait for the next open instead.
    const keepalive = options.keepalive === true && JSON.stringify(body).length < 60_000;
    const result = (await this.rest("POST", "/rest/v1/rpc/commit_backup", body, { keepalive, timeoutMs: COMMIT_TIMEOUT_MS })) as Record<string, unknown>;
    return parseCommitResult(result);
  }

  async deleteAll(): Promise<void> {
    await this.rest("POST", "/rest/v1/rpc/delete_my_backups", {});
  }

  // ------------------------------------------------------------------------------------------------ plumbing

  private keepSession(body: Record<string, unknown>): string {
    const user = body.user as { id?: unknown } | undefined;
    if (typeof body.access_token !== "string" || typeof user?.id !== "string") {
      throw new RemoteError("Unexpected sign-in response.", "server");
    }
    const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 3600;
    this.session = { accessToken: body.access_token, userId: user.id, expiresAt: Date.now() + (expiresIn - 60) * 1000 };
    return user.id;
  }

  private async token(): Promise<string> {
    if (!this.session || Date.now() >= this.session.expiresAt) await this.signIn();
    return this.session!.accessToken;
  }

  private async rest(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    options: { keepalive?: boolean; timeoutMs?: number } = {},
  ): Promise<unknown> {
    let response = await this.request(path, { method, body, auth: true, ...options });
    if (response.status === 401) {
      this.session = null; // token expired or revoked: sign in again once
      response = await this.request(path, { method, body, auth: true, ...options });
    }
    if (response.status === 204 || response.status === 201) return null;
    return this.json(response);
  }

  private async request(
    path: string,
    options: { method: string; body?: unknown; auth: boolean; keepalive?: boolean; timeoutMs?: number },
  ): Promise<Response> {
    const headers: Record<string, string> = { apikey: this.config.anonKey, "Content-Type": "application/json" };
    if (options.auth) headers.Authorization = `Bearer ${await this.token()}`;
    try {
      return await fetch(this.config.url + path, {
        method: options.method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        keepalive: options.keepalive,
        cache: "no-store",
        signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
      });
    } catch {
      throw new RemoteError("Can't reach the backup server.", "network");
    }
  }

  private async json(response: Response): Promise<Record<string, unknown>> {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Empty or non-JSON body; handled by the status check below.
    }
    if (!response.ok) {
      const code = (body as { code?: unknown; error_code?: unknown } | null)?.code ?? (body as { error_code?: unknown } | null)?.error_code;
      // Server not set up yet: say exactly what's missing instead of a raw database error.
      if (code === "PGRST205" || code === "PGRST202") {
        throw new RemoteError("Cloud backup isn't set up on the server yet: run supabase/migrations/0001_cloud_backup.sql in Supabase.", "rejected");
      }
      if (code === "email_not_confirmed" || /confirmation email/i.test(JSON.stringify(body ?? ""))) {
        throw new RemoteError("Supabase still requires email confirmation: turn off Authentication → Email → \"Confirm email\".", "rejected");
      }
      const message =
        (body as { message?: unknown; msg?: unknown; error_description?: unknown } | null)?.message ??
        (body as { msg?: unknown } | null)?.msg ??
        (body as { error_description?: unknown } | null)?.error_description;
      const kind = response.status >= 500 ? "server" : response.status === 401 || response.status === 403 ? "auth" : "rejected";
      throw new RemoteError(typeof message === "string" ? message : `Backup server error (${response.status})`, kind);
    }
    return (body ?? {}) as Record<string, unknown>;
  }
}

/** Validate the RPC's answer: never treat an unexpected response as "stored". */
export function parseCommitResult(raw: Record<string, unknown> | null): CommitResult {
  const status = raw?.status;
  const head = Number(raw?.headRevision);
  if (status === "stale" && Number.isSafeInteger(head)) return { status, headRevision: head };
  if ((status === "ok" || status === "duplicate") && typeof raw?.createdAt === "string" && Number.isSafeInteger(Number(raw.revision))) {
    return { status, revision: Number(raw.revision), createdAt: raw.createdAt, headRevision: Number.isSafeInteger(head) ? head : Number(raw.revision) };
  }
  throw new RemoteError("Unexpected response from the backup server.", "server");
}
