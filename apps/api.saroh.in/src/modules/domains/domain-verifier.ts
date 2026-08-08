import type { Provider } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import { resolveTxt } from "node:dns/promises";

/**
 * Domain-verification port (S2-007).
 *
 * A `DomainVerifier` answers one question: does `hostname` currently prove
 * control by the org that claimed it, by exposing `expectedToken`? It is a
 * narrow, swappable interface so the ownership check is (a) trivially testable
 * with the {@link FakeDomainVerifier} and (b) replaceable (DNS TXT today, an
 * HTTP well-known file or a registrar API tomorrow) without touching the
 * service. Verification is ALWAYS performed server-side against real DNS — the
 * client never asserts it.
 */
export interface DomainVerifier {
    /**
     * Resolve the verification record(s) for `hostname` and report whether any
     * carries `expectedToken`. Must resolve to `false` (never throw) on lookup
     * failure — NXDOMAIN, timeout, no TXT record — so a still-unverified domain
     * simply stays PENDING.
     */
    verify(hostname: string, expectedToken: string): Promise<boolean>;
}

/** DI token for the {@link DomainVerifier} port. */
export const DOMAIN_VERIFIER = Symbol("DOMAIN_VERIFIER");

/**
 * The TXT record host prefix an org publishes to prove control. For a claimed
 * `hostname` we look up `_saroh-verification.<hostname>` first (the conventional
 * dedicated record), then fall back to a TXT on the apex `<hostname>` itself so
 * either placement verifies.
 */
export const VERIFICATION_TXT_PREFIX = "_saroh-verification";

/** The DNS TXT record name the org must create for `hostname`. */
export function verificationRecordName(hostname: string): string {
    return `${VERIFICATION_TXT_PREFIX}.${hostname}`;
}

/**
 * Real DNS_TXT verifier. Checks the dedicated `_saroh-verification.<hostname>`
 * TXT record, then the apex `<hostname>` TXT record, for one whose joined value
 * contains `expectedToken`. Any resolution error resolves to `false`.
 */
export class DnsTxtDomainVerifier implements DomainVerifier {
    private readonly logger = new Logger(DnsTxtDomainVerifier.name);

    async verify(hostname: string, expectedToken: string): Promise<boolean> {
        const candidates = [verificationRecordName(hostname), hostname];
        for (const name of candidates) {
            if (await this.recordContains(name, expectedToken)) {
                return true;
            }
        }
        return false;
    }

    private async recordContains(
        name: string,
        expectedToken: string,
    ): Promise<boolean> {
        try {
            // resolveTxt returns string[][]: each record is an array of chunks
            // that must be joined before comparison.
            const records = await resolveTxt(name);
            return records.some((chunks) =>
                chunks.join("").includes(expectedToken),
            );
        } catch (err) {
            // NXDOMAIN / ENODATA / timeout → simply "not verified yet".
            this.logger.debug(
                `TXT lookup for "${name}" failed: ${(err as Error).message}`,
            );
            return false;
        }
    }
}

/**
 * Deterministic verifier for tests/dev. Defaults to failing (a fresh claim is
 * unverified). Toggle `shouldPass`, or install per-hostname/per-token answers,
 * to drive the claim → verify lifecycle without touching DNS or the network.
 */
export class FakeDomainVerifier implements DomainVerifier {
    private shouldPass: boolean;
    /** Optional per-hostname override of `shouldPass`. */
    private readonly byHostname = new Map<string, boolean>();
    /** Records the tokens it was asked to verify, for assertions. */
    readonly calls: { hostname: string; expectedToken: string }[] = [];

    constructor(shouldPass = false) {
        this.shouldPass = shouldPass;
    }

    /** Set the default answer for every hostname. */
    setShouldPass(pass: boolean): void {
        this.shouldPass = pass;
    }

    /** Override the answer for a single hostname. */
    setHostname(hostname: string, pass: boolean): void {
        this.byHostname.set(hostname, pass);
    }

    verify(hostname: string, expectedToken: string): Promise<boolean> {
        this.calls.push({ hostname, expectedToken });
        const override = this.byHostname.get(hostname);
        const answer = override ?? this.shouldPass;
        return Promise.resolve(answer);
    }
}

/**
 * Nest provider exposing the {@link DomainVerifier} under {@link DOMAIN_VERIFIER}.
 * Defaults to the real DNS_TXT verifier; tests inject a {@link FakeDomainVerifier}
 * by constructing the service directly with one.
 */
export const domainVerifierProvider: Provider = {
    provide: DOMAIN_VERIFIER,
    useFactory: (): DomainVerifier => new DnsTxtDomainVerifier(),
};
