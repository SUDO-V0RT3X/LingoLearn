-- Identity and Access: parent-child linking.
-- Assumes the User table is owned by the auth slice and already exists.

CREATE TABLE IF NOT EXISTS parent_link_codes (
    code CHAR(6) PRIMARY KEY,
    learner_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    redeemed_at TIMESTAMPTZ NULL,
    redeemed_by_guardian_id INTEGER NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS parent_child_links (
    guardian_id INTEGER NOT NULL REFERENCES users(id),
    learner_id INTEGER NOT NULL REFERENCES users(id),
    linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (guardian_id, learner_id)
);
