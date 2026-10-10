import { env } from "@/env";

/**
 * Reading an invitation before there is an account to read it with.
 *
 * accounts.saroh.in holds no database credentials (that boundary is the
 * reason this app exists as its own host), so the invitation is fetched from
 * the API's public preview endpoint, which decides for itself what a link
 * holder may see.
 */

export interface InvitationPreview {
    organizationName: string;
    invitedByName: string | null;
    role: "OWNER" | "ADMIN" | "MEMBER" | "REVIEWER";
    /** The role as stored: a built-in name, or a role the business made. */
    roleKey?: string;
    /** Set only for a role the business made. Its own name. */
    roleLabel?: string | null;
    /**
     * What a role the business made lets them do, in the catalogue's words.
     * Null for a built-in, which `ROLE_MEANS` already describes.
     */
    grants?: string[] | null;
    /** Who it was addressed to. The accept refuses any other address. */
    email: string;
}

/**
 * What reading an invitation came to.
 *
 * `gone` is every reason an invitation cannot be shown: unknown, withdrawn,
 * already used, expired. The API answers all four the same way on purpose,
 * and telling them apart here would undo it.
 *
 * `unreachable` is NOT one of them: the API did not answer, so nothing is
 * known about the invitation. The page used to show both as "This invitation
 * is no longer valid", which told someone holding a good invitation that it
 * was dead (UX audit, 10 Oct).
 */
export type InvitationRead =
    | { status: "found"; invitation: InvitationPreview }
    | { status: "gone" }
    | { status: "unreachable" };

/**
 * The gone state's words. One title on all three invitation pages: this one,
 * and the workspace's `/join/:token` and `/invitations/:token`
 * (`apps/app.saroh.in/lib/invitations/outcome.ts`, whose test keeps them
 * equal).
 */
export const INVITATION_GONE = {
    title: "This invitation can no longer be used",
    description:
        "It was withdrawn, already used, or has expired. Ask whoever sent it for a new one.",
} as const;

/** The API did not answer, so nothing is known about the invitation. */
export const INVITATION_UNREACHABLE = {
    title: "Couldn't check this invitation",
    description: "Try again in a moment. The invitation itself is untouched.",
} as const;

function apiBase(): string {
    if (env.NEXT_PUBLIC_BETTER_AUTH_URL) {
        return new URL(env.NEXT_PUBLIC_BETTER_AUTH_URL).origin;
    }
    return env.NODE_ENV === "production"
        ? "https://api.saroh.in"
        : "https://api.saroh.localhost";
}

/**
 * Which {@link InvitationRead} an answer's HTTP status is. A 404 is the
 * API's one answer for an invitation that cannot be shown (400 and 410 mean
 * the same from an older or newer API). Anything else that is not a success
 * is the API failing to answer the question: a 5xx, a 429, a proxy's error.
 */
export function invitationReadStatus(
    status: number,
): "found" | "gone" | "unreachable" {
    if (status >= 200 && status < 300) return "found";
    if (status === 404 || status === 400 || status === 410) return "gone";
    return "unreachable";
}

export async function getInvitation(token: string): Promise<InvitationRead> {
    try {
        const response = await fetch(
            `${apiBase()}/public/organization-invitations/${encodeURIComponent(token)}`,
            // An invitation can be revoked between two reads, so this is never
            // cached: a withdrawn invitation must stop opening.
            { cache: "no-store" },
        );
        const status = invitationReadStatus(response.status);
        if (status !== "found") return { status };
        return {
            status: "found",
            invitation: (await response.json()) as InvitationPreview,
        };
    } catch {
        // The network failed, or the answer was not the JSON it claimed to
        // be. Either way nothing was learned about the invitation.
        return { status: "unreachable" };
    }
}

/** What a role can do here, in the words a person who has never used Saroh needs. */
export const ROLE_MEANS: Record<InvitationPreview["role"], string> = {
    OWNER: "An Owner can do anything in the business, including billing, and can invite or remove anyone.",
    ADMIN: "An Admin can change the business and invite people, but cannot delete it or move billing.",
    MEMBER: "A Member can read the catalogue, orders and customers, and set prices at their own location. They cannot invite people or change the business.",
    REVIEWER:
        "A Reviewer can read the pages they were invited to and leave comments. They cannot publish or change anything else.",
};
