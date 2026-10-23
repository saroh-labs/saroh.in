"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { ListSearch } from "@saroh/ui/list-search";
import { Notice } from "@saroh/ui/notice";
import { PageHeader } from "@saroh/ui/page-header";
import { TextLink } from "@saroh/ui/text-link";
import { CalendarClock, ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { MissingRatesNotice } from "@/components/gst-rates/missing-rates-notice";
import { ListToolbar } from "@/components/shared/lists/list-toolbar";
import { ReadOnlyNote } from "@/components/shared/states/read-only-note";
import type { MissingRates } from "@/lib/gst-rates/missing";
import type { ModuleView } from "@/lib/modules/schema";
import type { AlsoSellFeature } from "@/lib/services/also-sell";
import type { BookingLinkView } from "@/lib/services/booking-link";
import { callName } from "@/lib/services/call-name";
import { onlineBookingProblem } from "@/lib/services/online-booking";
import type { Service } from "@/lib/services/service";
import type { WhoFields } from "@/lib/services/service-cards";
import {
    nobodyTakesLine,
    SEARCH_FROM,
    serviceLine,
    servicesCount,
    TAKING_LABEL,
    weekLine,
    whoCanBook,
} from "@/lib/services/service-cards";
import type { ServiceUsage } from "@/lib/services/usage";
import type { BookingPaymentView, StaffView } from "@/lib/staff/types";
import { AlsoSell } from "./also-sell";
import { BookingLinkRow } from "./booking-link-row";
import type { ServiceRowView } from "./services-rows";
import { ServicesPhoneList, ServicesTable } from "./services-rows";
import { useTakingBookings } from "./use-taking-bookings";

const NEW_SERVICE_HREF = "/services/new";
const NEW_COURSE_HREF = "/courses/new";

/** Shown at a phone's width only, and at a desk's only. */
const PHONE = "min-[760px]:hidden";
const DESK = "max-[759px]:hidden";

/**
 * Bookings › Services (U15, #1031; boards BKMServices and BKDStates):
 * what people can book. Built once for both sizes: at the desk a table
 * with "Who can book it" and "Taking bookings" columns, on a phone a row a
 * service with its tag and switch, and New service floating over the tab
 * bar.
 *
 * "Taking bookings" is a quick pause on each row (BA-29, DEC-170 Q5): off
 * unticks both "Who can book it" boxes, so nobody can book it and the
 * bookings already made stay; on ticks both back. It acts at once, with
 * Undo. Past 8 services the list has a search.
 *
 * What is true of several services is said once above the list (nobody
 * takes them), never on every row. A service customers can't book online
 * as it is paid (DEC-088) says so in its row, with the way to fix it.
 * "Also sell" (E12) switches Courses and Class packs under the list.
 */
export function ServicesScreen({
    services,
    staff,
    usage,
    currency,
    canEdit,
    hasPage,
    payment = null,
    alsoSell,
    modules = [],
    missingRates = null,
    canNewCourse = false,
    bookingLink = null,
}: {
    /**
     * "Your booking page" (DEC-175): where it is and whether customers can
     * open it; null leaves the row out (it couldn't be read).
     */
    bookingLink?: BookingLinkView | null;
    /**
     * What is on sale with a price and no GST rate, for a GST-registered
     * business; null when it couldn't be told, which draws nothing.
     */
    missingRates?: MissingRates | null;
    services: Service[];
    /** Null when the staff read failed. */
    staff: StaffView[] | null;
    /** Null when the bookings read failed. */
    usage: Record<string, ServiceUsage> | null;
    currency: string;
    canEdit: boolean;
    /** Whether the business has a booking page; null when unknown. */
    hasPage: boolean | null;
    /** How people pay when they book (DEC-088); null when unknown. */
    payment?: BookingPaymentView | null;
    /** Courses and Class packs, on or off; null for no row. */
    alsoSell: AlsoSellFeature[] | null;
    /** Every module, for what "Also sell" brings when it turns one on. */
    modules?: ModuleView[];
    /** Courses is on and this role may add one: New service is a menu. */
    canNewCourse?: boolean;
}) {
    const taking = useTakingBookings();
    // A switch shows what was asked for until the list is read again. Each
    // is kept against the row it was flipped on (`updatedAt`), so a fresh
    // read always wins.
    const [flipped, setFlipped] = useState<
        Partial<Record<string, { who: WhoFields; at: string }>>
    >({});
    const [term, setTerm] = useState("");
    // A new key empties the field: Clear and "Clear search".
    const [searchKey, setSearchKey] = useState(0);
    const clearSearch = () => {
        setTerm("");
        setSearchKey((k) => k + 1);
    };

    const all = services.map((s): Service => {
        const flip = flipped[s.id];
        return flip?.at === s.updatedAt ? { ...s, ...flip.who } : s;
    });

    const people = (staff ?? []).filter((p) => p.status === "ACTIVE");
    const takers = (id: string) =>
        people.filter((p) => p.serviceIds.includes(id));
    const nobody =
        staff === null
            ? null
            : nobodyTakesLine(
                  all.filter((s) => takers(s.id).length === 0),
                  all.length,
                  people.length > 0,
              );

    const views = all.map((s): ServiceRowView => {
        const who = whoCanBook(s);
        // Only what customers book online can be blocked online; one paid
        // at the desk instead still books (DEC-089).
        const found =
            who === "both" || who === "customers"
                ? onlineBookingProblem(s, payment)
                : null;
        const u = usage === null ? null : usage[s.id];
        return {
            service: s,
            who,
            line: serviceLine(
                s,
                staff === null
                    ? null
                    : takers(s.id).map((p) => callName(p.name)),
                currency,
            ),
            weekPhone: weekLine(s, u, "phone"),
            weekDesk: weekLine(s, u, "desk"),
            problem: found?.blocked ? found : null,
        };
    });
    const searchable = all.length >= SEARCH_FROM;
    const needle = searchable ? term.trim().toLowerCase() : "";
    const shown = needle
        ? views.filter((v) => v.service.name.toLowerCase().includes(needle))
        : views;

    const onTaking = canEdit
        ? (row: ServiceRowView, next: boolean) =>
              void taking.setTakingWho(row.service, next, (change) =>
                  setFlipped((had) => {
                      const s = row.service;
                      const flip = had[s.id];
                      const now: WhoFields = {
                          status: s.status,
                          showOnBookingPage: s.showOnBookingPage,
                          bookableByTeam: s.bookableByTeam,
                          ...(flip?.at === s.updatedAt ? flip.who : {}),
                      };
                      return {
                          ...had,
                          [s.id]: { who: change(now), at: s.updatedAt },
                      };
                  }),
              )
        : null;

    const newService = (fab: boolean) => {
        const look = fab
            ? "h-14 rounded-full pl-4 pr-5 text-[15px] shadow-lg"
            : undefined;
        const words = (
            <>
                <Plus aria-hidden className="size-4" />
                New service
            </>
        );
        return canNewCourse ? (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button className={look}>
                        {words}
                        <ChevronDown aria-hidden className="ml-1 size-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                        <Link href={NEW_SERVICE_HREF}>New service</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <Link href={NEW_COURSE_HREF}>New course</Link>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        ) : (
            <Button asChild className={look}>
                <Link href={NEW_SERVICE_HREF}>{words}</Link>
            </Button>
        );
    };

    const hasRows = all.length > 0;

    return (
        <div className={hasRows && canEdit ? "max-[759px]:pb-20" : undefined}>
            <PageHeader
                className="mb-3.5"
                breadcrumb={["Bookings", "Services"]}
                title="Services"
                count={servicesCount(all, hasPage)}
                description="What customers can book, how long it takes, and who does it."
                actions={
                    canEdit && hasRows ? (
                        <div className={DESK}>{newService(false)}</div>
                    ) : undefined
                }
            />
            {canEdit ? null : (
                <ReadOnlyNote>
                    Your role can see services but not change them.
                </ReadOnlyNote>
            )}
            {/* Priced things on sale with no GST rate, for a registered
                business: one line, and the sheet to choose them in. */}
            <MissingRatesNotice missing={missingRates} className="mb-3" />
            {/* The page customers book on, read first (DEC-175). */}
            {bookingLink ? (
                <BookingLinkRow view={bookingLink} className="mb-3" />
            ) : null}
            {!hasRows ? (
                <EmptyState
                    icon={<CalendarClock />}
                    title="No services yet"
                    description={
                        canEdit
                            ? "A service is what customers book: a one-to-one session or a group class."
                            : "What customers can book shows here: a one-to-one session or a group class."
                    }
                    action={
                        canEdit ? (
                            <Button asChild>
                                <Link href={NEW_SERVICE_HREF}>
                                    Add your first service
                                </Link>
                            </Button>
                        ) : undefined
                    }
                />
            ) : (
                <>
                    {/* Said once, with what fixes it, never on every row. */}
                    {nobody ? (
                        <>
                            <Notice
                                tone="warning"
                                className={`mb-3 ${PHONE}`}
                                data-ph-unmask=""
                            >
                                {nobody.line}{" "}
                                {canEdit ? (
                                    <TextLink
                                        href={nobody.link.href}
                                        className="font-semibold text-inherit"
                                    >
                                        {nobody.link.label}
                                    </TextLink>
                                ) : null}
                            </Notice>
                            <Notice
                                tone="neutral"
                                align="center"
                                className={`mb-3 bg-card ${DESK}`}
                                data-ph-unmask=""
                                action={
                                    canEdit ? (
                                        <Button asChild variant="outline">
                                            <Link href={nobody.link.href}>
                                                {nobody.link.label}
                                            </Link>
                                        </Button>
                                    ) : undefined
                                }
                            >
                                {nobody.line}
                            </Notice>
                        </>
                    ) : null}
                    {searchable ? (
                        <ListToolbar
                            className="mb-3"
                            search={
                                <ListSearch
                                    key={searchKey}
                                    placeholder="Search services"
                                    onSearch={setTerm}
                                />
                            }
                            count={
                                needle ? (
                                    <span className={DESK}>
                                        {shown.length} of {all.length} shown ·{" "}
                                        <Button
                                            variant="link"
                                            size="inline"
                                            onClick={clearSearch}
                                        >
                                            Clear
                                        </Button>
                                    </span>
                                ) : undefined
                            }
                        />
                    ) : null}
                    {shown.length === 0 ? (
                        <EmptyState
                            kind="no-results"
                            things="services"
                            cause="search"
                            query={term}
                            onClear={clearSearch}
                        />
                    ) : (
                        <>
                            <div className={DESK}>
                                <ServicesTable
                                    rows={shown}
                                    onTaking={onTaking}
                                    busy={taking.busy}
                                />
                            </div>
                            <div className={PHONE}>
                                <ServicesPhoneList
                                    rows={shown}
                                    onTaking={onTaking}
                                    busy={taking.busy}
                                />
                            </div>
                        </>
                    )}
                    {canEdit ? (
                        <p
                            className="mt-1.5 text-[12.5px] leading-normal text-muted-foreground"
                            data-ph-unmask=""
                        >
                            The switch on each row is{" "}
                            <strong className="font-semibold text-foreground">
                                {TAKING_LABEL}
                            </strong>
                            . Off pauses it: neither customers nor your team can
                            book it, and bookings already made stay. Open a
                            service to choose who can book it.
                        </p>
                    ) : null}
                </>
            )}
            {alsoSell ? (
                <AlsoSell features={alsoSell} modules={modules} />
            ) : null}
            {canEdit && hasRows ? (
                // New service floats over the tab bar on a phone.
                <div
                    className={`fixed bottom-[calc(16px+var(--tab-bar-inset,0px))] right-4 z-30 ${PHONE}`}
                >
                    {newService(true)}
                </div>
            ) : null}
        </div>
    );
}
