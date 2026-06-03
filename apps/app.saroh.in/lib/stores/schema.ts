/**
 * Store input + result shapes shared by the forms, server actions, and the
 * api HTTP client. Validation now lives in api.saroh.in (the single backend);
 * these are plain types so the app carries no validation/DB code.
 */

export interface CreateStoreInput {
    name: string;
    slug?: string;
    description?: string;
}

export interface UpdateStoreInput {
    name: string;
    slug: string;
    description?: string | null;
    logo?: string | null;
}

/** Discriminated result so callers/UI can show field errors inline. */
export type StoreResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: string; field?: "name" | "slug" | "logo" };
