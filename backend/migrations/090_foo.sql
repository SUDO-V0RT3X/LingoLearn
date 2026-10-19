-- FOO: the walkthrough resource. One public table, no ownership.
-- Numbered 0xx (foundation) because it belongs to no slice — delete it once
-- every slice has its own resource.
CREATE TABLE IF NOT EXISTS foo (
    id         SERIAL PRIMARY KEY,
    name       TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    note       TEXT    NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed rows (lorem) so the screen shows something before anyone creates anything.
INSERT INTO foo (name, note) VALUES
    ('Lorem ipsum',    'dolor sit amet'),
    ('Consectetur',    'adipiscing elit'),
    ('Sed do eiusmod', 'tempor incididunt')
ON CONFLICT DO NOTHING;
