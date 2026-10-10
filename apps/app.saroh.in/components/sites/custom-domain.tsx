"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { showError, showInfo, showSuccess, showWarning } from "@saroh/ui/toast";
import { useEffect, useState } from "react";

import { useBusinessZone } from "@/components/shared/business-zone";
import { AddDomainDialog } from "@/components/sites/add-domain-dialog";
import { DomainRecords } from "@/components/sites/domain-records";
import type { SheetControl } from "@/components/sites/settings/settings-sheet";
import { useSheetControl } from "@/components/sites/settings/settings-sheet";
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
import type { SiteDomain } from "@/lib/domains/service";
import { exactDate } from "@/lib/sites/format-date";
import { SETTINGS_ROW_ID, settingsEditId } from "@/lib/sites/settings-edit";

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
 *
 * Read first (owner, 10 Oct): the domains are cards, and one "Add domain"
 * button under them opens the dialog that takes the hostname and then shows
 * its records (`add-domain-dialog.tsx`). No field sits open on the page.
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
    id,
}: {
    children: React.ReactNode;
    /** The hostname a domain's block is for (a handle for browser specs). */
    domain?: string;
    id?: string;
}) {
    return (
        <div id={id} className="space-y-3 px-4 py-3" data-domain={domain}>
            {children}
        </div>
    );
}

export function CustomDomain({
    siteId,
    sheet,
}: {
    siteId: string;
    /** The screen's own, so a link can open Add domain; ours when left out. */
    sheet?: SheetControl;
}) {
    const zone = useBusinessZone();
    const [domains, setDomains] = useState<SiteDomain[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const own = useSheetControl();
    const adding = sheet ?? own;
    // The domain the open dialog added: it shows that one's records next.
    const [added, setAdded] = useState<{ id: string; opened: number } | null>(
        null,
    );
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

    async function claim(hostname: string) {
        const res = await claimDomain(siteId, hostname);
        // The api's own words, said in the dialog under what was typed.
        if (!res.ok) return { ok: false as const, error: res.error };
        setDomains((prev) => [res.data, ...(prev ?? [])]);
        setAdded({ id: res.data.id, opened: adding.opened });
        showSuccess(
            `${res.data.hostname} added. Now add the record below at your registrar.`,
        );
        return { ok: true as const };
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

    // The dialog's second step, from the list, so a check there shows here.
    const addedDomain =
        added?.opened === adding.opened
            ? domains.find((d) => d.id === added.id)
            : undefined;
    const addedNow = addedDomain
        ? {
              domain: addedDomain,
              view: domainView(addedDomain, CNAME_TARGET),
              line: checkLine(addedDomain, zone),
          }
        : null;

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
                                        data-ph-mask=""
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

            <Block id={SETTINGS_ROW_ID.domain}>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <p className="min-w-0 text-sm text-muted-foreground">
                        {domains.length === 0
                            ? "No domain of your own yet."
                            : "Add another domain for this site."}
                    </p>
                    <Button
                        id={settingsEditId("domain")}
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-haspopup="dialog"
                        onClick={adding.show}
                    >
                        Add domain
                    </Button>
                </div>
            </Block>

            {adding.opened > 0 ? (
                <AddDomainDialog
                    key={adding.opened}
                    open={adding.open}
                    first={domains.length === 0}
                    added={addedNow}
                    checking={busy === addedNow?.domain.id}
                    onClaim={claim}
                    onCheck={(domain) => void check(domain)}
                    onClose={adding.close}
                />
            ) : null}
        </>
    );
}
