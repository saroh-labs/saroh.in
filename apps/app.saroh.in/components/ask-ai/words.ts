import type {
    AskAiDraftCard,
    AskAiDraftKind,
    AskAiState,
} from "@saroh/api-contract";

import { PROFILE } from "@/lib/edition";
import { formatDate } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";

/**
 * Ask AI's own words (boards AIW 11–21, audit-fixed 13 Nov): every line the
 * panel says about a question that wasn't answered, was stopped or was cut
 * off, and the names a draft card uses. One place, so a test reads them.
 */

export const DIDNT_USE = "This didn't use a question.";
/** Hinglish is offered where the edition's captions offer it (India), never on Global. */
export const HINGLISH = PROFILE.hinglishCaptions;
export const PLACEHOLDER = HINGLISH
    ? "Ask anything, in English or Hinglish"
    : "Ask anything about your business";
export const FOLLOW_UP = "Ask a follow-up";
export const PAUSED = "Typed questions are paused";

export const STOPPED_BEFORE = "Stopped. This didn't use a question.";
export const STOPPED_AFTER = "Stopped. This used a question.";
export const CUT_OFF = "This answer was cut off. This didn't use a question.";
export const COULDNT_ANSWER = "I couldn't answer that just now.";
/** No end came back: whether it was answered (and counted) isn't known here. */
export const LOST =
    "The connection dropped. If it was answered, the answer is in your conversations.";
export const UNAVAILABLE = "Ask AI isn't available right now.";
export const DAILY_LIMIT =
    "You've reached today's Ask AI limit. It resets tomorrow.";
export const REPORTED = "Thanks. Saroh will look at it.";
/** Where the AI provider sits, said only where it's news: India's data leaves India. */
export const PROVIDER_WHERE = HINGLISH ? ", outside India" : "";
export const HISTORY_LINE =
    "Only you see these. Each is kept for 90 days, then deleted.";

/** "14 Dec", in the business's day. */
export function resetDay(iso: string, zone: string): string {
    return formatDate(iso, zone);
}

/**
 * The meter, only once 20% or less of the period is left (audit choice 2),
 * saying what's left. Null otherwise, and with no cap.
 */
export function meterOf(
    usage: AskAiState["usage"],
    zone: string,
): { left: number; share: number; words: string } | null {
    if (usage?.limit == null || usage.limit <= 0) return null;
    const left = Math.max(0, usage.limit - usage.used);
    const share = left / usage.limit;
    if (share > 0.2 || left === 0) return null;
    return {
        left,
        share,
        words: `${count(left, "question")} left · resets ${resetDay(usage.resetsAt, zone)}`,
    };
}

/** The plan Ask AI comes with, or words for none named. */
export function planName(upgradeTo: string | null | undefined): string {
    const name = upgradeTo?.trim();
    if (name) return name;
    return "a paid plan";
}

export function atLimit(usage: AskAiState["usage"]): boolean {
    return !!usage && usage.limit !== null && usage.used >= usage.limit;
}

const NOUN: Record<AskAiDraftKind, string> = {
    product: "product",
    service: "service",
    hours: "opening hours",
    booking: "booking",
    order: "order",
    customer: "customer",
    blog_post: "blog post",
};

/** Moving a booking is a move; other edits are changes (boards 5 and 14). */
function moves(card: AskAiDraftCard): boolean {
    return (
        card.kind === "booking" && card.fields.some((f) => f.field === "when")
    );
}

export function draftWords(card: AskAiDraftCard) {
    const noun = NOUN[card.kind];
    // A blog post is only ever saved as a draft (owner, 14 Nov).
    if (card.kind === "blog_post") {
        return {
            noun,
            tag: "Draft blog post",
            confirm: "Save as draft",
            state: card.status === "refused" ? "Not saved" : "Not saved yet",
            cancelled: "Not saved",
            open: "Open blog post",
            // Open in editor (owner, 14 Nov): unsaved, or once saved.
            editor: "Open in editor",
            handedOff: "Opened in the editor",
            done: "Added",
        };
    }
    // Several orders to one step (AF 8): "Change 3 orders", "Mark 3 ready".
    if (card.tool === "update_orders_status") {
        const n = card.targetId?.split(",").length ?? 0;
        const step = card.fields.find((f) => f.field === "stage");
        const to = typeof step?.new === "string" ? step.new : "moved on";
        return {
            noun: "orders",
            tag: `Change ${n} orders`,
            confirm: `Mark ${n} ${to.replace(/_/g, " ")}`,
            state:
                card.status === "refused" ? "Not changed" : "Not changed yet",
            cancelled: "Not changed",
            open: "Open orders",
            editor: null,
            handedOff: null,
            done: "Done",
        };
    }
    // A booking from a free time (AF 4): "Book it", then "Booked".
    if (card.tool === "create_booking") {
        return {
            noun,
            tag: "New booking",
            confirm: "Book it",
            state: card.status === "refused" ? "Not booked" : "Not booked yet",
            cancelled: "Not booked",
            open: "Open booking",
            editor: null,
            handedOff: null,
            done: "Booked",
        };
    }
    const create = card.action === "create";
    return {
        noun,
        tag: create ? `New ${noun}` : `Change ${noun}`,
        confirm: create
            ? `Add ${noun}`
            : moves(card)
              ? "Move booking"
              : `Change ${noun}`,
        state:
            card.status === "refused"
                ? create
                    ? "Not added"
                    : "Not changed"
                : create
                  ? "Not added yet"
                  : moves(card)
                    ? "Not moved yet"
                    : "Not changed yet",
        cancelled: create ? "Not added" : "Not changed",
        open: `Open ${noun}`,
        editor: null,
        handedOff: null,
        done: create ? "Added" : "Done",
    };
}

/** The app route for a record a card names: built from its typed id only. */
export function recordHref(kind: AskAiDraftKind, id: string): string {
    const at = encodeURIComponent(id);
    switch (kind) {
        case "product":
            return `/commerce/products/${at}`;
        case "service":
        case "hours":
            return `/services/${at}`;
        case "booking":
            return `/bookings/${at}`;
        case "order":
            return `/commerce/orders/${at}`;
        case "customer":
            return `/contacts/${at}`;
        case "blog_post": {
            // `<siteId>:<postId>`: the post editor sits under its website.
            const [site = "", post = ""] = id.split(":");
            return `/sites/${encodeURIComponent(site)}/posts/${encodeURIComponent(post)}`;
        }
    }
}

/** The post editor's new post, started from an Ask AI blog draft, unsaved. */
export function editorHref(siteId: string, draftId: string): string {
    return `/sites/${encodeURIComponent(siteId)}/posts/new?from=${encodeURIComponent(draftId)}`;
}

/** A field's value as text: the card never draws a value as markup. */
/** Fields stored as HTML by the editor. */
const RICH_TEXT = new Set(["description"]);

export function valueText(value: unknown, field?: string): string {
    if (value === null || value === undefined || value === "") return "";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return String(value);
    if (typeof value === "string") {
        // A rich-text field is stored as HTML: show its words. Any other is
        // shown exactly as written, tags and all (drawn as text, never markup).
        return field && RICH_TEXT.has(field)
            ? value
                  .replace(/<[^>]*>/g, " ")
                  .replace(/\s+/g, " ")
                  .trim()
            : value;
    }
    if (Array.isArray(value)) {
        return value
            .map((v) => valueText(v))
            .filter(Boolean)
            .join(", ");
    }
    if (typeof value === "object") {
        return Object.values(value as Record<string, unknown>)
            .map((v) => valueText(v))
            .filter(Boolean)
            .join(" ");
    }
    return "";
}
