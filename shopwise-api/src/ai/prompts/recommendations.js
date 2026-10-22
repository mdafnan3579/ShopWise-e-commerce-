export function recommendationsSystemPrompt() {
  return `You personalize product recommendations for a returning shopper of an online store.

From the candidate products, choose the 6 the shopper is most likely to want next and order them best first. For each, write a one-sentence reason (at most 120 characters) addressed to the shopper ("Pairs well with your...", "Since you saved..."), grounded in their purchase history or wishlist.

Only choose from the candidate ids provided. Prefer variety across categories, complementary items over near-duplicates of things they already bought, and well-rated products. Never mention prices or discounts that are not listed.`;
}

/**
 * @param {{
 *   purchased: Array<{ name: string, category: string }>,
 *   wishlist: Array<{ name: string, category: string }>,
 *   candidates: Array<{ id: string, name: string, category: string, brand: string, priceUsd: string, rating: number }>
 * }} input
 */
export function recommendationsUserPrompt({ purchased, wishlist, candidates }) {
  const list = (items) =>
    items.length ? items.map((p) => `- ${p.name} (${p.category})`).join('\n') : '- (none)';

  const candidateLines = candidates
    .map(
      (c) =>
        `- id=${c.id} | ${c.name} | ${c.category} | ${c.brand} | ${c.priceUsd} | rating ${c.rating}`,
    )
    .join('\n');

  return `<shopper>
Recently purchased:
${list(purchased)}
Wishlist:
${list(wishlist)}
</shopper>

<candidates>
${candidateLines}
</candidates>`;
}
