"use server";

import {
    completeUpload as completeUploadApi,
    createUpload as createUploadApi,
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
}) {
    return createUploadApi(input);
}

export async function completeUpload(mediaId: string) {
    return completeUploadApi(mediaId);
}
