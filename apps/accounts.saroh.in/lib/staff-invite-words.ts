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

/**
 * How the invite ended for this browser, kept for a few minutes in place of
 * the spent token. Changing a cookie in a server action reloads the page,
 * and the page can no longer read an invite that was just used, so without
 * this the "You're on the team" answer would turn into "can't be used".
 */
export const STAFF_INVITE_DONE_COOKIE = "saroh_staff_invite_done";
export const STAFF_INVITE_DONE_MAX_AGE_SECONDS = 10 * 60;

const DONE_OUTCOMES = [
    "joined",
    "ALREADY_ON_TEAM",
    "INVITE_GONE",
    "INVITE_SENDER_CANNOT_GRANT",
] as const;
export type StaffInviteDone = (typeof DONE_OUTCOMES)[number];

/** A cookie's value as an outcome, or null for anything else. */
export function staffInviteDoneOf(
    value: string | undefined,
): StaffInviteDone | null {
    return DONE_OUTCOMES.find((outcome) => outcome === value) ?? null;
}

/** The outcome to keep after an accept, or null when the invite isn't over. */
export function doneAfterAccept(
    answer: { ok: true } | { ok: false; code?: string },
): StaffInviteDone | null {
    if (answer.ok) return "joined";
    const done = staffInviteDoneOf(answer.code);
    return done === "joined" ? null : done;
}

/** What the page says once the invite is over, from its outcome. */
export function doneWords(done: Exclude<StaffInviteDone, "joined">): {
    title: string;
    description: string;
} {
    const result = acceptResult({
        ok: false,
        status: 409,
        error: SENDER_CANNOT_GRANT,
        code: done,
    });
    return result.ok
        ? STAFF_INVITE_COPY.gone
        : { title: result.title, description: result.description };
}

const SENDER_CANNOT_GRANT =
    "Whoever sent this invite can't add teammates any more. Ask someone on the team for a new one.";

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
