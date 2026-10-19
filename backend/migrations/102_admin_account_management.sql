-- Administrator account management history for LIN-22.
-- Existing accounts and parent links are retained while soft-state columns are added.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS deactivated_by INTEGER NULL REFERENCES users(id);

ALTER TABLE users DROP CONSTRAINT IF EXISTS learner_identity_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS account_identity_check;
ALTER TABLE users ADD CONSTRAINT account_identity_check CHECK (
    (username IS NOT NULL AND email IS NULL)
    OR
    (username IS NULL AND email IS NOT NULL)
);

ALTER TABLE users DROP CONSTRAINT IF EXISTS active_deactivation_check;
ALTER TABLE users ADD CONSTRAINT active_deactivation_check CHECK (
    (is_active = true AND deactivated_at IS NULL)
    OR
    (is_active = false AND deactivated_at IS NOT NULL)
);

ALTER TABLE parent_child_links
    ADD COLUMN IF NOT EXISTS link_id BIGSERIAL,
    ADD COLUMN IF NOT EXISTS unlinked_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS unlinked_by INTEGER NULL REFERENCES users(id);

ALTER TABLE parent_child_links DROP CONSTRAINT IF EXISTS parent_child_links_pkey;
ALTER TABLE parent_child_links ADD CONSTRAINT parent_child_links_pkey PRIMARY KEY (link_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_child_links_active_pair
    ON parent_child_links (guardian_id, learner_id)
    WHERE unlinked_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_audit_log (
    log_id BIGSERIAL PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES users(id),
    target_user INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL CHECK (action IN ('role_change', 'deactivate', 'reactivate', 'link_fix', 'unlink')),
    old_value JSONB NULL,
    new_value JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_target_user
    ON admin_audit_log (target_user, created_at DESC);
