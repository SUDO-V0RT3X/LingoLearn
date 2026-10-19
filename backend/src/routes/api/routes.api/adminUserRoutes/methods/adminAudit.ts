import type { PoolClient } from 'pg';

export type AdminAuditAction = 'role_change' | 'deactivate' | 'reactivate' | 'link_fix' | 'unlink';

// Inserts one audit row through the transaction client supplied by the caller.
export async function insertAdminAudit(
    client: PoolClient,
    adminId: number,
    targetUserId: number,
    action: AdminAuditAction,
    oldValue: Record<string, unknown> | null,
    newValue: Record<string, unknown> | null,
): Promise<void> {
    await client.query(
        `INSERT INTO admin_audit_log (admin_id, target_user, action, old_value, new_value)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
        [adminId, targetUserId, action, JSON.stringify(oldValue), JSON.stringify(newValue)],
    );
}
