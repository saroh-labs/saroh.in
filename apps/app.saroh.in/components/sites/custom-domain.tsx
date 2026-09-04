"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { env } from "@/env";
import {
    claimDomain,
    listSiteDomains,
    removeDomain,
    verifyDomain,
} from "@/lib/domains/actions";
import type { DomainCheckFailure, SiteDomain } from "@/lib/domains/service";
import { exactDate, shortDate } from "@/lib/sites/format-date";

/**
 * A merchant's own domain, on the site settings screen (#200).
 *
 * The api has been able to claim, verify and route a hostname since S2-007;
 * this is the screen that was never built, and until now the settings copy
 * promised a control that did not exist.
 *
 * The hard part is the waiting. DNS is the one place in this product where the
 * merchant must go and do something in a system we do not control, then come
 * back — so the record is shown as something to COPY, exactly as a registrar
 * wants it; the state shown is the api's, never optimistic; checking is an
 * action they can take, and it says when it last ran and which check failed,
 * because "no record yet", "wrong value" and "could not look it up" have three
 * different fixes.
 */

/** Where a verified domain points. Configurable per deployment. */
const CNAME_TARGET = env.NEXT_PUBLIC_CUSTOM_DOMAIN_TARGET ?? "saroh.app";

/*
 * `status` and `lastCheckResult` are free-form strings on the wire. These
 * narrow them without claiming the wire can only carry the known values: an
 * unknown one reads as "not verified" and as the default explanation, which is
 * the safe direction — a state we do not recognise must never render as
 * connected.
 *
 * They live in this client component rather than beside the fetchers: that
 * module reads the session through `next/headers`, so importing a VALUE from
 * it here would pull server-only code into the browser bundle. Types are free;
 * functions are not.
 */
function isVerified(status: string): boolean {
    return status === "VERIFIED";
}

function checkFailure(result: string | null): DomainCheckFailure | null {
    return result === "NO_RECORD" ||
        result === "WRONG_VALUE" ||
        result === "LOOKUP_FAILED"
        ? result
        : null;
}

