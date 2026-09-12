import { createHash } from "node:crypto";

/**
 * Hash an invitation token for storage (#276).
 *
 * The row stores only this; the token itself exists in the invitee's email and
 * nowhere else. A leaked database row therefore cannot be used to join an
 * organization — the same rule the site share links follow.
 *
 * A plain sha256 with no salt or stretching, deliberately: the input is 32
 * random bytes from `randomBytes`, so there is nothing to guess and no
 * dictionary to run. Stretching protects low-entropy secrets, and this is not
 * one.
 */
export function hashInviteToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}
