/**
 * An AI app's publish request, as the person answers it in Saroh (DEC-215
 * as amended 12 Nov 2026): the API's view, and which of the screen's states
 * it is in, with that state's words. No AI app can publish; this screen is
 * the only way its prepared publish goes live.
 */

/** `GET …/sites/:siteId/publish-requests/:requestId`. */
export interface PublishRequestView {
    siteId: string;
    siteName: string;
    app: string;
    connectedBy: string | null;
    requestedAt: string;
    expiresAt: string;
    status: "open" | "expired" | "published" | "sent_for_approval" | "declined";
    will: "go_live" | "go_to_reviewers";
    draftChanged: boolean;
    neverPublished: boolean;
    pendingChanges: number | null;
    pendingSiteChanges: string[] | null;
    decidedBy: string | null;
    decidedAt: string | null;
    liveUrl: string | null;
}

/** What confirm and decline answer. */
export interface PublishRequestAnswer {
    outcome: "published" | "sent_for_approval" | "declined";
    liveUrl: string | null;
}

/** The screen's states, after loading (the route's loader) and access (403). */
export type PublishRequestState =
    | "open"
    | "expired"
    | "used"
    | "draftChanged"
    | "published"
    | "sentForApproval"
    | "declined";

/**
 * Which state the screen shows. An answer given on this screen wins; a
 * refusal's code moves it to the state the API named.
 */
export function stateOf(
    view: PublishRequestView,
    answered: PublishRequestAnswer | null,
    refusedWith: string | null,
): PublishRequestState {
    if (answered) {
        return answered.outcome === "published"
            ? "published"
            : answered.outcome === "sent_for_approval"
              ? "sentForApproval"
              : "declined";
    }
    if (refusedWith === "PUBLISH_REQUEST_EXPIRED") return "expired";
    if (refusedWith === "PUBLISH_REQUEST_USED") return "used";
    if (refusedWith === "DRAFT_CHANGED") return "draftChanged";
    if (view.status === "expired") return "expired";
    if (view.status !== "open") return "used";
    return view.draftChanged ? "draftChanged" : "open";
}

const AGAIN = "Ask the app to prepare it again.";

/** The line under the title for each closed state; null while it can be answered. */
export function closedLine(
    state: PublishRequestState,
    view: PublishRequestView,
): string | null {
    switch (state) {
        case "expired":
            return `This request has expired: a request lasts 24 hours, and a newer one from the app replaces it. Nothing was published. ${AGAIN}`;
        case "used":
            return usedLine(view);
        case "draftChanged":
            return `The website changed since ${view.app} prepared this, so it can't go live as it was shown. Nothing was published. ${AGAIN}`;
        case "declined":
            return `Not published. ${view.app} is told you said no.`;
        default:
            return null;
    }
}

function usedLine(view: PublishRequestView): string {
    const who = view.decidedBy ?? "Someone";
    if (view.status === "published") return `${who} already published this.`;
    if (view.status === "sent_for_approval") {
        return `${who} already sent this to the reviewers.`;
    }
    if (view.status === "declined")
        return `${who} already chose not to publish this.`;
    return "This request was already answered.";
}

/** The main button's words: Publish, or Send for approval. */
export const confirmLabel = (view: PublishRequestView) =>
    view.will === "go_to_reviewers" ? "Send for approval" : "Publish";

/** Where it goes, said before the person presses anything. */
export const routeLine = (view: PublishRequestView) =>
    view.will === "go_to_reviewers"
        ? "This website needs a reviewer's approval: confirming sends it to the reviewers, and it goes live once they approve it."
        : "Publishing puts it live for everyone, now.";

/** "AI app Claude, connected by Asha", for the header. */
export const askedByLine = (view: PublishRequestView) =>
    view.connectedBy
        ? `${view.app} prepared this, on ${view.connectedBy}'s connection.`
        : `${view.app} prepared this.`;

/** "flour.saroh.app" from the live URL, for the result's address row. */
export const addressOf = (liveUrl: string | null) =>
    liveUrl ? liveUrl.replace(/^https?:\/\//, "") : null;
