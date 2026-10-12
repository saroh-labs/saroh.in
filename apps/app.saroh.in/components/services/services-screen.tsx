"use client";

import { AbsentOr } from "@saroh/ui/absent-value";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { Notice } from "@saroh/ui/notice";
import { PageHeader } from "@saroh/ui/page-header";
import { TextLink } from "@saroh/ui/text-link";
import { CalendarClock, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PlanWay } from "@/components/billing/plan-way";
import { MissingRatesNotice } from "@/components/gst-rates/missing-rates-notice";
import { AlsoSell } from "@/components/services/also-sell";
import { useTakingBookings } from "@/components/services/use-taking-bookings";
import { SwitchRow } from "@/components/shared/check-row";
import { DataView } from "@/components/shared/data-view/data-view";
import type { DataColumn } from "@/components/shared/data-view/types";
import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { StatusBadge } from "@/components/shared/status-badge";
import { isPlanHref } from "@/lib/billing/plan-access";
import { formatMoney } from "@/lib/format/money";
import type { MissingRates } from "@/lib/gst-rates/missing";
import type { ModuleView } from "@/lib/modules/schema";
import type { AlsoSellFeature } from "@/lib/services/also-sell";
import { callName } from "@/lib/services/call-name";
import { onlineBookingProblem } from "@/lib/services/online-booking";
import type { Service } from "@/lib/services/service";
import {
    AVAILABILITY_HREF,
    bookedLine,
    lengthLine,
    nobodyTakesLine,
    servicesCount,
    TAKING_LABEL,
} from "@/lib/services/service-cards";
import type { ServiceUsage } from "@/lib/services/usage";
import type { BookingPaymentView, StaffView } from "@/lib/staff/types";

const NEW_SERVICE_HREF = "/services/new";
const NEW_COURSE_HREF = "/courses/new";

