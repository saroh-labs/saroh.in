import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

import type { CanActivate, ExecutionContext } from "@nestjs/common";
import {
    createParamDecorator,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";

import { hashClientIp } from "../../common/client-ip";
import { siteRelaySecret } from "./site-secrets";

/**
 * The signed relay from a merchant site's server (ADR-011; round-2 plan A,
 * A2).
 *
 * Every call to `public/site-accounts/*` comes from `apps/saroh.app`'s
 * server, so the address the API sees (DEC-027) is saroh.app's, not the
 * visitor's. saroh.app therefore sends, in `x-saroh-relay`, the visitor's
 * address, the host it served and the time, signed with a secret the two
 * apps share (`SITE_RELAY_SECRET`):
 *
 *     v1.<unix seconds>.<base64url(address)>.<base64url(host)>.<base64url(sig)>
 *
 * where `sig` is HMAC-SHA256 over `v1\n<seconds>\n<address>\n<host>`. The
 * API accepts it only when the signature checks (in constant time) and the
 * time is within 60 seconds of its own clock. A request without a valid
 * relay is a 401: these routes are server-to-server only, so nobody can call
 * them directly to skip the site's `Origin` check, pick the business, or
 * choose the address a limit counts them by.
 *
 * saroh.app's `lib/site-relay.ts` (A3) builds the header with the same
 * format; {@link signSiteRelay} is the reference, and what tests use.
 */
export const SITE_RELAY_HEADER = "x-saroh-relay";
export const SITE_RELAY_WINDOW_MS = 60_000;
const VERSION = "v1";
const MAX_HEADER_LENGTH = 1_024;

/** What a checked relay says about the request. */
export interface SiteRelay {
    /** The host the site's server served, lower-cased, no port. */
    host: string;
    /** The visitor's address as relayed. Never logged or stored raw. */
    address: string;
    /** The visitor's address hashed ({@link hashClientIp}) for limits and rows. */
    clientHash: string;
}

/** A host as it is signed and resolved: lower-cased, no port, no final dot. */
export function normaliseHost(host: string): string {
    const bare = host.trim().toLowerCase().split(":")[0] ?? "";
    return bare.endsWith(".") ? bare.slice(0, -1) : bare;
}

const HOST_PATTERN =
    /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;

function isHost(host: string): boolean {
    return HOST_PATTERN.test(host);
}

function b64(value: string | Buffer): string {
    return Buffer.from(value).toString("base64url");
}

function unb64(value: string): string | null {
    if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
    return Buffer.from(value, "base64url").toString("utf8");
}

function signature(
    secret: string,
    seconds: string,
    address: string,
    host: string,
): Buffer {
    return createHmac("sha256", secret)
        .update(`${VERSION}\n${seconds}\n${address}\n${host}`)
        .digest();
}

/** Build the header value. saroh.app does the same; tests use this. */
export function signSiteRelay(
    input: { address: string; host: string; now?: number },
    secret: string,
): string {
    const seconds = String(Math.floor((input.now ?? Date.now()) / 1000));
    const host = normaliseHost(input.host);
    return [
        VERSION,
        seconds,
        b64(input.address),
        b64(host),
        b64(signature(secret, seconds, input.address, host)),
    ].join(".");
}

/**
 * Check a relay header. `null` for anything missing, malformed, stale,
 * from the future beyond the window, or signed with another secret; the
 * caller answers 401 without saying which.
 */
export function verifySiteRelay(
    header: string | string[] | undefined,
    secret: string,
    now: number = Date.now(),
): SiteRelay | null {
    const value = Array.isArray(header) ? header[0] : header;
    if (!value || value.length > MAX_HEADER_LENGTH) return null;
    const parts = value.split(".");
    if (parts.length !== 5) return null;
    const [version, seconds, rawAddress, rawHost, rawSig] = parts as [
        string,
        string,
        string,
        string,
        string,
    ];
    if (version !== VERSION || !/^\d{1,12}$/.test(seconds)) return null;
    if (Math.abs(now - Number(seconds) * 1000) > SITE_RELAY_WINDOW_MS) {
        return null;
    }
    const address = unb64(rawAddress);
    const host = unb64(rawHost);
    if (!address || !host || isIP(address) === 0 || !isHost(host)) {
        return null;
    }
    if (!/^[A-Za-z0-9_-]+$/.test(rawSig)) return null;
    const given = Buffer.from(rawSig, "base64url");
    const expected = signature(secret, seconds, address, host);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return null;
    }
    const clientHash = hashClientIp(address);
    if (!clientHash) return null;
    return { host, address, clientHash };
}

interface RelayedRequest {
    headers: Record<string, string | string[] | undefined>;
    siteRelay?: SiteRelay;
}

/**
 * Refuses a site-accounts request without a valid relay (401), and hands
 * the checked relay to the handler as `request.siteRelay`.
 */
@Injectable()
export class SiteRelayGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<RelayedRequest>();
        const relay = verifySiteRelay(
            request.headers[SITE_RELAY_HEADER],
            siteRelaySecret(),
        );
        if (!relay) {
            throw new UnauthorizedException(
                "This request must come from the business's website.",
            );
        }
        request.siteRelay = relay;
        return true;
    }
}

/** The relay {@link SiteRelayGuard} checked. */
export const RelayContext = createParamDecorator(
    (_: unknown, context: ExecutionContext): SiteRelay => {
        const relay = context
            .switchToHttp()
            .getRequest<RelayedRequest>().siteRelay;
        if (!relay) {
            // Only reachable when a route forgets the guard.
            throw new UnauthorizedException(
                "This request must come from the business's website.",
            );
        }
        return relay;
    },
);

/**
 * The address a limit counts, hashed: the relayed visitor's when the relay
 * checks, else the caller's own. For the public reads saroh.app's server
 * makes on a visitor's behalf (the shop, G11; the booking page's header, E6):
 * a relay that doesn't check — forged, stale, or no secret here — counts the
 * caller instead, so forging it buys nothing.
 */
export function visitorKey(
    ip: string | undefined,
    relay: string | undefined,
    secret: () => string = siteRelaySecret,
): string | undefined {
    if (relay) {
        const checked = relayOrNull(relay, secret);
        if (checked) return checked.clientHash;
    }
    return hashClientIp(ip);
}

function relayOrNull(relay: string, secret: () => string): SiteRelay | null {
    try {
        return verifySiteRelay(relay, secret());
    } catch {
        // No secret configured on this instance: count the caller instead.
        return null;
    }
}
