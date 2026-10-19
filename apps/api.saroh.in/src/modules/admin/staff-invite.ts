import { createHash, randomBytes } from "node:crypto";

import type { AdminPermission, AdminRole } from "./admin-permissions";
import { permissionsFor } from "./admin-permissions";

/**
 * The rules of a staff invite (DEC-169, admin console U24) that need no
 * database: the token, its hash, how long it lasts, what state an invite is
 * in, and whether a sender can reach a role. The service holds the writes.
 */

/** How long a link works, from when it was last sent (R32). */
export const STAFF_INVITE_VALID_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A new token: 32 bytes from the system's secure random source, base64url
 * (43 characters), so it is never guessed by walking. Only its hash is
 * stored; the token itself exists in the email and nowhere else.
 */
export function newStaffInviteToken(): string {
    return randomBytes(32).toString("base64url");
}

/** What a token looks like; anything else is refused before any lookup. */
export const STAFF_INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The stored form of a token: its sha256, hex (`StaffInvite_tokenHash_check`). */
export function hashStaffInviteToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
}

export function staffInviteExpiry(from: Date): Date {
    return new Date(from.getTime() + STAFF_INVITE_VALID_DAYS * DAY_MS);
}

/** An address as an invite stores and compares it. */
export function normaliseInviteEmail(email: string): string {
    return email.trim().toLowerCase();
}

export type StaffInviteState = "waiting" | "expired" | "accepted" | "withdrawn";

export function staffInviteState(
    invite: {
        acceptedAt: Date | null;
        withdrawnAt: Date | null;
        expiresAt: Date;
    },
    now: Date,
): StaffInviteState {
    if (invite.acceptedAt) return "accepted";
    if (invite.withdrawnAt) return "withdrawn";
    return invite.expiresAt <= now ? "expired" : "waiting";
}

/**
 * The roles on an invite that can do something the sender can't. Empty means
 * the sender reaches all of them. Reach is by permission, not by role name:
 * a Platform owner holds every permission and so may invite any role, and
 * nobody hands out a power they don't have themselves (the merchant side's
 * rule too, F19).
 */
export function rolesBeyondReach(
    roles: readonly AdminRole[],
    held: readonly AdminPermission[],
): AdminRole[] {
    const mine = new Set<string>(held);
    return roles.filter((role) =>
        permissionsFor([role]).some((permission) => !mine.has(permission)),
    );
}
