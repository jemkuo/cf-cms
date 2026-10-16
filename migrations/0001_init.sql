CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  category TEXT NOT NULL DEFAULT 'notes',
  cover_key TEXT,
  author_name TEXT NOT NULL,
  author_x TEXT,
  source_lang TEXT NOT NULL DEFAULT 'zh' CHECK (source_lang IN ('zh', 'en', 'ja', 'es', 'ar')),
  translate_note TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}',
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE translations (
  post_id TEXT NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('zh', 'en', 'ja', 'es', 'ar')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  body_md TEXT NOT NULL,
  faq_json TEXT NOT NULL DEFAULT '[]',
  share_text TEXT NOT NULL DEFAULT '',
  engine TEXT NOT NULL DEFAULT 'human' CHECK (engine IN ('human', 'workers-ai', 'fallback')),
  ready INTEGER NOT NULL DEFAULT 1 CHECK (ready IN (0, 1)),
  locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (post_id, lang),
  FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
);

CREATE TABLE tags (
  slug TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE tag_translations (
  tag_slug TEXT NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('zh', 'en', 'ja', 'es', 'ar')),
  name TEXT NOT NULL,
  PRIMARY KEY (tag_slug, lang),
  FOREIGN KEY (tag_slug) REFERENCES tags (slug) ON DELETE CASCADE
);

CREATE TABLE post_tags (
  post_id TEXT NOT NULL,
  tag_slug TEXT NOT NULL,
  PRIMARY KEY (post_id, tag_slug),
  FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  FOREIGN KEY (tag_slug) REFERENCES tags (slug) ON DELETE CASCADE
);

CREATE TABLE channels (
  slug TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE channel_translations (
  channel_slug TEXT NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('zh', 'en', 'ja', 'es', 'ar')),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (channel_slug, lang),
  FOREIGN KEY (channel_slug) REFERENCES channels (slug) ON DELETE CASCADE
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_posts_status_published ON posts (status, published_at);
CREATE INDEX idx_translations_lang_ready ON translations (lang, ready);
CREATE INDEX idx_post_tags_tag ON post_tags (tag_slug);
CREATE INDEX idx_posts_category ON posts (category);

INSERT INTO channels (slug, sort_order, visible, created_at) VALUES
  ('engineering', 0, 1, '2026-01-01T00:00:00.000Z'),
  ('notes', 1, 1, '2026-01-01T00:00:00.000Z'),
  ('research', 2, 1, '2026-01-01T00:00:00.000Z');

INSERT INTO channel_translations (channel_slug, lang, name, description) VALUES
  ('engineering', 'zh', '工程', '实现、接口与运行时'),
  ('engineering', 'en', 'Engineering', 'Implementation, interfaces, and runtime'),
  ('engineering', 'ja', 'エンジニアリング', '実装、インターフェース、ランタイム'),
  ('engineering', 'es', 'Ingeniería', 'Implementación, interfaces y ejecución'),
  ('engineering', 'ar', 'هندسة', 'التنفيذ والواجهات ووقت التشغيل'),
  ('notes', 'zh', '笔记', '短记与工作记录'),
  ('notes', 'en', 'Notes', 'Short notes and working records'),
  ('notes', 'ja', 'ノート', '短いメモと作業記録'),
  ('notes', 'es', 'Notas', 'Notas breves y registros de trabajo'),
  ('notes', 'ar', 'ملاحظات', 'ملاحظات قصيرة وسجل العمل'),
  ('research', 'zh', '研究', '尚未定论的问题'),
  ('research', 'en', 'Research', 'Questions that are not settled'),
  ('research', 'ja', '研究', 'まだ結論のない問い'),
  ('research', 'es', 'Investigación', 'Preguntas que aún no están cerradas'),
  ('research', 'ar', 'بحث', 'أسئلة لم تُحسم بعد');

INSERT INTO settings (key, value_json, updated_at) VALUES
  ('template', '{"id":"paper","accent":"vermilion","radius":"sharp","font":"sans"}', '2026-01-01T00:00:00.000Z'),
  ('layout', '{"width":"narrow","header":"bar","home":"list","showAuthor":true,"showTags":true,"showShare":true,"showKicker":true}', '2026-01-01T00:00:00.000Z'),
  ('meta', '{"description":"","titleSuffix":"","ogImage":"","twitterCard":"summary_large_image","robots":"index, follow, max-image-preview:large"}', '2026-01-01T00:00:00.000Z'),
  ('share', '{"x":"","github":"","mastodon":"","linkedin":"","website":"","showRss":true}', '2026-01-01T00:00:00.000Z');
