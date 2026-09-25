"use server";

import {
    completeUpload as completeUploadApi,
    createUpload as createUploadApi,
    listLibrary as listLibraryApi,
} from "./service";

/**
 * Server Actions for media. Thin wrappers that forward the session to
 * api.saroh.in; the PUT of the bytes never comes through here — see
 * `lib/media/service.ts` for why.
 */

export async function createUpload(input: {
    contentType: string;
    contentLength: number;
    filename: string;
    /** The library bucket; site images unless said. */
    purpose?: "site-image" | "business-logo";
}) {
    return createUploadApi(input);
}

export async function completeUpload(mediaId: string) {
    return completeUploadApi(mediaId);
}

/** The photo library, for pickers; `null` when it could not be read. */
export async function listLibrary() {
    return listLibraryApi().catch(() => null);
}
