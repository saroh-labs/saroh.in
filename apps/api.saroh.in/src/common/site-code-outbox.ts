import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Where the fake code transport leaves each code (round-2 plan A, A9), so a
 * browser test on the same machine can sign in: one file per address, in
 * the system's temp directory, holding the last code sent to it.
 *
 * Only ever written when there is no SMTP and the fake transport is allowed
 * ({@link siteCodesFakeAllowed}) — never in production. The e2e suite reads
 * the same path (`e2e/tests/site-codes.ts`); keep the two in step.
 */
export const SITE_CODE_OUTBOX_DIR = "saroh-site-codes";

export function siteCodeOutboxPath(email: string, dir = tmpdir()): string {
    return path.join(
        dir,
        SITE_CODE_OUTBOX_DIR,
        encodeURIComponent(email.trim().toLowerCase()),
    );
}

/** Leave the code where a local browser test finds it. Never throws. */
export function writeSiteCodeOutbox(
    email: string,
    code: string,
    dir = tmpdir(),
): void {
    try {
        const file = siteCodeOutboxPath(email, dir);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, code, { mode: 0o600 });
    } catch {
        // A read-only temp directory only costs the browser test its code.
    }
}

/**
 * Whether the fake code transport may stand in for SMTP: in development,
 * and anywhere else but production when it is asked for by name
 * (`SITE_CODES_EMAIL_FAKE`) — the browser-test stack in CI, which runs the
 * built API with no `NODE_ENV`. Production never fakes a code.
 */
export function siteCodesFakeAllowed(
    nodeEnv: string | undefined,
    fake: string | undefined,
): boolean {
    if (nodeEnv === "production") return false;
    return nodeEnv === "development" || fake === "log" || fake === "fail";
}
