/**
 * A staff invite on accounts (admin console U24): its constants, which
 * screen to show, and every sentence the page says. Pure and client-safe;
 * the reads and the accept are `lib/staff-invite.ts` and
 * `app/staff-invite/actions.ts`.
 */

/**
 * The httpOnly cookie the link's token is swapped into
 * (`app/staff-invite/open/route.ts`), so the address bar, the history and
 * any Referer carry a clean `/staff-invite` and never the token. Scoped to
 * that path, and short-lived: long enough to sign in or make an account.
 */
export const STAFF_INVITE_COOKIE = "saroh_staff_invite";
export const STAFF_INVITE_PATH = "/staff-invite";
export const STAFF_INVITE_COOKIE_MAX_AGE_SECONDS = 60 * 60;

/** What a token from the API looks like (32 random bytes, base64url). */
export const STAFF_INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** What the API shows the link's holder (`POST /public/staff-invites/preview`). */
export interface StaffInvitePreview {
    email: string;
    name: string;
    roles: string[];
    worksAs: string;
    invitedByName: string | null;
    expiresAt: string;
}

export type StaffInviteRead =
    | { status: "found"; invite: StaffInvitePreview }
    | { status: "gone" }
    | { status: "unreachable" };

/** The console's roles in its own words (admin.saroh.in `lib/roles.ts`). */
export const CONSOLE_ROLE_LABEL: Record<string, string> = {
    PLATFORM_OWNER: "Platform owner",
    SUPPORT: "Support",
    OPERATIONS: "Operations",
    BILLING: "Billing",
    RELEASE_MANAGER: "Release manager",
    AUDITOR: "Auditor",
    ACCOUNT_MANAGER: "Account manager",
};

export const WORKS_AS_LABEL: Record<string, string> = {
    ACCOUNT_MANAGER_JOB: "an account manager",
    FINDS_BUSINESSES: "someone who finds businesses",
    OTHER: "part of the team",
};

/** "Support and Billing", "Support, Billing and Auditor". */
export function rolesInWords(roles: readonly string[]): string {
    const words = roles.map((role) => CONSOLE_ROLE_LABEL[role] ?? role);
    if (words.length <= 1) return words.join("");
    return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** Which screen the page draws. */
export type StaffInviteScreen =
    | { kind: "no-link" }
    | { kind: "gone" }
    | { kind: "unreachable" }
    | { kind: "sign-in"; invite: StaffInvitePreview }
    | { kind: "wrong-account"; invite: StaffInvitePreview; signedInAs: string }
    | { kind: "ready"; invite: StaffInvitePreview };

/**
 * The screen for what the cookie, the API and the session said. With no
 * cookie there is nothing to read: the link was never opened here, or the
 * hour it lasts has passed. The address check here is a courtesy; the API
 * refuses any other account at the accept.
 */
export function staffInviteScreen(input: {
    hasToken: boolean;
    read: StaffInviteRead | null;
    signedInAs: string | null;
}): StaffInviteScreen {
    if (!input.hasToken || !input.read) return { kind: "no-link" };
    if (input.read.status !== "found") return { kind: input.read.status };
    const { invite } = input.read;
    if (!input.signedInAs) return { kind: "sign-in", invite };
    if (input.signedInAs.trim().toLowerCase() !== invite.email) {
        return {
            kind: "wrong-account",
            invite,
            signedInAs: input.signedInAs,
        };
    }
    return { kind: "ready", invite };
}

export const STAFF_INVITE_COPY = {
    noLink: {
        title: "Open the link from your email again",
        description:
            "This page needs the link from your invite. It works for an hour after you open it, so open it again from the email.",
    },
    gone: {
        title: "This invite can no longer be used",
        description:
            "It was withdrawn, already used, or has expired. Ask whoever sent it for a new one.",
    },
    unreachable: {
        title: "Couldn't check this invite",
        description: "Try again in a moment. The invite itself is untouched.",
    },
    joined: {
        title: "You're on the team",
        description:
            "Your access is ready. Open the console to start. Your roles decide what you see there.",
    },
} as const;

/** What the accept answered, read into what the page says next. */
export type StaffInviteAcceptResult =
    | { ok: true }
    | {
          ok: false;
          title: string;
          description: string;
          /** The fix is to sign in as someone else. */
          signOut?: boolean;
          /** Nothing left to do here: the invite is over for this person. */
          final?: boolean;
      };

export function acceptResult(
    answer:
        | { ok: true }
        | { ok: false; status: number; error: string; code?: string },
): StaffInviteAcceptResult {
    if (answer.ok) return { ok: true };
    switch (answer.code) {
        case "ALREADY_ON_TEAM":
            return {
                ok: false,
                title: "You're already on the team",
                description:
                    "Your account already has access to the console, so there is nothing to accept. Ask a Platform owner if you need other roles.",
                final: true,
            };
        case "INVITE_GONE":
            return { ok: false, ...STAFF_INVITE_COPY.gone, final: true };
        case "INVITE_WRONG_ACCOUNT":
            return {
                ok: false,
                title: "This invite is for another email",
                description: answer.error,
                signOut: true,
            };
        case "INVITE_EMAIL_NOT_CONFIRMED":
            return {
                ok: false,
                title: "Confirm your email first",
                description: answer.error,
                signOut: true,
            };
        case "INVITE_SENDER_CANNOT_GRANT":
            return {
                ok: false,
                title: "This invite can't be used now",
                description: answer.error,
                final: true,
            };
        default:
            return {
                ok: false,
                title: "That didn't go through",
                description:
                    answer.status === 0 || answer.status >= 500
                        ? "Nothing has changed. Try again in a moment."
                        : answer.error,
            };
    }
}
