import { Transform } from "class-transformer";
import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

const normalizeHostname = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/**
 * A DNS hostname: one or more dot-separated labels, each 1–63 chars of
 * `[a-z0-9-]` not starting/ending with a hyphen, with at least one dot (so a
 * bare label like "localhost" is rejected — a claim is always a FQDN such as
 * "shop.acme.com" or "acme.saroh.in"). Applied AFTER lowercasing/trimming.
 */
export const HOSTNAME_RE =
    /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const HOSTNAME_MSG =
    "hostname must be a valid domain, e.g. shop.acme.com or acme.saroh.in";

/** Claim a hostname for the org. `siteId` optionally links it to a Site now. */
export class ClaimDomainDto {
    @Transform(normalizeHostname)
    @IsString()
    @MaxLength(253)
    @Matches(HOSTNAME_RE, { message: HOSTNAME_MSG })
    hostname!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(64)
    siteId?: string;
}
