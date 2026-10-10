"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import { showError, showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { PausedNote } from "@/components/billing/paused-banner";
import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { pausedWords } from "@/lib/billing/paused";
import { useTabParam } from "@/lib/hooks/use-tab-param";
import type { SiteSelling } from "@/lib/sites/sells-from";
import { newStorefrontHref } from "@/lib/stores/links";
import type { LocationDetails } from "@/lib/stores/location-details";
import type { LocationTab } from "@/lib/stores/location-readiness";
import {
    LOCATION_SECTIONS,
    LOCATION_TAB_PARAM,
    locationReadiness,
    locationSubtitle,
} from "@/lib/stores/location-readiness";
import type { LocationPeople } from "@/lib/stores/people";
import { placeSheetFor, placeSheetToOpen } from "@/lib/stores/place-rows";
import { updateStorefront } from "@/lib/stores/storefront-actions";
import type {
    StorefrontSettings,
    StorefrontSummary,
} from "@/lib/stores/storefronts";

import { ClosingSection } from "./closing-section";
import { FulfilmentSection } from "./fulfilment-section";
import { LocationReadinessCard } from "./location-readiness-card";
import type { Saver } from "./location-save";
import { jumpTo } from "./location-save";
import {
    LOCATION_PANEL_ID,
    LocationTabs,
    locationTabId,
} from "./location-tabs";
import { PaymentsSection } from "./payments-section";
import { PeopleSection } from "./people-section";
import { PlaceSection } from "./place-section";
import { SameEmailSection } from "./same-email-section";
import { StorefrontList } from "./storefront-list";
import { usePlaceSheets } from "./use-place-sheets";

/**
 * Sell › Location: one location's own page, titled with its name, with what
 * it still needs to take orders at the top, then its parts by job: The
 * place, Payments, Delivery, Customers, People, and Pause or close last
 * (the 9 Oct audit; People joined them on 10 Oct). With several locations, the list of them sits on the left and
 * each one is the same page. A location is a storefront in code and in the
 * API (DEC-069 renamed the words, not the identifiers).
 *
 * Every control saves on its own (a switch when it is flipped, a row's
 * sheet when its Save is pressed), so there is no page-wide save to forget.
 */
