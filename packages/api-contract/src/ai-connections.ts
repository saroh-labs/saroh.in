import { z } from "zod";

import { id } from "./common";

/**
 * Settings › API and AI apps › AI assistants: one connection's changes in
 * this business, and rolling back its website draft. Workspace routes
 * under `organizations/:organizationId/ai-connections/:connectionId`, not
 * public, so not in the OpenAPI documents. Seen and used by the person who
 * connected it, or whoever holds `apikey:manage`.
 */

export const aiConnectionActivityQuery = z.strictObject({
    /** The last row's id from the page before. */
    cursor: z.string().max(64).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
});
export type AiConnectionActivityQuery = z.infer<
    typeof aiConnectionActivityQuery
>;

export const aiConnectionChange = z.object({
    id,
    tool: z.string(),
    /**
     * What it did, as Saroh wrote it at the time. It can quote names the
     * business or its customers wrote, so it is shown as plain text only.
     */
    summary: z.string(),
    at: z.string(),
});
export type AiConnectionChange = z.infer<typeof aiConnectionChange>;

/** A website draft this connection changed, and the point a roll back returns it to. */
export const aiConnectionSiteDraft = z.object({
    siteId: id,
    siteName: z.string(),
    /** When the connection's latest session began changing it. */
    since: z.string(),
});
export type AiConnectionSiteDraft = z.infer<typeof aiConnectionSiteDraft>;

export const aiConnectionActivity = z.object({
    /** Newest first. */
    data: z.array(aiConnectionChange),
    nextCursor: z.string().nullable(),
    /** On the first page only; empty on later ones. */
    siteDrafts: z.array(aiConnectionSiteDraft),
});
export type AiConnectionActivity = z.infer<typeof aiConnectionActivity>;

export const aiConnectionRollbackBody = z.strictObject({ siteId: id });
export type AiConnectionRollbackBody = z.infer<typeof aiConnectionRollbackBody>;

export const aiConnectionRollback = z.object({
    siteId: id,
    /** The draft is as it was then. */
    restoredTo: z.string(),
});
export type AiConnectionRollback = z.infer<typeof aiConnectionRollback>;
