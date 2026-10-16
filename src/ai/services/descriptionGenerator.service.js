import { CATEGORY_LABELS } from '../../config/catalog.js';
import { slugify } from '../../utils/slugify.js';
import { MODELS, createStructured } from '../client.js';
import { productCopySystemPrompt, productCopyUserPrompt } from '../prompts/description.js';
import { productCopySchema } from '../schemas.js';

const FEATURE = 'description_generator';

/**
 * Admin-only copywriting helper. Output is a draft the admin edits before saving, so on AI
 * failure this surfaces 503 AI_UNAVAILABLE (the form keeps working, just without the button).
 */
export async function generateProductCopy(input, { userId } = {}) {
  const result = await createStructured(
    { feature: FEATURE, userId, timeoutMs: 30_000 },
    {
      model: MODELS.main,
      max_tokens: 1500,
      system: productCopySystemPrompt(),
      messages: [
        {
          role: 'user',
          content: productCopyUserPrompt({ ...input, category: CATEGORY_LABELS[input.category] }),
        },
      ],
      output_config: { effort: 'medium' },
    },
    productCopySchema,
  );

  // Normalize to what the product form accepts (same limits as the product validator).
  const tags = [...new Set(result.tags.map((tag) => slugify(tag).slice(0, 40)))]
    .filter((tag) => tag !== 'item')
    .slice(0, 10);

  return {
    description: result.description.trim().slice(0, 5000),
    tagline: result.tagline.trim().replace(/\.$/, '').slice(0, 160),
    tags,
    aiGenerated: true,
  };
}
