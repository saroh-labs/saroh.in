import { prisma } from "@saroh/database";

import {
    createStoreSchema,
    type StoreResult,
    updateStoreSchema,
} from "./schema";
import { isSlugAvailable, slugify } from "./slug";

/**
 * Store data layer. These take an explicit `userId` (resolved from the
 * accounts session by the Server Actions in actions.ts) so they're testable
 * without the request context. Ownership is the v1 authorization model:
 * a user may read/edit a store only if they're a StoreOwner of it.
 */

/** Stores the user owns (newest first), excluding soft-deleted. */
export function listStoresForUser(userId: string) {
    return prisma.store.findMany({
        where: { owners: { some: { userId } }, deletedAt: null },
        orderBy: { createdAt: "desc" },
    });
}

/** The store if the user owns it, else null (no leak for non-owners). */
export function getStoreForOwner(storeId: string, userId: string) {
    return prisma.store.findFirst({
        where: { id: storeId, owners: { some: { userId } }, deletedAt: null },
    });
}

export async function isStoreOwner(
    storeId: string,
    userId: string,
): Promise<boolean> {
    const owner = await prisma.storeOwner.findUnique({
        where: { storeId_userId: { storeId, userId } },
    });
    return Boolean(owner);
}

/** Create a store and record the creator as OWNER, atomically. */
export async function createStoreForUser(
    userId: string,
    input: unknown,
): Promise<StoreResult<{ id: string }>> {
    const parsed = createStoreSchema.safeParse(input);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return {
            ok: false,
            error: issue.message,
            field: issue.path[0] as "name" | "slug" | undefined,
        };
    }

    const { name, description } = parsed.data;
    const slug = slugify(parsed.data.slug ?? name);
    if (!slug) {
        return {
            ok: false,
            error: "Could not derive a slug from the name",
            field: "slug",
        };
    }
    if (!(await isSlugAvailable(slug))) {
        return { ok: false, error: "That slug is already taken", field: "slug" };
    }

    try {
        const store = await prisma.store.create({
            data: {
                name,
                slug,
                description: description || null,
                // Nested create runs in one transaction → no orphan store.
                owners: { create: { userId, role: "OWNER" } },
            },
        });
        return { ok: true, data: { id: store.id } };
    } catch {
        // Unique-constraint backstop for a slug race between the check above
        // and the insert.
        return { ok: false, error: "That slug is already taken", field: "slug" };
    }
}

/** Update a store's core fields — owner only. */
export async function updateStoreForUser(
    userId: string,
    storeId: string,
    input: unknown,
): Promise<StoreResult<{ id: string }>> {
    if (!(await isStoreOwner(storeId, userId))) {
        return { ok: false, error: "Store not found" };
    }

    const parsed = updateStoreSchema.safeParse(input);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return {
            ok: false,
            error: issue.message,
            field: issue.path[0] as "name" | "slug" | "logo" | undefined,
        };
    }

    const { name, description, logo } = parsed.data;
    const slug = slugify(parsed.data.slug);

    const current = await prisma.store.findUnique({
        where: { id: storeId },
        select: { slug: true },
    });
    if (current && current.slug !== slug && !(await isSlugAvailable(slug))) {
        return { ok: false, error: "That slug is already taken", field: "slug" };
    }

    try {
        await prisma.store.update({
            where: { id: storeId },
            data: {
                name,
                slug,
                description: description ?? null,
                logo: logo || null,
            },
        });
        return { ok: true, data: { id: storeId } };
    } catch {
        return { ok: false, error: "That slug is already taken", field: "slug" };
    }
}
