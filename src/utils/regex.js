/** Escapes user input for safe use inside a RegExp / Mongo `$regex` (prevents ReDoS and injection). */
export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
