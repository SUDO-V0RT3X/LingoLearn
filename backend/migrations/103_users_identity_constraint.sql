-- Remove the legacy identity rule that requires the old name and age fields.
ALTER TABLE users DROP CONSTRAINT IF EXISTS learner_identity_check;

-- Apply the current role-specific username and email rule used by account creation.
ALTER TABLE users
    ADD CONSTRAINT learner_identity_check CHECK (
        (role = 'learner' AND username IS NOT NULL AND email IS NULL)
        OR
        (role <> 'learner' AND username IS NULL AND email IS NOT NULL)
    );
