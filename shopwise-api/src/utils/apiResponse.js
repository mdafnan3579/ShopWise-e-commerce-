/**
 * Sends the standard success envelope: `{ success: true, data, message?, meta? }`.
 *
 * @param {import('express').Response} res
 * @param {{ data?: unknown, message?: string, meta?: object, statusCode?: number }} [payload]
 */
export function sendSuccess(res, { data = null, message, meta, statusCode = 200 } = {}) {
  const body = { success: true, data };
  if (message) body.message = message;
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

export function sendCreated(res, payload = {}) {
  return sendSuccess(res, { ...payload, statusCode: 201 });
}
