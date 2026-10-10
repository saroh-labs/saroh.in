"use client";

import { Button } from "@saroh/ui/button";
import { ExternalLink } from "lucide-react";
import { useState } from "react";

import type {
    WebAddressRead,
    WebAddressView,
} from "@/lib/organizations/web-address";
import {
    addressHost,
    hostOf,
    previousLine,
    suffixOf,
} from "@/lib/organizations/web-address";

import { QrButton } from "@/components/qr/qr-button";
import { WebAddressDialog } from "./web-address-dialog";

/**
 * Settings › Business › Identity: the business's web address (DEC-069, L4),
 * the one place it is shown whole and changed. A card like the Business
 * cards beside it, read first:
 *
 * - "rye.saroh.app · Open" — Open only while the site is live;
 * - with a verified custom domain, "Customers see shop.rye.in;
 *   rye.saroh.app still works";
 * - each old address still held, and until when it forwards.
 *
 * Change is the owner's, and only while changing is rolled out for the
 * business (`canChange`). Anyone else who can see it reads "Only the owner
 * can change this." — said only while it is rolled out, so nobody is told
 * the owner can do what nobody can (DEC-057: an unavailable action is never
 * drawn, not even disabled).
 */
export function WebAddressSection({
    read,
    zone,
}: {
    read: WebAddressRead;
    /** The business's time zone, which a hold's last day is a day in. */
    zone: string;
}) {
    // An API older than the address read: nothing to show, said nowhere.
    if (!read.ok && read.missing) return null;
    return (
        <section
            id="web-address"
            aria-label="Web address"
            className="scroll-mt-24 overflow-hidden rounded-xl border border-border bg-card"
        >
            {read.ok ? (
                <Loaded view={read.data} zone={zone} />
            ) : (
                <>
                    <Header />
                    <p
                        role="status"
                        className="px-[18px] py-[11px] text-[13px] text-muted-foreground"
                    >
                        Couldn&apos;t load your web address. Reload the page to
                        try again.
                    </p>
                </>
            )}
        </section>
    );
}

function Header({ action }: { action?: React.ReactNode }) {
    return (
        <div className="flex min-h-[58px] flex-wrap items-center gap-2.5 border-b border-border/70 px-[18px] py-3">
            <h2 className="text-[13.5px] font-semibold">Web address</h2>
            <span className="text-[12.5px] text-muted-foreground">
                Where customers find you
            </span>
            {action}
        </div>
    );
}

function Loaded({ view, zone }: { view: WebAddressView; zone: string }) {
    const [open, setOpen] = useState(false);
    const suffix = suffixOf(view);
    const host = addressHost(view.address, suffix);
    const readOnly = view.changeAvailable && !view.canChange;

    return (
        <>
            <Header
                action={
                    view.canChange ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="ml-auto"
                            onClick={() => setOpen(true)}
                        >
                            Change
                        </Button>
                    ) : undefined
                }
            />
            <dl>
                <div className="grid grid-cols-[minmax(110px,170px)_minmax(0,1fr)] gap-x-4 gap-y-1 px-[18px] py-[11px]">
                    <dt className="text-[13px] text-muted-foreground">
                        Web address
                    </dt>
                    <dd className="grid min-w-0 gap-1">
                        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[13.5px]">
                            {view.customDomain ? (
                                <span className="[overflow-wrap:anywhere]">
                                    Customers see{" "}
                                    <span className="font-mono">
                                        {view.customDomain}
                                    </span>
                                    ;{" "}
                                    <span className="font-mono">
                                        {hostOf(view.platformOrigin)}
                                    </span>{" "}
                                    still works
                                </span>
                            ) : (
                                <span className="font-mono [overflow-wrap:anywhere]">
                                    {host}
                                </span>
                            )}
                            {view.links.site ? (
                                <>
                                    <span
                                        aria-hidden
                                        className="text-muted-foreground"
                                    >
                                        ·
                                    </span>
                                    <a
                                        href={view.links.site}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex cursor-pointer items-center gap-1 rounded-sm text-[13px] font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80 coarse:min-h-11"
                                    >
                                        Open
                                        <ExternalLink
                                            aria-hidden
                                            className="size-3.5"
                                        />
                                        <span className="sr-only">
                                            your website (opens in a new tab)
                                        </span>
                                    </a>
                                    <QrButton
                                        compact="always"
                                        variant="ghost"
                                        link={{
                                            mode: "saved",
                                            kind: "SITE",
                                            url: view.links.site,
                                            what: "your website",
                                            from: "Business settings",
                                        }}
                                    />
                                </>
                            ) : null}
                        </span>
                        {view.previous.length > 0 ? (
                            <ul
                                aria-label="Old web addresses"
                                className="grid gap-0.5 text-[12.5px] text-muted-foreground"
                            >
                                {view.previous.map((held) => (
                                    <li
                                        key={held.address}
                                        className="[overflow-wrap:anywhere]"
                                    >
                                        {previousLine(held, suffix, zone)}
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </dd>
                </div>
            </dl>
            {readOnly ? (
                <p className="border-t border-border/70 bg-muted/50 px-[18px] pb-3 pt-2.5 text-[12px] leading-normal text-muted-foreground">
                    Only the owner can change this.
                </p>
            ) : null}
            {view.canChange ? (
                <WebAddressDialog
                    open={open}
                    onOpenChange={setOpen}
                    view={view}
                    zone={zone}
                />
            ) : null}
        </>
    );
}
