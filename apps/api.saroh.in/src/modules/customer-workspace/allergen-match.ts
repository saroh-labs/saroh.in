import type { prisma } from "@saroh/database";

/**
 * How allergens are matched by name across the business's list (#508 R6,
 * #529): a customer's note or Needs attention entry names one allergen, and
 * an order is checked against every allergen of the same name.
 */

/** An allergen's name as lists are compared: "peanuts " is "Peanuts". */
export const allergenKey = (name: string) => name.trim().toLowerCase();

/**
 * The business's allergen list grouped by name (`allergenKey`), in list
 * order: what a named allergen is widened to when an order is checked.
 * Needs attention's Allergy entries widen the same way (C1).
 */
export async function allergensByName(
    db: typeof prisma,
    organizationId: string,
): Promise<Map<string, { id: string; name: string }[]>> {
    const rows = await db.storeAllergen.findMany({
        where: { organizationId },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true },
    });
    const byName = new Map<string, { id: string; name: string }[]>();
    for (const r of rows) {
        const key = allergenKey(r.name);
        byName.set(key, [...(byName.get(key) ?? []), r]);
    }
    return byName;
}