async function copy(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

function CopyField({ label, value }: { label: string; value: string }) {
    return (
        <div className="grid gap-1 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:items-center sm:gap-x-3">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {label}
            </span>
            <code
                className="min-w-0 truncate rounded border bg-muted/40 px-2 py-1 text-xs"
                title={value}
            >
                {value}
            </code>
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 justify-self-start text-xs sm:justify-self-end"
                onClick={() =>
                    void copy(value).then((ok) =>
                        ok
                            ? toast.success(`${label} copied.`)
                            : toast.error(
                                  "Could not copy. Select the text and copy it yourself.",
                              ),
                    )
                }
            >
                Copy
            </Button>
        </div>
    );
}

/** What the last check means for the merchant, and what to do next. */
function lastCheckLine(domain: SiteDomain): string {
    if (!domain.lastCheckedAt) {
        return "Not checked yet. Add the record, then check.";
    }
    const when = shortDate(domain.lastCheckedAt);
    switch (checkFailure(domain.lastCheckResult)) {
        case "WRONG_VALUE":
            return `Checked ${when}: a record exists, but its value does not match. Copy the value again, exactly, and replace what is there.`;
        case "LOOKUP_FAILED":
            return `Checked ${when}: DNS for this domain did not answer. Check the domain is registered and its nameservers are set, then try again.`;
        case "NO_RECORD":
        case null:
        default:
            return `Checked ${when}: no record found yet. A new DNS record can take up to 48 hours to spread; check again later.`;
    }
}

function Block({ children }: { children: React.ReactNode }) {
    return <div className="space-y-3 px-4 py-3">{children}</div>;
}

export function CustomDomain({ siteId }: { siteId: string }) {
    const [domains, setDomains] = useState<SiteDomain[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [hostname, setHostname] = useState("");
    const [formError, setFormError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        listSiteDomains(siteId)
            .then((rows) => {
                if (!cancelled) setDomains(rows);
            })
            .catch(() => {
                if (!cancelled) {
                    setDomains([]);
                    setLoadError(
                        "Could not load your domains. Reload to try again.",
                    );
                }
            });
        return () => {
            cancelled = true;
        };
    }, [siteId]);

    async function add() {
        const value = hostname.trim().toLowerCase();
        if (!value) return;
        setBusy("add");
        setFormError(null);
        const res = await claimDomain(siteId, value);
        setBusy(null);
        if (!res.ok) {
            // The api's own words: a taken hostname (409), a plan without
            // custom domains (403), a malformed name (400). Each says what to
            // do; none is worth rewriting into something vaguer.
            setFormError(res.error);
            return;
        }
        setDomains((prev) => [res.data, ...(prev ?? [])]);
        setHostname("");
        toast.success(
            `${res.data.hostname} added. Now add the record below at your registrar.`,
        );
    }

    async function check(domain: SiteDomain) {
        setBusy(domain.id);
        const res = await verifyDomain(domain.id);
        setBusy(null);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        setDomains((prev) =>
            (prev ?? []).map((d) =>
                d.id === domain.id ? { ...d, ...res.data.domain } : d,
            ),
        );
        if (res.data.verified) {
            toast.success(`${domain.hostname} is verified.`);
        } else {
            toast.message("Not verified yet.", {
                description: lastCheckLine({
                    ...domain,
                    ...res.data.domain,
                }),
            });
        }
    }

    async function remove(domain: SiteDomain) {
        setBusy(domain.id);
        const res = await removeDomain(domain.id);
        setBusy(null);
        setConfirmRemove(null);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        setDomains((prev) => (prev ?? []).filter((d) => d.id !== domain.id));
        toast.success(`${domain.hostname} removed.`);
    }

    if (domains === null) {
        return (
            <Block>
                <p className="text-sm text-muted-foreground">
                    Checking your domains…
                </p>
            </Block>
        );
    }

    return (
        <>
            {loadError ? (
                <Block>
                    <p className="text-sm text-destructive">{loadError}</p>
                </Block>
            ) : null}

            {domains.map((domain) => {
                const verified = isVerified(domain.status);
                return (
                    <Block key={domain.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-sm font-medium">
                                    {domain.hostname}
                                </span>
                                {/* The api's state, never optimistic: PENDING
                                    is never drawn as connected. */}
                                {verified ? (
                                    <Badge
                                        className="bg-success text-success-foreground"
                                        title={
                                            domain.verifiedAt
                                                ? `Verified ${exactDate(domain.verifiedAt)}`
                                                : undefined
                                        }
                                    >
                                        Verified
                                    </Badge>
                                ) : (
                                    <Badge variant="outline">
                                        Waiting for DNS
                                    </Badge>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {verified ? null : (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={busy === domain.id}
                                        onClick={() => void check(domain)}
                                    >
                                        {busy === domain.id
                                            ? "Checking…"
                                            : "Check now"}
                                    </Button>
                                )}
                                {confirmRemove === domain.id ? null : (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        disabled={busy === domain.id}
                                        onClick={() =>
                                            setConfirmRemove(domain.id)
                                        }
                                    >
                                        Remove
                                    </Button>
                                )}
                            </div>
                        </div>

                        {verified ? (
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground">
                                    You own this domain. To send visitors to
                                    your site, add this record at your
                                    registrar:
                                </p>
                                <CopyField label="Type" value="CNAME" />
                                <CopyField
                                    label="Name"
                                    value={domain.hostname}
                                />
                                <CopyField label="Value" value={CNAME_TARGET} />
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground">
                                    Add this record at your registrar to prove
                                    you own the domain. Copy each part exactly.
                                </p>
                                <CopyField
                                    label="Type"
                                    value={domain.dnsRecord.type}
                                />
                                <CopyField
                                    label="Name"
                                    value={domain.dnsRecord.name}
                                />
                                <CopyField
                                    label="Value"
                                    value={domain.dnsRecord.value}
                                />
                                <p
                                    className="text-xs text-muted-foreground"
                                    title={
                                        domain.lastCheckedAt
                                            ? exactDate(domain.lastCheckedAt)
                                            : undefined
                                    }
                                >
                                    {lastCheckLine(domain)}
                                </p>
                            </div>
                        )}

                        {confirmRemove === domain.id ? (
                            <div className="rounded-md border p-3 text-sm">
                                {/* Removing states what happens to traffic —
                                    which is nothing for a pending domain, and
                                    an outage for a verified one. */}
                                <p className="text-muted-foreground">
                                    {verified
                                        ? `Visitors to ${domain.hostname} will stop reaching your site and see an error until you point the domain somewhere else. Your Saroh address keeps working.`
                                        : `Nothing changes for visitors: ${domain.hostname} is not serving your site yet. You can add it again later; the record will be different.`}
                                </p>
                                <div className="mt-2 flex gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="destructive"
                                        disabled={busy === domain.id}
                                        onClick={() => void remove(domain)}
                                    >
                                        {busy === domain.id
                                            ? "Removing…"
                                            : `Remove ${domain.hostname}`}
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setConfirmRemove(null)}
                                    >
                                        Keep it
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                    </Block>
                );
            })}

            <Block>
                <form
                    className="flex flex-wrap items-start gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void add();
                    }}
                >
                    <div className="min-w-0 flex-1 space-y-1">
                        <Input
                            value={hostname}
                            onChange={(e) => {
                                setHostname(e.target.value);
                                if (formError) setFormError(null);
                            }}
                            placeholder="shop.example.com"
                            aria-label="Domain to add"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                        />
                        {formError ? (
                            <p className="text-xs text-destructive">
                                {formError}
                            </p>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                {domains.length === 0
                                    ? "A domain you already own, without https://."
                                    : "Add another domain for this site."}
                            </p>
                        )}
                    </div>
                    <Button
                        type="submit"
                        size="sm"
                        variant="brand"
                        disabled={busy === "add" || hostname.trim() === ""}
                    >
                        {busy === "add" ? "Adding…" : "Add domain"}
                    </Button>
                </form>
            </Block>
        </>
    );
}
