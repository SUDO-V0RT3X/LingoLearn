-- Identity and Access: users and revocable sessions.
-- Passwords are stored as hashes; active sessions can be revoked on sign-out.
-- A learner signs in with a username, every other role with an email address.
-- Date of birth lives in learner_settings (onboarding slice), never here.

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('learner', 'guardian', 'moderator', 'author', 'administrator')),
    requires_guardian_link BOOLEAN NOT NULL DEFAULT false,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT learner_identity_check CHECK (
        (role = 'learner' AND username IS NOT NULL AND email IS NULL)
        OR
        (role <> 'learner' AND username IS NULL AND email IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
