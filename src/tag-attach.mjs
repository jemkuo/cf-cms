/** Saving a post attaches tags by slug. It never renames an existing tag. */

export const TAG_NAME_INSERT_SQL = `INSERT INTO tag_translations (tag_slug, lang, name) VALUES (?, ?, ?)
         ON CONFLICT(tag_slug, lang) DO NOTHING`

export function shouldRenameTagOnSave() {
  return false
}

export function tagNameAfterSave(existing, proposed) {
  if (typeof existing === 'string' && existing.length > 0) return existing
  return typeof proposed === 'string' ? proposed : ''
}
