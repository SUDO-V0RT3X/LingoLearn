-- Learner setup is stored once per user and can be replaced as preferences change.
CREATE TABLE IF NOT EXISTS learner_settings (
    user_id         INTEGER PRIMARY KEY, -- Each user can have at most one set of learner settings, linked to their user account.
    target_language TEXT    NOT NULL CHECK (length(target_language) BETWEEN 1 AND 80), -- The language the learner is currently learning, restricted to between 1 and 80 characters.
    date_of_birth      DATE NOT NULL CHECK (date_of_birth BETWEEN DATE '1900-01-01' AND CURRENT_DATE), -- The learner's date of birth, restricted to a reasonable range (between 1900-01-01 and the current date).
    interface_language TEXT NOT NULL CHECK (length(interface_language) BETWEEN 1 AND 80), -- The language used for the user interface, restricted to between 1 and 80 characters.
    daily_goal      INT     NOT NULL CHECK (daily_goal BETWEEN 1 AND 120), -- The learner's daily goal for learning, restricted to a reasonable range (between 1 and 120 minutes).
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(), -- Timestamp indicating when the learner settings record was originally created.
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now() -- Timestamp indicating when the learner settings record was last updated.
);
