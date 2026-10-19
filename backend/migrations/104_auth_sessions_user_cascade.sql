-- Remove the legacy session foreign key that blocks deletion of its user row.
ALTER TABLE auth_sessions DROP CONSTRAINT IF EXISTS auth_sessions_user_id_fkey;

-- Recreate the current foreign key so deleting a user also removes their sessions.
ALTER TABLE auth_sessions
    ADD CONSTRAINT auth_sessions_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE;
