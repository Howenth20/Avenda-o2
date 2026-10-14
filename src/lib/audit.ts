import "server-only";
import type { PoolClient } from "pg";

interface AuditEntry {
  actorId: string | null;
  projectId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  reason?: string | null;
  ip: string;
}

export async function recordAudit(client: PoolClient, entry: AuditEntry): Promise<void> {
  await client.query(
    `INSERT INTO audit_logs
       (actor_id, project_id, action, entity_type, entity_id, before_data, after_data, reason, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
    [
      entry.actorId,
      entry.projectId,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.before === null ? null : JSON.stringify(entry.before),
      entry.after === null ? null : JSON.stringify(entry.after),
      entry.reason ?? null,
      entry.ip,
    ],
  );
}
