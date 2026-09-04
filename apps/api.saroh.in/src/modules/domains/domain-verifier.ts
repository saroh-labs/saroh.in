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
 *
 * A failed check says WHY (#200). "No record", "wrong value" and "could not
 * look it up" have three different fixes — wait, re-copy, check the domain
 * exists — and a screen that can only say "not verified" leaves the merchant
 * guessing which one they are in.
 */

/** Why a check did not pass. Stored on the domain and shown to the merchant. */
export type VerificationFailure = "NO_RECORD" | "WRONG_VALUE" | "LOOKUP_FAILED";

export type VerificationOutcome =
    { ok: true } | { ok: false; reason: VerificationFailure };

export interface DomainVerifier {
    /**
     * Resolve the verification record(s) for `hostname` and report whether any
     * carries `expectedToken`, or why not. Must never throw: NXDOMAIN, timeout
     * and "no TXT record" all resolve to a failure with a reason, so a
     * still-unverified domain simply stays PENDING.
     */
    verify(
        hostname: string,
        expectedToken: string,
    ): Promise<VerificationOutcome>;
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

type LookupResult = "MATCH" | VerificationFailure;

/**
 * Real DNS_TXT verifier. Checks the dedicated `_saroh-verification.<hostname>`
 * TXT record, then the apex `<hostname>` TXT record, for one whose joined value
 * contains `expectedToken`. Any resolution error resolves to a failure reason,
 * never a throw.
 */
export class DnsTxtDomainVerifier implements DomainVerifier {
    private readonly logger = new Logger(DnsTxtDomainVerifier.name);

    async verify(
        hostname: string,
        expectedToken: string,
    ): Promise<VerificationOutcome> {
        const candidates = [verificationRecordName(hostname), hostname];
        const results: VerificationFailure[] = [];
        for (const name of candidates) {
            const result = await this.lookup(name, expectedToken);
            if (result === "MATCH") return { ok: true };
            results.push(result);
        }
        // The most actionable reason wins: a record that exists with the wrong
        // value beats "nothing there", and a lookup that could not complete
        // beats both — the merchant cannot fix a record we could not read.
        const reason: VerificationFailure = results.includes("LOOKUP_FAILED")
            ? "LOOKUP_FAILED"
            : results.includes("WRONG_VALUE")
              ? "WRONG_VALUE"
              : "NO_RECORD";
        return { ok: false, reason };
    }

    private async lookup(
        name: string,
        expectedToken: string,
    ): Promise<LookupResult> {
        try {
            // resolveTxt returns string[][]: each record is an array of chunks
            // that must be joined before comparison.
            const records = await resolveTxt(name);
            if (records.length === 0) return "NO_RECORD";
            return records.some((chunks) =>
                chunks.join("").includes(expectedToken),
            )
                ? "MATCH"
                : "WRONG_VALUE";
        } catch (err) {
            const code = (err as { code?: string }).code;
            this.logger.debug(
                `TXT lookup for "${name}" failed: ${(err as Error).message}`,
            );
            // ENOTFOUND: the name does not exist; ENODATA: it exists with no
            // TXT record. Both mean "nothing to read yet". Anything else —
            // timeout, SERVFAIL, refused — is DNS not answering.
            return code === "ENOTFOUND" || code === "ENODATA"
                ? "NO_RECORD"
                : "LOOKUP_FAILED";
        }
    }
}

/**
 * Deterministic verifier for tests/dev. Defaults to failing (a fresh claim is
 * unverified) with reason NO_RECORD. Toggle `shouldPass`, set a failure reason,
 * or install per-hostname answers, to drive the claim → verify lifecycle
 * without touching DNS or the network.
 */
export class FakeDomainVerifier implements DomainVerifier {
    private shouldPass: boolean;
    private failure: VerificationFailure = "NO_RECORD";
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

    /** Set why a failing check fails. */
    setFailure(reason: VerificationFailure): void {
        this.failure = reason;
    }

    /** Override the answer for a single hostname. */
    setHostname(hostname: string, pass: boolean): void {
        this.byHostname.set(hostname, pass);
    }

    verify(
        hostname: string,
        expectedToken: string,
    ): Promise<VerificationOutcome> {
        this.calls.push({ hostname, expectedToken });
        const override = this.byHostname.get(hostname);
        const answer = override ?? this.shouldPass;
        return Promise.resolve(
            answer ? { ok: true } : { ok: false, reason: this.failure },
        );
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
