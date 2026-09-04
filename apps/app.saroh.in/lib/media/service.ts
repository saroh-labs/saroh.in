import { apiFetch, getActiveOrgId } from "@/lib/api/http";

/**
 * The media API from the app's side (#205).
 *
 * Two of the three steps go through here; the middle one does not. Minting the
 * upload ticket and confirming the upload are calls to api.saroh.in, made
 * server-side with the session forwarded. The PUT of the bytes goes from the
 * BROWSER straight to storage at the presigned URL — that is what the presign
 * is for, and routing a merchant's photograph through a Next server action
 * would be paying for the bytes twice to arrive at the same place.
 *
 * Server-only: `apiFetch` reads request headers.
 */

export interface UploadTicket {
    mediaId: string;
    uploadUrl: string;
    method: "PUT";
    headers: Record<string, string>;
    key: string;
    expiresAt: string;
}

export interface CompletedUpload {
    id: string;
    status: string;
    sizeBytes: number;
    /**
     * Where the image is served from. Null means storage is not configured to
     * serve anything publicly — true locally, where the in-memory adapter
     * mints fake URLs — and the picker says so rather than writing a src
     * nobody can fetch.
     */
    url: string | null;
}

export type MediaResult<T> =
    { ok: true; data: T } | { ok: false; error: string };

async function mediaBase(): Promise<string | null> {
    const orgId = await getActiveOrgId();
    return orgId ? `/organizations/${orgId}/media` : null;
}

/** The api's error envelope is `{ error: { message } }` — an object. */
function messageOf(data: unknown, fallback: string): string {
    if (data && typeof data === "object") {
        const err = (data as { error?: unknown }).error;
        if (err && typeof err === "object") {
            const m = (err as { message?: unknown }).message;
            if (typeof m === "string" && m.trim()) return m;
        }
        const m = (data as { message?: unknown }).message;
        if (typeof m === "string" && m.trim()) return m;
    }
    return fallback;
}

export async function createUpload(input: {
    contentType: string;
    contentLength: number;
    filename: string;
}): Promise<MediaResult<UploadTicket>> {
    const base = await mediaBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/upload-url`, {
        method: "POST",
        // One bucket for everything a site shows: hero, gallery, share card.
        // Bucketing by section would split a merchant's photographs by where
        // they happened to be used first.
        body: JSON.stringify({ ...input, purpose: "site-image" }),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok && data && typeof data === "object" && "uploadUrl" in data) {
        return { ok: true, data: data as UploadTicket };
    }
    return {
        ok: false,
        error: messageOf(data, "Could not start the upload."),
    };
}

export async function completeUpload(
    mediaId: string,
): Promise<MediaResult<CompletedUpload>> {
    const base = await mediaBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${mediaId}/complete`, {
        method: "POST",
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok && data && typeof data === "object" && "id" in data) {
        return { ok: true, data: data as CompletedUpload };
    }
    return {
        ok: false,
        error: messageOf(data, "Could not confirm the upload."),
    };
}
