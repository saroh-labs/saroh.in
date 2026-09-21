import { env } from "@/env";

/**
 * Reading an invitation before there is an account to read it with.
 *
 * accounts.saroh.in holds no database credentials — that boundary is the
 * reason this app exists as its own host — so the invitation is fetched from
 * the API's public preview endpoint, which decides for itself what a link
 * holder may see.
 */

export interface InvitationPreview {
    organizationName: string;
    invitedByName: string | null;
    role: "OWNER" | "ADMIN" | "MEMBER" | "REVIEWER";
    /** The role as stored — a built-in name, or a role the business made. */
    roleKey?: string;
    /** Set only for a role the business made; its own name. */
    roleLabel?: string | null;
    /**
     * What a role the business made lets them do, in the catalogue's words.
     * Null for a built-in, which `ROLE_MEANS` already describes.
     */
    grants?: string[] | null;
    /** Who it was addressed to. The accept refuses any other address. */
    email: string;
}

function apiBase(): string {
    if (env.NEXT_PUBLIC_BETTER_AUTH_URL) {
        return new URL(env.NEXT_PUBLIC_BETTER_AUTH_URL).origin;
    }
    return env.NODE_ENV === "production"
        ? "https://api.saroh.in"
        : "https://api.saroh.localhost";
}

/**
 * `null` for every reason an invitation cannot be shown — unknown, revoked,
 * already used, expired. The API answers all four the same way on purpose, and
 * repeating that distinction here would undo it.
 */
export async function getInvitation(
    token: string,
): Promise<InvitationPreview | null> {
    try {
        const response = await fetch(
            `${apiBase()}/public/organization-invitations/${encodeURIComponent(token)}`,
            // An invitation can be revoked between two reads, so this is never
            // cached: a withdrawn invitation must stop opening.
            { cache: "no-store" },
        );
        if (!response.ok) return null;
        return (await response.json()) as InvitationPreview;
    } catch {
        // The API being unreachable is not the same as an invalid invitation,
        // but the page can only offer one recovery either way: try the link
        // again, or ask whoever sent it.
        return null;
    }
}

/** What a role can do here, in the words a person who has never used Saroh needs. */
export const ROLE_MEANS: Record<InvitationPreview["role"], string> = {
    OWNER: "An Owner can do anything in the business, including billing, and can invite or remove anyone.",
    ADMIN: "An Admin can change the business and invite people, but cannot delete it or move billing.",
    MEMBER: "A Member can read the catalogue, orders and customers, and set prices at their own storefront. They cannot invite people or change the business.",
    REVIEWER:
        "A Reviewer can read the pages they were invited to and leave comments. They cannot publish or change anything else.",
};
