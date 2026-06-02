import { z } from "zod";

const slugField = z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(
        /^[a-z0-9-]+$/,
        "Slug may only contain lowercase letters, numbers, and hyphens",
    );

export const createStoreSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(100),
    // Optional: derived from the name when omitted.
    slug: slugField.optional(),
    description: z.string().trim().max(500).optional(),
});

export const updateStoreSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(100),
    slug: slugField,
    description: z.string().trim().max(500).optional().nullable(),
    logo: z
        .string()
        .trim()
        .url("Logo must be a valid URL")
        .optional()
        .nullable()
        .or(z.literal("")),
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;

/** Discriminated result so callers/UI can show field errors inline. */
export type StoreResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: string; field?: "name" | "slug" | "logo" };
