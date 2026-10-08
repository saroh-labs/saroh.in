import { Transform } from "class-transformer";
import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

/**
 * A hostname as typed or pasted, reduced to the bare name (UX-066):
 * `https://www.shop.in/` → `www.shop.in`. Scheme, path, query, port and the
 * root's trailing dot go; what is left is then held to {@link HOSTNAME_RE}.
 */
export function bareHostname(value: string): string {
    return (
        value
            .trim()
            .toLowerCase()
            .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
            .replace(/^\/\//, "")
            .split(/[/?#]/)[0] ?? ""
    )
        .replace(/:\d+$/, "")
        .replace(/\.$/, "");
}

const normalizeHostname = ({ value }: { value: unknown }) =>
    typeof value === "string" ? bareHostname(value) : value;

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/**
 * A DNS hostname: one or more dot-separated labels, each 1–63 chars of
 * `[a-z0-9-]` not starting/ending with a hyphen, with at least one dot (so a
 * bare label like "localhost" is rejected — a claim is always a FQDN such as
 * "shop.acme.com" or "acme.saroh.app"). Applied AFTER lowercasing/trimming.
 */
export const HOSTNAME_RE =
    /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const HOSTNAME_MSG =
    "Enter just the domain, like www.yourshop.in — no https:// or slashes.";

/**
 * A hostname kept for test releases (DEC-071, KTD-12): one whose first label
 * is `test` (`test.shop.acme.com` is the test host of `shop.acme.com`) or
 * starts with `test--` (a platform test host's shape). A claim on one could
 * never be served live (`site-host-mode.ts` reads it as test), so it is
 * refused up front. Applied AFTER lowercasing/trimming.
 */
export const TEST_RESERVED_HOSTNAME_RE = /^test(?:\.|--)/;

export const TEST_RESERVED_HOSTNAME_MSG =
    "Addresses starting with test. are kept for test releases. Choose another.";

/** True for a hostname {@link TEST_RESERVED_HOSTNAME_RE} keeps back. */
export function isTestReservedHostname(hostname: string): boolean {
    return TEST_RESERVED_HOSTNAME_RE.test(hostname.trim().toLowerCase());
}

/** Claim a hostname for the org. `siteId` optionally links it to a Site now. */
export class ClaimDomainDto {
    @Transform(normalizeHostname)
    @IsString()
    @MaxLength(253)
    @Matches(HOSTNAME_RE, { message: HOSTNAME_MSG })
    @Matches(/^(?!test(?:\.|--))/, { message: TEST_RESERVED_HOSTNAME_MSG })
    hostname!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(64)
    siteId?: string;
}
