import type { Metadata } from "next";

import type { VerificationService } from "@saroh/block-contract";
import { VERIFICATION_META_NAMES } from "@saroh/block-contract";

/**
 * A live site's verification codes as page metadata (DEC-108, #894): one
 * `<meta>` tag per service, on every page of the live host, so a home page
 * that redirects still carries them.
 *
 * Meta and Pinterest verify the registrable domain, and `saroh.app` is not
 * on the Public Suffix List (see `lib/origin.ts`): on a `*.saroh.app`
 * address their tag would claim Saroh's own domain. So they are drawn only
 * on a merchant's own domain. Google and Bing verify the exact address, and
 * are drawn everywhere.
 */
const DOMAIN_WIDE: readonly VerificationService[] = ["meta", "pinterest"];

export function verificationMetadata(
    codes: readonly { service: VerificationService; code: string }[],
    onPlatformAddress: boolean,
): Metadata["verification"] | undefined {
    const shown = codes.filter(
        (c) => !(onPlatformAddress && DOMAIN_WIDE.includes(c.service)),
    );
    if (shown.length === 0) return undefined;
    const google = shown.find((c) => c.service === "google")?.code;
    const other: Record<string, string> = {};
    for (const c of shown) {
        if (c.service !== "google") {
            other[VERIFICATION_META_NAMES[c.service]] = c.code;
        }
    }
    return {
        ...(google ? { google } : {}),
        ...(Object.keys(other).length > 0 ? { other } : {}),
    };
}

/** Whether a host is a Saroh address (`rye.saroh.app`), not the merchant's own. */
export function isPlatformAddress(host: string, rootDomain: string): boolean {
    const h = host.toLowerCase();
    const root = rootDomain.toLowerCase();
    return h === root || h.endsWith(`.${root}`);
}
