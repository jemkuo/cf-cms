import { writeFileSync } from 'node:fs'
import { posts, tags } from '../seed/content.mjs'

function sql(value) {
  if (value === null || value === undefined) return 'NULL'
  return `'${String(value).replaceAll("'", "''")}'`
}

const lines = [
  'DELETE FROM post_tags;',
  'DELETE FROM translations;',
  'DELETE FROM posts;',
  'DELETE FROM tag_translations;',
  'DELETE FROM tags;',
  '',
]

for (const tag of tags) {
  lines.push(`INSERT INTO tags (slug, created_at) VALUES (${sql(tag.slug)}, ${sql(tag.createdAt)});`)
  for (const [lang, name] of Object.entries(tag.names)) {
    lines.push(
      `INSERT INTO tag_translations (tag_slug, lang, name) VALUES (${sql(tag.slug)}, ${sql(lang)}, ${sql(name)});`,
    )
  }
}

for (const post of posts) {
  lines.push(
    `INSERT INTO posts (id, slug, status, category, cover_key, author_name, author_x, source_lang, translate_note, published_at, created_at, updated_at) VALUES (${[
      post.id,
      post.slug,
      post.status,
      post.category,
      post.cover,
      post.authorName,
      post.authorX,
      post.sourceLang,
      '',
      post.publishedAt,
      post.createdAt,
      post.updatedAt,
    ]
      .map(sql)
      .join(', ')});`,
  )
  for (const [lang, item] of Object.entries(post.translations)) {
    lines.push(
      `INSERT INTO translations (post_id, lang, title, description, summary, body_md, faq_json, share_text, engine, ready, locked, updated_at) VALUES (${[
        post.id,
        lang,
        item.title,
        item.description,
        item.summary,
        item.body,
        JSON.stringify(item.faq),
        item.share,
        'human',
        1,
        1,
        post.updatedAt,
      ]
        .map(sql)
        .join(', ')});`,
    )
  }
  for (const slug of post.tags) {
    lines.push(`INSERT INTO post_tags (post_id, tag_slug) VALUES (${sql(post.id)}, ${sql(slug)});`)
  }
}

lines.push('')
writeFileSync(new URL('../seed/seed.sql', import.meta.url), lines.join('\n'))
console.log(`wrote seed/seed.sql (${posts.length} posts)`)
