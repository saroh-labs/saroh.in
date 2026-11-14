import { z } from "zod";

/**
 * Ask AI's drafts (DEC-220, plan 2026-11-13-001 U5): a change Ask AI
 * drafted for the person to confirm, and what Confirm, Undo and Draft
 * again answer. Workspace routes under
 * `organizations/:organizationId/ask-ai/drafts/:draftId`, not public, so
 * not in the OpenAPI documents. The draft is kept by the API; these routes
 * take only its id (and, for Confirm, the fields the person filled in).
 */

/** What a draft changes. */
export const askAiDraftKind = z.enum([
    "product",
    "service",
    "hours",
    "booking",
    "order",
    "customer",
    "blog_post",
]);
export type AskAiDraftKind = z.infer<typeof askAiDraftKind>;

/** Why Saroh won't save a draft, worded on the card. */
export const askAiDraftRefusal = z.enum([
    "plan-limit",
    "duplicate",
    "missing",
    "changed",
    "other",
]);
export type AskAiDraftRefusal = z.infer<typeof askAiDraftRefusal>;

/**
 * One field the draft sets: its value now (null for a new record) and
 * after. Values are what the tool takes (a price in the main unit, hours
 * as a list); names and words in them may be customers', shown as text.
 */
export const askAiDraftField = z.object({
    field: z.string(),
    label: z.string(),
    old: z.unknown(),
    new: z.unknown(),
});
export type AskAiDraftField = z.infer<typeof askAiDraftField>;

/** The card: every field that will change, old → new. A field not here is never saved. */
export const askAiDraftCard = z.object({
    draftId: z.string(),
    tool: z.string(),
    kind: askAiDraftKind,
    action: z.enum(["create", "edit"]),
    status: z.enum(["drafted", "confirmed", "undone", "expired", "refused"]),
    /** The record an edit changes, or the one a confirmed create made. */
    targetId: z.string().nullable(),
    targetName: z.string(),
    fields: z.array(askAiDraftField),
    /** Fields the person fills in on the card before Confirm. */
    missing: z.array(z.object({ field: z.string(), label: z.string() })),
    refusal: z
        .object({
            reason: askAiDraftRefusal,
            words: z.string(),
            /** For a duplicate: the one the business has, to open. */
            existingId: z.string().nullable(),
        })
        .nullable(),
    /** Said beside Confirm, like "The customer is told." */
    note: z.string().nullable(),
    /** No Confirm or Undo after this (the end of the business's day). */
    expiresAt: z.string(),
});
export type AskAiDraftCard = z.infer<typeof askAiDraftCard>;

/**
 * Confirm's only body: values for the card's `missing` fields. Anything
 * else a client sends is ignored, never saved.
 */
export const askAiConfirmBody = z.object({
    fields: z.record(z.string(), z.unknown()).optional(),
});
export type AskAiConfirmBody = z.infer<typeof askAiConfirmBody>;

/**
 * What Confirm, Undo and Draft again answer: done (an edit, with Undo),
 * added (a create, with what to open), undone, drafted (a new card), or
 * refused (the card says why).
 */
export const askAiDraftResult = z.object({
    outcome: z.enum(["done", "added", "undone", "drafted", "refused"]),
    card: askAiDraftCard,
    /** One or two sentences for the person. */
    words: z.string(),
    canUndo: z.boolean(),
    /** A create's new record. */
    open: z.object({ kind: askAiDraftKind, id: z.string() }).nullable(),
});
export type AskAiDraftResult = z.infer<typeof askAiDraftResult>;
