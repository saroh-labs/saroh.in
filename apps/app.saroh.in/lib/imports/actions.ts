"use server";

import type { ImportEntity, ImportInput } from "./service";
import {
    applyImport as applyImportApi,
    previewImport as previewImportApi,
} from "./service";

/**
 * Server Actions for CSV import (#175). Thin wrappers that forward the session
 * cookie to api.saroh.in, which resolves the caller and enforces store
 * membership and the write role. The UI calls these, never the api directly.
 */

export async function previewImport(
    storeId: string,
    entity: ImportEntity,
    input: ImportInput,
) {
    return previewImportApi(storeId, entity, input);
}

export async function applyImport(
    storeId: string,
    entity: ImportEntity,
    input: ImportInput,
) {
    return applyImportApi(storeId, entity, input);
}
