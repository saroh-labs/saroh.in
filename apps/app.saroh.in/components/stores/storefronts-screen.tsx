"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import { showError, showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PausedNote } from "@/components/billing/paused-banner";
import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { pausedWords } from "@/lib/billing/paused";
import type { SiteSelling } from "@/lib/sites/sells-from";
import { newStorefrontHref, storefrontHref } from "@/lib/stores/links";
import {
    LOCATION_SECTIONS,
    locationReadiness,
    locationSubtitle,
} from "@/lib/stores/location-readiness";
import { updateStorefront } from "@/lib/stores/storefront-actions";
import type {
    StorefrontKind,
    StorefrontSettings,
    StorefrontSummary,
} from "@/lib/stores/storefronts";

import { ClosingSection } from "./closing-section";
import { FulfilmentSection } from "./fulfilment-section";
import { LocationReadinessCard } from "./location-readiness-card";
import type { Saver } from "./location-save";
import { LocationSectionNav } from "./location-section-nav";
import { PaymentsSection } from "./payments-section";
import { PlaceSection } from "./place-section";
import { SameEmailSection } from "./same-email-section";

/**
 * The two kinds of location (DEC-069, KTD-12): the `SHOP` and `ONLINE` kinds
 * in the data, named for what they mean to the merchant.
 */
const KIND_LABEL: Record<StorefrontKind, string> = {
    SHOP: "Customers visit",
    ONLINE: "No counter",
};

const ordersLabel = (n: number) =>
    n === 0 ? "no orders yet" : n === 1 ? "1 order" : `${n} orders`;

/**
 * Sell › Location: one location's own page, titled with its name, with what
 * it still needs to take orders at the top, then its parts by job: The
 * place, Payments, Delivery, Customers, and Pause or close last (the 9 Oct
 * audit). With several locations, the list of them sits on the left and
 * each one is the same page. A location is a storefront in code and in the
 * API (DEC-069 renamed the words, not the identifiers).
 *
 * Every control saves on its own (a switch when it is flipped, a field when
 * its Save is pressed), so there is no page-wide save to forget.
 */
