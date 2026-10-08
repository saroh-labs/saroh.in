"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { showError, showInfo, showSuccess, showWarning } from "@saroh/ui/toast";
import { useEffect, useState } from "react";

import { useBusinessZone } from "@/components/shared/business-zone";
import { DomainRecords } from "@/components/sites/domain-records";
import { env } from "@/env";
import {
    claimDomain,
    listSiteDomains,
    removeDomain,
    verifyDomain,
} from "@/lib/domains/actions";
import {
    checkLine,
    checkToast,
    DEFAULT_CNAME_TARGET,
    domainView,
} from "@/lib/domains/domain-view";
import { bareHostname } from "@/lib/domains/hostname";
import type { SiteDomain } from "@/lib/domains/service";
import { exactDate } from "@/lib/sites/format-date";

/**
 * A merchant's own domain, on the site settings screen (#200, #861).
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
 *
 * Once verified, the api's hosting state (#859) says where it stands: not
 * pointed yet (the CNAME, "Visitors don't reach your site yet"), live ("Live
 * at ‹domain›", the records folded away) or a problem (the records again,
 * with what is wrong in words). Which is which is `lib/domains/domain-view.ts`;
 * an instance without hosting set up says what it said before, and never
 * "Live".
 */

/** Where a verified domain points when the api doesn't say. Per deployment. */
const CNAME_TARGET =
    env.NEXT_PUBLIC_CUSTOM_DOMAIN_TARGET ?? DEFAULT_CNAME_TARGET;

const TOAST = {
    success: showSuccess,
    info: showInfo,
    warning: showWarning,
} as const;

function Block({
    children,
    domain,
}: {
    children: React.ReactNode;
    /** The hostname a domain's block is for (a handle for browser specs). */
    domain?: string;
}) {
    return (
        <div className="space-y-3 px-4 py-3" data-domain={domain}>
            {children}
        </div>
    );
}

export function CustomDomain({ siteId }: { siteId: string }) {
    const zone = useBusinessZone();
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
        // A pasted https://…/ address is taken down to its domain (UX-066).
        const value = bareHostname(hostname);
        if (!value) return;
        setBusy("add");
        setFormError(null);
        const res = await claimDomain(siteId, value);
        setBusy(null);
        if (!res.ok) {
            // The api's own words: a taken hostname (409), a plan without
            // custom domains (403), a malformed name (400, plain since
            // UX-066). Each says what to do.
            setFormError(res.error);
            return;
        }
        setDomains((prev) => [res.data, ...(prev ?? [])]);
        setHostname("");
        showSuccess(
            `${res.data.hostname} added. Now add the record below at your registrar.`,
        );
    }

    async function check(domain: SiteDomain) {
        setBusy(domain.id);
        const res = await verifyDomain(domain.id);
        setBusy(null);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        const after = { ...domain, ...res.data.domain };
        setDomains((prev) =>
            (prev ?? []).map((d) => (d.id === domain.id ? after : d)),
        );
        const toast = checkToast(domain, after, zone);
        TOAST[toast.tone](toast.message, toast.description);
    }

    async function remove(domain: SiteDomain) {
        setBusy(domain.id);
        const res = await removeDomain(domain.id);
        setBusy(null);
        setConfirmRemove(null);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        setDomains((prev) => (prev ?? []).filter((d) => d.id !== domain.id));
        showSuccess(`${domain.hostname} removed.`);
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
                const view = domainView(domain, CNAME_TARGET);
                const line = checkLine(domain, zone);
                const lineAt =
                    view.scene === "waiting"
                        ? domain.lastCheckedAt
                        : (domain.hosting?.checkedAt ?? null);
                return (
                    <Block key={domain.id} domain={domain.hostname}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-sm font-medium">
                                    {domain.hostname}
                                </span>
                                {/* The api's state, never optimistic: PENDING
                                    is never drawn as connected, nor a
                                    verified domain as live unless the
                                    hosting says so. */}
                                <Badge
                                    variant={view.badge.variant}
                                    title={
                                        domain.verifiedAt
                                            ? `Verified ${exactDate(domain.verifiedAt, zone)}`
                                            : undefined
                                    }
                                >
                                    {view.badge.label}
                                </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                                {view.checkLabel ? (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={busy === domain.id}
                                        onClick={() => void check(domain)}
                                    >
                                        {busy === domain.id
                                            ? "Checking…"
                                            : view.checkLabel}
                                    </Button>
                                ) : null}
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

                        {view.liveUrl ? (
                            <p className="text-sm">
                                Live at{" "}
                                <a
                                    href={view.liveUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-medium underline underline-offset-2 [overflow-wrap:anywhere] hover:text-muted-foreground active:text-foreground"
                                >
                                    {domain.hostname}
                                </a>
                            </p>
                        ) : null}

                        {view.problem ? (
                            <p className="rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-foreground">
                                {view.problem}
                            </p>
                        ) : null}

                        <DomainRecords domain={domain} view={view} />

                        {line ? (
                            <p
                                className="text-xs text-muted-foreground"
                                title={
                                    lineAt ? exactDate(lineAt, zone) : undefined
                                }
                            >
                                {line}
                            </p>
                        ) : null}

                        {confirmRemove === domain.id ? (
                            <div className="rounded-md border p-3 text-sm">
                                {/* Removing states what happens to traffic —
                                    nothing for a domain that isn't serving,
                                    an outage for one that is. */}
                                <p className="text-muted-foreground">
                                    {view.removeWarning}
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
                                    ? "A domain you already own, like www.yourshop.in."
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
