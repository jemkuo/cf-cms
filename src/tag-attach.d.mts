export const TAG_NAME_INSERT_SQL: string

export function shouldRenameTagOnSave(): boolean

export function tagNameAfterSave(existing: string | null | undefined, proposed: string | null | undefined): string