/**
 * Bookings › Services (U16, E2): what people can book, as rows of the
 * shared list (Bookings audit, 12 Oct 2026; cards before). A row is the
 * service's name, one line of its length, the gap after, where and its
 * kind, then its price, who takes it and how it is booked, and it opens
 * the Service Editor. On a phone it is the shared list's own row.
 *
 * "Taking bookings" is a switch on each row, for a role that may change
 * services: it takes a service off the booking page and keeps the bookings
 * already made, at once, with Undo. A paused service also says Paused
 * beside its name. What is true of several services is said once above the
 * list (nobody takes them yet), never on every row.
 *
 * New service is one button, and a menu with New course once Courses is
 * on. "Also sell" (E12), which switches Courses and Class packs on or off
 * for whoever may switch modules, is a quiet row under the list. A service
 * people can't book online as it is paid (DEC-088, #821) says so in its
 * row, with the way to fix it.
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
}: {
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
        Partial<Record<string, { taking: boolean; at: string }>>
    >({});
    const rows = services.map((s): Service => {
        const flip = flipped[s.id];
        return flip?.at === s.updatedAt
            ? { ...s, status: flip.taking ? "ACTIVE" : "ARCHIVED" }
            : s;
    });

    const people = (staff ?? []).filter((p) => p.status === "ACTIVE");
    const takers = (id: string) =>
        people.filter((p) => p.serviceIds.includes(id));
    const nobody =
        staff === null
            ? null
            : nobodyTakesLine(
                  rows.filter((s) => takers(s.id).length === 0).length,
                  rows.length,
                  people.length > 0,
              );

    const columns: DataColumn<Service>[] = [
        {
            id: "service",
            header: "Service",
            priority: "primary",
            sortValue: (s) => s.name.toLowerCase(),
            cell: (s) => (
                <span className="block min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{s.name}</span>
                        {s.status === "ACTIVE" ? null : (
                            // Paused in words, not only by the switch.
                            <StatusBadge thing="service" status="NOT_TAKING" />
                        )}
                    </span>
                    <span className="mt-0.5 block whitespace-normal text-[12.5px] font-normal text-muted-foreground">
                        {lengthLine(s)}
                    </span>
                </span>
            ),
        },
        {
            id: "price",
            header: "Price",
            priority: "secondary",
            numeric: true,
            money: true,
            sortValue: (s) => s.priceCents ?? 0,
            cell: (s) => (
                <span className="block">
                    {s.priceCents
                        ? formatMoney(s.priceCents, s.currency ?? currency)
                        : "Free"}
                    {s.capacity > 1 && s.priceCents ? (
                        <span className="block font-sans text-[12px] font-normal text-muted-foreground">
                            or a pack class
                        </span>
                    ) : null}
                </span>
            ),
        },
        {
            id: "who",
            header: "Who takes it",
            priority: "secondary",
            cell: (s) => {
                const who = takers(s.id);
                return staff === null ? (
                    <span className="text-muted-foreground">
                        Couldn&apos;t load
                    </span>
                ) : who.length ? (
                    who.map((p) => callName(p.name)).join(", ")
                ) : (
                    <span className="text-muted-foreground">Nobody yet</span>
                );
            },
        },
        {
            id: "booked",
            header: "Bookings",
            priority: "secondary",
            cell: (s) => {
                // Only a live service on the booking page is booked online
                // at all; one paid at the desk instead still books, so only
                // a service that can't be booked is marked (DEC-089).
                const found =
                    s.status === "ACTIVE" && s.showOnBookingPage
                        ? onlineBookingProblem(s, payment)
                        : null;
                const problem = found?.blocked ? found : null;
                return (
                    <span className="block min-w-0">
                        <AbsentOr says="None">
                            {bookedLine(s, usage === null ? null : usage[s.id])}
                        </AbsentOr>
                        {problem ? (
                            <span className="mt-1.5 block w-fit rounded-[8px] bg-warning-subtle px-2.5 py-1.5 text-[12px] leading-[1.45] text-warning-subtle-foreground">
                                {problem.line}{" "}
                                <PlanWay
                                    when={isPlanHref(problem.fix.href)}
                                    className="text-[length:inherit] text-inherit"
                                >
                                    <TextLink href={problem.fix.href}>
                                        {problem.fix.label}
                                    </TextLink>
                                </PlanWay>
                            </span>
                        ) : null}
                    </span>
                );
            },
        },
    ];

    const newService = canNewCourse ? (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button>
                    New service
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
        <Button asChild>
            <Link href={NEW_SERVICE_HREF}>New service</Link>
        </Button>
    );

    return (
        <>
            <PageHeader
                className="mb-5"
                breadcrumb={["Bookings", "Services"]}
                title="Services"
                count={servicesCount(rows, hasPage)}
                description="What people can book, and who takes it."
                actions={canEdit ? newService : undefined}
            />
            {canEdit ? null : (
                <ReadOnlyNote>
                    Your role can see these services but not change them.
                </ReadOnlyNote>
            )}
            {/* Priced things on sale with no GST rate, for a registered
                business: one line, and the sheet to choose them in. */}
            <MissingRatesNotice missing={missingRates} className="mb-3" />
            {/* Said once, with what fixes it, never on every row. */}
            {nobody ? (
                <Notice tone="neutral" className="mb-3" data-ph-unmask="">
                    {nobody.line}
                    {nobody.toAvailability && canEdit ? (
                        <>
                            {" "}
                            <TextLink href={AVAILABILITY_HREF}>
                                Add yourself or your team in Availability
                            </TextLink>
                        </>
                    ) : null}
                </Notice>
            ) : null}
            {rows.length === 0 ? (
                <EmptyState
                    icon={<CalendarClock />}
                    title="No services yet"
                    description={
                        canEdit
                            ? "Add what customers can book: a one-to-one or a class."
                            : "What customers can book shows here: a one-to-one or a class."
                    }
                    action={
                        canEdit ? (
                            <Button asChild>
                                <Link href={NEW_SERVICE_HREF}>New service</Link>
                            </Button>
                        ) : undefined
                    }
                />
            ) : (
                <DataView
                    viewId="services"
                    rows={rows}
                    columns={columns}
                    rowKey={(s) => s.id}
                    rowHref={(s) => `/services/${s.id}`}
                    modes={["table", "list"]}
                    hideModeToggle
                    noun={{ one: "service", other: "services" }}
                    // The header says how many.
                    showTotal={false}
                    rowActions={
                        canEdit
                            ? (s) => (
                                  <SwitchRow
                                      checked={s.status === "ACTIVE"}
                                      disabled={taking.busy === s.id}
                                      name={`${TAKING_LABEL}, ${s.name}`}
                                      onChange={(next) =>
                                          void taking.setTaking(s, next, (on) =>
                                              setFlipped((had) => ({
                                                  ...had,
                                                  [s.id]: {
                                                      taking: on,
                                                      at: s.updatedAt,
                                                  },
                                              })),
                                          )
                                      }
                                      className="justify-end whitespace-nowrap"
                                  >
                                      {TAKING_LABEL}
                                  </SwitchRow>
                              )
                            : undefined
                    }
                />
            )}
            {alsoSell ? (
                <AlsoSell features={alsoSell} modules={modules} />
            ) : null}
        </>
    );
}
