import { AppError } from '../utils/AppError.js';
import { formatZodIssues } from '../utils/validation.js';

const PARTS = ['params', 'query', 'body'];

/**
 * Validates and coerces request parts with Zod schemas.
 * Parsed values are exposed on `req.validated.{params,query,body}`. In Express 5 `req.query`
 * is a read-only getter, so controllers always read the validated copy. `req.body` is also
 * replaced so unknown fields stripped by Zod never reach a service.
 *
 * @param {{ params?: import('zod').ZodType, query?: import('zod').ZodType, body?: import('zod').ZodType }} schemas
 */
export function validate(schemas) {
  return (req, _res, next) => {
    const validated = {};
    const issues = [];

    for (const part of PARTS) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        validated[part] = result.data;
      } else {
        issues.push(...result.error.issues.map((i) => ({ ...i, path: [part, ...i.path] })));
      }
    }

    if (issues.length > 0) return next(AppError.validation(formatZodIssues(issues)));

    req.validated = validated;
    if (validated.body !== undefined) req.body = validated.body;
    next();
  };
}
