/** Tags Tasky typically does not surface as user tags. */
export const EXCLUDE_TAGS = new Set(['type', 'id', 'text']);

/** Built-in / commonly used TaskPaper-format tags. */
export const COMMON_TAGS = [
  'done',
  'today',
  'due',
  'start',
  'priority',
  'waiting',
  'project',
  'search',
] as const;

export interface TagStats {
  name: string;
  values: Set<string>;
  count: number;
}
