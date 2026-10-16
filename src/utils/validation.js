/**
 * Flattens Zod issues into a stable, client-friendly shape: `[{ path: 'body.email', message }]`.
 *
 * @param {Array<{ path: PropertyKey[], message: string }>} issues
 */
export function formatZodIssues(issues) {
  return issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}