export function StorefrontsScreen({
    businessName,
    storefronts,
    selected,
    details,
    people = null,
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
    /**
     * The chosen location's description and logo, for their row in The
     * place; left out when they couldn't be read, and so is the row.
     */
    details?: LocationDetails;
    /** Who works at the chosen location; `null` when it couldn't be read. */
    people?: LocationPeople | null;
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
                            details={details}
                            people={people}
                            businessName={businessName}
                            site={site}
                            canEdit={canEdit}
                            canClose={canClose}
                            canLinkCustomers={canEdit && canLinkCustomers}
                            notTakingOrders={notTakingOrders.includes(
                                selected.id,
                            )}
                            beside={many}
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

function StorefrontDetail({
    store: initial,
    details,
    people,
    businessName,
    site,
    canEdit,
    canClose,
    canLinkCustomers,
    notTakingOrders,
    beside,
}: {
    store: StorefrontSettings;
    details: LocationDetails | undefined;
    people: LocationPeople | null;
    businessName: string;
    site: SiteSelling | null | undefined;
    canEdit: boolean;
    canClose: boolean;
    canLinkCustomers: boolean;
    notTakingOrders: boolean;
    /** The list of locations is drawn beside this one. */
    beside: boolean;
}) {
    const router = useRouter();
    const [store, setStore] = useState(initial);
    const [pending, startTransition] = useTransition();

    /**
     * One save path for every control. The page shows what the API
     * returned, not what was asked for, so a value the server normalised
     * ("18" → "18.00") or refused is what the merchant sees afterwards.
     */
    const save: Saver = (input, said, onFail, inline, onSaved) => {
        startTransition(async () => {
            const res = await updateStorefront(store.id, input);
            if (!res.ok) {
                onFail?.();
                if (inline) inline(res.error);
                else showError(res.error);
                return;
            }
            setStore(res.data);
            onSaved?.();
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

    // The open tab lives in the address (`?section=delivery`), as Settings ›
    // Business keeps its own, so a link opens it and Back returns to the
    // last one. Customers shows only where the API sends its setting; Pause
    // or close only to someone who may do either.
    const closes = canClose || canEdit;
    const tabs = [
        LOCATION_SECTIONS.place,
        LOCATION_SECTIONS.payments,
        LOCATION_SECTIONS.delivery,
        ...(store.linkSameEmailCustomers !== undefined
            ? [LOCATION_SECTIONS.customers]
            : []),
        LOCATION_SECTIONS.people,
        ...(closes ? [LOCATION_SECTIONS.closing] : []),
    ];
    const [tab, setTab] = useTabParam<LocationTab>(
        LOCATION_TAB_PARAM,
        tabs.map((t) => t.id),
        "the-place",
        { history: "push" },
    );
    // The place's Edit sheets: which one is open is kept here, so the
    // readiness card and Delivery can open one from outside its tab.
    const sheets = usePlaceSheets(
        (which) =>
            placeSheetToOpen(which, {
                canEdit,
                kind: store.kind,
                hasDetails: Boolean(details),
            }),
        tab === "the-place",
    );
    // A field to put the keyboard on once its tab has drawn.
    const focusNext = useRef<string | null>(null);
    const [jumps, setJumps] = useState(0);
    useEffect(() => {
        const id = focusNext.current;
        if (!id) return;
        focusNext.current = null;
        jumpTo(id);
    }, [jumps, tab]);
    const goTo = (to: LocationTab, focus?: string) => {
        // One of The place's fields ("Add address", "Set hours"): its
        // sheet opens there, and the keyboard starts in it.
        const sheet = to === "the-place" ? placeSheetFor(focus) : null;
        if (sheet) {
            setTab(to);
            sheets.open(sheet);
            return;
        }
        focusNext.current = focus ?? LOCATION_PANEL_ID;
        setTab(to);
        setJumps((n) => n + 1);
    };

    const shared = { store, canEdit, pending, save, setStore, goTo };

    const readiness = locationReadiness(store, site, { notTakingOrders });
    const wide = beside ? WIDE_BESIDE_LIST : WIDE_ALONE;

    // One column: notes, what's left to do, the tabs. On a wide screen the
    // "what's left" card moves to the right of the tabs and stays in view
    // while a tab is worked through, so the page uses its width (owner,
    // 10 Oct 2026). It stays first for the keyboard either way.
    return (
        <div
            className={cn(
                "flex min-w-0 max-w-[760px] flex-1 flex-col gap-4",
                wide.frame,
            )}
        >
            {readiness.total > 0 ? (
                <div className={cn("order-2 min-w-0", wide.aside)}>
                    <LocationReadinessCard
                        readiness={readiness}
                        canEdit={canEdit}
                        onJump={goTo}
                    />
                </div>
            ) : null}
            <div className={cn("contents", wide.main)}>
                {notTakingOrders ? (
                    <div className="order-1">
                        <PausedNote>{pausedWords("location")}</PausedNote>
                    </div>
                ) : null}
                {!canEdit ? (
                    <div className="order-1">
                        <ReadOnlyNote className="mb-0" />
                    </div>
                ) : null}
                <div className="order-3 min-w-0">
                    <LocationTabs tabs={tabs} tab={tab} onChange={setTab} />
                </div>
                <div
                    id={LOCATION_PANEL_ID}
                    role="tabpanel"
                    aria-labelledby={locationTabId(tab)}
                    className="order-4 min-w-0 outline-none"
                >
                    {tab === "the-place" ? (
                        <PlaceSection
                            {...shared}
                            details={details}
                            sheets={sheets}
                        />
                    ) : null}
                    {tab === "payments" ? (
                        <PaymentsSection {...shared} />
                    ) : null}
                    {tab === "delivery" ? (
                        <FulfilmentSection {...shared} />
                    ) : null}
                    {tab === "customers" ? (
                        <SameEmailSection
                            store={store}
                            canEdit={canLinkCustomers}
                            pending={pending}
                            save={save}
                            setStore={setStore}
                        />
                    ) : null}
                    {tab === "people" ? (
                        <PeopleSection store={store} people={people} />
                    ) : null}
                    {tab === "pause-or-close" && closes ? (
                        <ClosingSection
                            {...shared}
                            businessName={businessName}
                            canClose={canClose}
                        />
                    ) : null}
                </div>
            </div>
        </div>
    );
}

/**
 * Where the "what's left" card sits beside the tabs: from 1440px when the
 * location has the page to itself, and from 1760px when the list of
 * locations is beside it. Whole class names, so Tailwind finds them.
 */
const WIDE_ALONE = {
    frame: "min-[1440px]:max-w-none min-[1440px]:flex-row min-[1440px]:items-start min-[1440px]:gap-8",
    main: "min-[1440px]:flex min-[1440px]:min-w-0 min-[1440px]:max-w-[1040px] min-[1440px]:flex-1 min-[1440px]:flex-col min-[1440px]:gap-4",
    aside: "min-[1440px]:sticky min-[1440px]:top-6 min-[1440px]:order-last min-[1440px]:w-[400px] min-[1440px]:shrink-0",
};
const WIDE_BESIDE_LIST = {
    frame: "min-[1760px]:max-w-none min-[1760px]:flex-row min-[1760px]:items-start min-[1760px]:gap-8",
    main: "min-[1760px]:flex min-[1760px]:min-w-0 min-[1760px]:max-w-[1040px] min-[1760px]:flex-1 min-[1760px]:flex-col min-[1760px]:gap-4",
    aside: "min-[1760px]:sticky min-[1760px]:top-6 min-[1760px]:order-last min-[1760px]:w-[400px] min-[1760px]:shrink-0",
};
