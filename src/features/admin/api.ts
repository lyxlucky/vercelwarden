"use client";

import { apiClient } from "@/lib/client/api/client";
import { requestReauthentication } from "@/features/security/api";
import { sessionStore } from "@/lib/client/state/session-store";

export interface AdminUserSummary {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  enabled: boolean;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  creationDate: string;
  revisionDate: string;
}

export interface AdminInviteSummary {
  id: string;
  email: string;
  status: "active" | "used" | "expired" | "revoked";
  maxUses: number;
  useCount: number;
  creationDate: string;
  expirationDate: string;
  lastUsedDate: string | null;
  revokedDate: string | null;
}

export function listAdminUsers(input: { query?: string; status?: string; cursor?: string | null } = {}) {
  const params = new URLSearchParams({ limit: "50" });
  if (input.query) params.set("query", input.query);
  if (input.status && input.status !== "all") params.set("status", input.status);
  if (input.cursor) params.set("cursor", input.cursor);
  return apiClient<{ data: AdminUserSummary[]; continuationToken: string | null }>(`/api/admin/users?${params}`);
}

export async function updateAdminUserStatus(id: string, enabled: boolean, password: string) {
  const proof = await requestReauthentication("admin.user.status", password);
  return apiClient<{ id: string; enabled: boolean }>(`/api/admin/users/${encodeURIComponent(id)}/status`, {
    method: "PUT",
    headers: { "X-Reauth-Proof": proof.proof },
    body: { enabled },
  });
}

export async function deleteAdminUser(id: string, password: string) {
  const proof = await requestReauthentication("admin.user.delete", password);
  return apiClient<void>(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "X-Reauth-Proof": proof.proof },
  });
}

export async function listAdminInvites() {
  const result = await apiClient<{ data: AdminInviteSummary[] }>("/api/admin/invites");
  return result.data;
}

export function createAdminInvite(input: { email: string; expiresInHours: number; maxUses: number }) {
  return apiClient<AdminInviteSummary & { registrationUrl: string }>("/api/admin/invites", {
    method: "POST",
    body: input,
  });
}

export function revokeAdminInvite(id: string) {
  return apiClient<void>(`/api/admin/invites/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function cleanupAdminInvites() {
  return apiClient<{ removed: number }>("/api/admin/invites", { method: "DELETE" });
}

export interface AuditEventSummary {
  id: string;
  actorEmail: string | null;
  action: string;
  category: string;
  level: string;
  targetType: string | null;
  targetId: string | null;
  outcome: string;
  requestId: string | null;
  metadata: Record<string, unknown>;
  creationDate: string;
}

export function listAuditEvents(input: Record<string, string | null | undefined> = {}) {
  const params = new URLSearchParams({ limit: "50" });
  for (const [key, value] of Object.entries(input)) if (value) params.set(key, value);
  return apiClient<{ data: AuditEventSummary[]; continuationToken: string | null }>(`/api/admin/logs?${params}`);
}

export function getAuditRetentionSettings() {
  return apiClient<{ retentionDays: number | null; maxEntries: number | null }>("/api/admin/logs/settings");
}

export function updateAuditRetentionSettings(input: { retentionDays: number | null; maxEntries: number | null }) {
  return apiClient<{ removed: number }>("/api/admin/logs/settings", { method: "PUT", body: input });
}

export async function clearAuditEvents(password: string) {
  const proof = await requestReauthentication("admin.audit.clear", password);
  return apiClient<{ removed: number }>("/api/admin/logs", {
    method: "DELETE",
    headers: { "X-Reauth-Proof": proof.proof },
  });
}

export interface BackupDestinationSummary {
  id: string;
  name: string;
  provider: "local" | "vercel-blob" | "webdav";
  enabled: boolean;
  schedule: string | null;
  retentionCount: number;
  includeAttachments: boolean;
  creationDate: string;
  revisionDate: string;
}

export interface BackupRunSummary {
  id: string;
  destinationId: string | null;
  trigger: "manual" | "scheduled";
  mode: "full" | "database";
  status: string;
  progress: number;
  summary: Record<string, unknown> | null;
  errorCode: string | null;
  creationDate: string;
  startedDate: string | null;
  finishedDate: string | null;
}

export interface BackupArtifactSummary {
  id: string;
  runId: string;
  formatVersion: number;
  size: number;
  sha256: string;
  summary: Record<string, unknown>;
  creationDate: string;
  expirationDate: string | null;
}

export async function listBackupDestinations() {
  const result = await apiClient<{ data: BackupDestinationSummary[] }>("/api/admin/backup/settings");
  return result.data;
}

export async function saveBackupDestination(input: {
  id?: string;
  name: string;
  provider: BackupDestinationSummary["provider"];
  enabled: boolean;
  schedule: string | null;
  retentionCount: number;
  includeAttachments: boolean;
  config: Record<string, unknown>;
}, password: string) {
  const proof = await requestReauthentication("backup.destination.manage", password);
  return apiClient<BackupDestinationSummary>("/api/admin/backup/settings", {
    method: "PUT",
    headers: { "X-Reauth-Proof": proof.proof },
    body: input,
  });
}

export function startBackupRun(destinationId: string, mode: "full" | "database") {
  return apiClient<BackupRunSummary>("/api/admin/backup/run", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: { destinationId, mode },
  });
}

export async function listBackupRuns() {
  const result = await apiClient<{ data: BackupRunSummary[] }>("/api/admin/backup/runs?limit=100");
  return result.data;
}

export async function listBackupArtifacts() {
  const result = await apiClient<{ data: BackupArtifactSummary[] }>("/api/admin/backup/remote");
  return result.data;
}

export function verifyBackupIntegrity(artifactId: string) {
  return apiClient<{ artifactId: string; status: "valid" | "corrupt"; errorCode?: string }>("/api/admin/backup/remote/integrity", {
    method: "POST",
    body: { artifactId },
  });
}

async function rawAuthorizedRequest(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = sessionStore.getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, credentials: "include", cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? `Request failed with status ${response.status}.`);
  }
  return response;
}

export async function downloadBackupArtifact(artifactId: string, password: string): Promise<Blob> {
  const proof = await requestReauthentication("backup.download", password);
  const response = await rawAuthorizedRequest("/api/admin/backup/remote/download", {
    method: "POST",
    headers: { "X-Reauth-Proof": proof.proof },
    body: JSON.stringify({ artifactId }),
  });
  return response.blob();
}

export async function deleteBackupArtifact(artifactId: string, password: string) {
  const proof = await requestReauthentication("backup.delete", password);
  return apiClient<void>("/api/admin/backup/remote/file", {
    method: "DELETE",
    headers: { "X-Reauth-Proof": proof.proof },
    body: { artifactId },
  });
}

export async function restoreBackupArtifact(artifactId: string, mode: "merge" | "replace", password: string) {
  const proof = await requestReauthentication("backup.restore", password);
  return apiClient<{ status: string; restored: number; failed: number }>("/api/admin/backup/remote/restore", {
    method: "POST",
    headers: { "X-Reauth-Proof": proof.proof, "Idempotency-Key": crypto.randomUUID() },
    body: { artifactId, mode },
  });
}
