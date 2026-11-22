"use server";

import { apiFetch, orgBase } from "@/lib/api/http";

import type {
    SiteChanges,
    SitePublication,
    SitePublicationDetail,
} from "./service";

/**
 * The editor's Rail › History (website editor plan U46b): the versions
 * list, one version's snapshot for Compare, and what differs between that
 * version and the draft (`GET …/changes?against=`, U47a).
 *
 * Never throws: a failed read is `null`, which History says ("Couldn't
 * load …", Try again), never an empty list.
 */

async function read<T>(path: string): Promise<T | null> {
    try {
        const base = await orgBase();
        if (!base) return null;
        const res = await apiFetch(`${base}/sites/${path}`);
        if (!res.ok) return null;
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

/** Every publish of the site, newest first. */
export async function readVersions(
    siteId: string,
): Promise<SitePublication[] | null> {
    const list = await read<unknown>(`${siteId}/publications`);
    return Array.isArray(list) ? (list as SitePublication[]) : null;
}

/** One version with its stored snapshot, as it was served. */
export async function readVersion(
    siteId: string,
    publicationId: string,
): Promise<SitePublicationDetail | null> {
    return read<SitePublicationDetail>(
        `${siteId}/publications/${encodeURIComponent(publicationId)}`,
    );
}

/** The draft's changes against a past version instead of the live one. */
export async function readChangesAgainst(
    siteId: string,
    publicationId: string,
): Promise<SiteChanges | null> {
    return read<SiteChanges>(
        `${siteId}/changes?against=${encodeURIComponent(publicationId)}`,
    );
}
