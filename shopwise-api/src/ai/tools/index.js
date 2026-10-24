import { AppError } from '../../utils/AppError.js';
import { CATALOG_TOOLS, catalogExecutors, catalogInputSchemas } from './catalogTools.js';
import { SUPPORT_TOOLS, supportExecutors, supportInputSchemas } from './supportTools.js';

/** Every tool the chat assistant can use: shopping (catalog) and customer support. */
export const CHAT_TOOLS = [...CATALOG_TOOLS, ...SUPPORT_TOOLS];

const inputSchemas = { ...catalogInputSchemas, ...supportInputSchemas };
const executors = { ...catalogExecutors, ...supportExecutors };

/**
 * Executes one tool_use block and returns a tool_result block. Never throws: failures are
 * reported to the model as `is_error` results so it can recover or apologize.
 *
 * @param {{ id: string, name: string, input: unknown }} toolUse
 * @param {{ userId?: string, seenProductIds: Set<string>, displayedProductIds: string[], actions: object[], log?: object }} context
 */
export async function runTool(toolUse, context) {
  const schema = inputSchemas[toolUse.name];
  const result = (content, isError = false) => ({
    type: 'tool_result',
    tool_use_id: toolUse.id,
    content: JSON.stringify(content),
    ...(isError && { is_error: true }),
  });

  if (!schema) return result({ error: `Unknown tool ${toolUse.name}` }, true);

  const parsed = schema.safeParse(toolUse.input);
  if (!parsed.success) {
    return result(
      {
        error: 'Invalid input',
        issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      },
      true,
    );
  }

  try {
    return result(await executors[toolUse.name](parsed.data, context));
  } catch (err) {
    // AppError messages are written for customers (e.g. "Order not found"), so the model may see them.
    if (err instanceof AppError) return result({ error: err.message, code: err.code }, true);
    context.log?.warn({ err, tool: toolUse.name }, 'Assistant tool failed');
    return result({ error: 'The lookup failed, please try again' }, true);
  }
}
