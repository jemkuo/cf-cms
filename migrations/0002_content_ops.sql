-- Per-language keywords, Open Graph image, and translation errors.
-- Background translation jobs. Additive: existing rows keep their text.
-- Wrangler applies this file once, so a later `migrations apply` is a no-op.
-- The job table uses IF NOT EXISTS in case the file is replayed by hand after the columns exist.

ALTER TABLE translations ADD COLUMN keywords TEXT NOT NULL DEFAULT '';
ALTER TABLE translations ADD COLUMN og_image TEXT NOT NULL DEFAULT '';
ALTER TABLE translations ADD COLUMN error TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS translation_jobs (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  lang TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT NOT NULL DEFAULT '',
  cursor INTEGER NOT NULL DEFAULT 0,
  partial TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_translation_jobs_status ON translation_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS idx_translation_jobs_post ON translation_jobs (post_id);
