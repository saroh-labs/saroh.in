import type {
    DomainHosting,
    HostedHostname,
    HostedProblem,
    HostedState,
} from "../domain-hosting";
import { HostingCallError } from "../domain-hosting";

/**
 * In-memory {@link DomainHosting} for tests (#859). Registers hostnames as
 * PENDING with ids `ch_<n>`, lets a test move one to ACTIVE or FAILED, and
 * can be told to fail the next calls of a kind — to drive "a failed
 * Cloudflare call keeps the verification" and the retry without a network.
 */
export class FakeDomainHosting implements DomainHosting {
    private next = 1;
    /** Registered hostnames by id. */
    readonly hostnames = new Map<
        string,
        HostedHostname & { hostname: string }
    >();
    /** Every call, in order, for assertions. */
    readonly calls: { op: "register" | "status" | "remove"; arg: string }[] =
        [];
    private readonly failing = new Map<
        "register" | "status" | "remove",
        HostingCallError
    >();

    /** Make every `op` call fail (REFUSED or UNKNOWN) until {@link heal}. */
    fail(
        op: "register" | "status" | "remove",
        kind: "REFUSED" | "UNKNOWN" = "UNKNOWN",
    ): void {
        this.failing.set(
            op,
            new HostingCallError(kind, kind === "REFUSED" ? 400 : 503),
        );
    }

    /** Stop failing `op` (or every op). */
    heal(op?: "register" | "status" | "remove"): void {
        if (op) this.failing.delete(op);
        else this.failing.clear();
    }

    /** Move a registered hostname, as Cloudflare would. */
    set(id: string, state: HostedState, problem: HostedProblem | null = null) {
        const found = this.hostnames.get(id);
        if (!found) throw new Error(`no hostname ${id}`);
        this.hostnames.set(id, { ...found, state, problem });
    }

    register(hostname: string): Promise<HostedHostname> {
        this.calls.push({ op: "register", arg: hostname });
        const failure = this.failing.get("register");
        if (failure) return Promise.reject(failure);
        for (const h of this.hostnames.values()) {
            if (h.hostname === hostname) return Promise.resolve(strip(h));
        }
        const id = `ch_${this.next++}`;
        const made = { id, hostname, state: "PENDING" as const, problem: null };
        this.hostnames.set(id, made);
        return Promise.resolve(strip(made));
    }

    status(id: string): Promise<HostedHostname | null> {
        this.calls.push({ op: "status", arg: id });
        const failure = this.failing.get("status");
        if (failure) return Promise.reject(failure);
        const found = this.hostnames.get(id);
        return Promise.resolve(found ? strip(found) : null);
    }

    remove(ref: { id: string | null; hostname: string }): Promise<void> {
        this.calls.push({ op: "remove", arg: ref.id ?? ref.hostname });
        const failure = this.failing.get("remove");
        if (failure) return Promise.reject(failure);
        for (const [id, h] of this.hostnames) {
            if (id === ref.id || h.hostname === ref.hostname) {
                this.hostnames.delete(id);
            }
        }
        return Promise.resolve();
    }
}

function strip(h: HostedHostname & { hostname: string }): HostedHostname {
    return { id: h.id, state: h.state, problem: h.problem };
}
