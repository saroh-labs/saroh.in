import { shortDate } from "@/lib/sites/format-date";
import type {
    ApprovalOutcome,
    FlagType,
    ReviewState,
} from "@/lib/sites/service";

/**
 * The pre-publish check's words (`pre-publish-check.tsx`): the flag groups,
 * the approval line and what publishing puts live. Moved out of the
 * component when "Publishing needs approval" (DEC-071, T11) grew it past
 * 400 lines (00-universal §6); the component keeps the drawing.
 */

/** The spec's voice: warm, a little human. Group headings, not error codes. */
export const TYPE_LABEL: Record<FlagType, string> = {
    emptyRequiredField: "Nothing filled in yet",
    placeholderText: "Placeholder text still in place",
    missingImage: "No image yet",
    hiddenButLinked: "Hidden but linked from navigation",
    pageNotInNavigation: "Not in the navigation",
    unpublishedChanges: "Changes visitors cannot see yet",
    missingSeoDescription: "No search description",
    brokenLink: "Link goes nowhere",
    phoneWidth: "Breaks at phone width",
    storefrontUnchosen: "No location for your online shop",
    reservedAddress: "Change path",
    shopCantTakeOrders: "Can't take orders online",
    productsNotOnSale: "Products not on sale",
    addressMissing: "No web address",
};

/**
 * The approval line, worded per outcome. Keyed by the union so a new outcome
 * is a type error here rather than a line that falls through to "asked for
 * changes". Only an approval takes the accent: it is the one good-news verdict.
 */
export const APPROVAL_LINE: Record<
    ApprovalOutcome,
    {
        approved: boolean;
        /** `zone`: the business's, for the day it was decided (UX-008). */
        text: (
            approval: NonNullable<ReviewState["latestApproval"]>,
            zone: string,
        ) => string;
    }
> = {
    // Asked for and not yet answered (#278). Publishing is still allowed from
    // this panel — it says so, and the publish records as a bypass.
    REQUESTED: {
        approved: false,
        text: ({ by }) => `${by} asked for a review, and nobody has replied`,
    },
    APPROVED: { approved: true, text: ({ by }) => `${by} approved this site` },
    // In their words when they gave a reason (UX-043).
    CHANGES_REQUESTED: {
        approved: false,
        text: ({ by, reason }) =>
            reason
                ? `${by} asked for changes: “${reason}”`
                : `${by} asked for changes`,
    },
    BYPASSED: {
        approved: false,
        text: ({ by, at }, zone) =>
            `${by} published without approval on ${shortDate(at, zone)}`,
    },
    // An owner's override of "Publishing needs approval" (DEC-071, T9).
    OVERRIDDEN: {
        approved: false,
        text: ({ by, at }, zone) =>
            `${by} went live without approval on ${shortDate(at, zone)}`,
    },
    // The request was taken back (UX-068).
    WITHDRAWN: {
        approved: false,
        text: ({ by, at }, zone) =>
            `${by} withdrew the review request on ${shortDate(at, zone)}`,
    },
};

/**
 * What publishing puts live, in one sentence (G2). A site that has never
 * published goes live whole; a missing count is said, not guessed; and
 * publishing with nothing changed still makes a new version.
 */
export function goesLive(
    neverPublished: boolean,
    pendingKnown: boolean,
    pendingSummary: string | null,
): string {
    if (neverPublished) return "Publishing puts the whole site live.";
    if (!pendingKnown) {
        return "We couldn't check what's changed. Publishing puts the site live as it is now.";
    }
    if (pendingSummary) return `Publishing puts live: ${pendingSummary}.`;
    return "Nothing has changed since the last publish. Publishing again makes a new version that matches the live one.";
}