export function StorefrontsScreen({
    businessName,
    storefronts,
    selected,
    chosenId,
    site,
    canCreate,
    canEdit,
    canClose,
    canLinkCustomers = false,
    notTakingOrders = [],
}: {
    businessName: string;
    storefronts: StorefrontSummary[];
    /** `null` when the chosen storefront could not be read. */
    selected: StorefrontSettings | null;
    /** The one asked for, so a page that failed to read it still names it. */
    chosenId?: string;
    /**
     * The website each location's selling line reads (DEC-069): `null` for a
     * business with no website, `undefined` when it couldn't be read — then
     * no line is shown rather than a guess.
     */
    site?: SiteSelling | null;
    /** May make one, and the plan has room for another. */
    canCreate: boolean;
    canEdit: boolean;
    canClose: boolean;
    /** May change how customers who share an email are linked (C15). */
    canLinkCustomers?: boolean;
    /**
     * Past the plan's locations limit (#800): these stopped taking orders,
     * stock and history kept. Not the payments "Paused" switch.
     */
    notTakingOrders?: string[];
}) {
    const router = useRouter();
    // A business with one location sees "Location"; the list appears once
    // there are several (ADR-010), and New while the plan allows another
    // (`canCreate` carries that). The crumb keeps the word; the title is
    // the location's own name.
    const many = storefronts.length > 1;
    const word = many ? "Locations" : "Location";
    const chosen =
        storefronts.find((s) => s.id === (selected?.id ?? chosenId)) ??
        storefronts.at(0);
    const header = (
        <PageHeader
            breadcrumb={["Sell", word]}
            title={chosen?.name ?? word}
            description={selected ? locationSubtitle(selected) : undefined}
            actions={
                canCreate && storefronts.length > 0 ? (
                    <Button asChild variant="brand">
                        <Link href={newStorefrontHref}>New location</Link>
                    </Button>
                ) : undefined
            }
        />
    );

    if (storefronts.length === 0) {
        return (
            <>
                {header}
                <EmptyState
                    title="No location yet"
                    description={`${businessName} has Sell turned on but nowhere to sell from. A location is a place you sell from, like a shop counter, a studio or a market stall, and your online shop sells from one of them.`}
                    action={
                        canCreate ? (
                            <Button asChild variant="brand">
                                <Link href={newStorefrontHref}>
                                    Add a location
                                </Link>
                            </Button>
                        ) : undefined
                    }
                />
            </>
        );
    }

    return (
        <>
            {header}
            <div className="flex flex-wrap items-start gap-5">
                {many ? (
                    <StorefrontList
                        storefronts={storefronts}
                        selectedId={chosen?.id ?? null}
                        notTakingOrders={notTakingOrders}
                    />
                ) : null}
                <div className="flex min-w-0 flex-[1_1_420px] items-start gap-6">
                    {selected ? (
                        // Keyed by storefront, so picking another one starts
                        // from its own values rather than the last one's edits.
                        <StorefrontDetail
                            key={selected.id}
                            store={selected}
                            businessName={businessName}
                            site={site}
                            canEdit={canEdit}
                            canClose={canClose}
                            canLinkCustomers={canEdit && canLinkCustomers}
                            notTakingOrders={notTakingOrders.includes(
                                selected.id,
                            )}
                        />
                    ) : (
                        <div className="min-w-0 max-w-[760px] flex-1">
                            <FailedState
                                title="This location could not be loaded"
                                description="Its settings could not be read, so none are shown rather than guessed. Nothing has been changed."
                                action={
                                    <Button
                                        variant="outline"
                                        onClick={() => router.refresh()}
                                    >
                                        Try again
                                    </Button>
                                }
                            />
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

function StorefrontList({
    storefronts,
    selectedId,
    notTakingOrders,
}: {
    storefronts: StorefrontSummary[];
    selectedId: string | null;
    notTakingOrders: string[];
}) {
    return (
        <nav
            aria-label="Locations"
            className="min-w-0 max-w-[280px] flex-[0_1_236px] overflow-hidden rounded-xl border border-border bg-card max-sm:max-w-none max-sm:flex-[1_1_100%]"
        >
            <p className="border-b border-border px-[15px] py-[11px] text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {storefronts.length === 1
                    ? "1 location"
                    : `${storefronts.length} locations`}
            </p>
            <ul className="flex flex-col gap-0.5 p-1.5">
                {storefronts.map((s) => {
                    const on = s.id === selectedId;
                    return (
                        <li key={s.id}>
                            <Link
                                href={storefrontHref(s.id)}
                                scroll={false}
                                aria-current={on ? "page" : undefined}
                                className={cn(
                                    "flex min-h-11 items-center gap-[9px] rounded-lg px-[9px] py-[7px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    on
                                        ? "bg-muted"
                                        : "hover:bg-muted/60 active:bg-muted",
                                )}
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13.5px] font-medium">
                                        {s.name}
                                    </span>
                                    <span className="block text-[12px] text-muted-foreground">
                                        {ordersLabel(s.orderCount)}
                                    </span>
                                </span>
                                {notTakingOrders.includes(s.id) ? (
                                    // Past the plan's locations limit (#800).
                                    <Badge
                                        variant="warning"
                                        className="shrink-0"
                                    >
                                        Not taking orders
                                    </Badge>
                                ) : (
                                    <Badge
                                        variant={
                                            s.paused ? "warning" : "neutral"
                                        }
                                        className="shrink-0"
                                    >
                                        {s.paused
                                            ? "Paused"
                                            : KIND_LABEL[s.kind]}
                                    </Badge>
                                )}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}

function StorefrontDetail({
    store: initial,
    businessName,
    site,
    canEdit,
    canClose,
    canLinkCustomers,
    notTakingOrders,
}: {
    store: StorefrontSettings;
    businessName: string;
    site: SiteSelling | null | undefined;
    canEdit: boolean;
    canClose: boolean;
    canLinkCustomers: boolean;
    notTakingOrders: boolean;
}) {
    const router = useRouter();
    const [store, setStore] = useState(initial);
    const [pending, startTransition] = useTransition();

    /**
     * One save path for every control. The page shows what the API
     * returned, not what was asked for, so a value the server normalised
     * ("18" → "18.00") or refused is what the merchant sees afterwards.
     */
    const save: Saver = (input, said, onFail, inline) => {
        startTransition(async () => {
            const res = await updateStorefront(store.id, input);
            if (!res.ok) {
                onFail?.();
                if (inline) inline(res.error);
                else showError(res.error);
                return;
            }
            setStore(res.data);
            showSuccess(said);
            // The title, the line under it and the list on the left show
            // the name, the kind, the address and the pause.
            if (
                input.name !== undefined ||
                input.kind !== undefined ||
                input.address !== undefined ||
                input.paused !== undefined
            ) {
                router.refresh();
            }
        });
    };

    const shared = { store, canEdit, pending, save, setStore };
    const closes = canClose || canEdit;
    const sections = [
        LOCATION_SECTIONS.place,
        LOCATION_SECTIONS.payments,
        LOCATION_SECTIONS.delivery,
        ...(store.linkSameEmailCustomers !== undefined
            ? [LOCATION_SECTIONS.customers]
            : []),
        ...(closes ? [LOCATION_SECTIONS.closing] : []),
    ];

    return (
        <>
            <div className="flex min-w-0 max-w-[760px] flex-1 flex-col gap-4">
                {notTakingOrders ? (
                    <PausedNote>{pausedWords("location")}</PausedNote>
                ) : null}
                {!canEdit ? <ReadOnlyNote className="mb-0" /> : null}
                <LocationReadinessCard
                    readiness={locationReadiness(store, site, {
                        notTakingOrders,
                    })}
                    canEdit={canEdit}
                />
                <PlaceSection {...shared} site={site} />
                <PaymentsSection {...shared} />
                <FulfilmentSection {...shared} />
                <SameEmailSection
                    store={store}
                    canEdit={canLinkCustomers}
                    pending={pending}
                    save={save}
                    setStore={setStore}
                />
                {closes ? (
                    <ClosingSection
                        {...shared}
                        businessName={businessName}
                        canClose={canClose}
                    />
                ) : null}
            </div>
            <LocationSectionNav sections={sections} />
        </>
    );
}
