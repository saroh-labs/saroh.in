import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { BookingsView } from "@/components/bookings/bookings-view";
import { NewBookingDialog } from "@/components/bookings/new-booking-dialog";
import { PageContainer } from "@/components/shared/page-container";
import { SinceNotice } from "@/components/shared/since-notice";
import { canReadPacks, canUsePacksOnBookings } from "@/lib/class-packs/access";
import { packsOn } from "@/lib/class-packs/switched-on";
import { hasPaymentProvider } from "@/lib/invoices/tax";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { listBookingsWithPast, listServices } from "@/lib/services/service";
import { requireSession } from "@/lib/session";
import { BOOKINGS_FIRST_RUN, shareLink } from "@/lib/sites/share-links";
import { readWebAddressLinks } from "@/lib/sites/share-links-read";
import { viewParam } from "@/lib/views/search-params";
import { isSince, sinceParam, withoutSince } from "@/lib/views/since";

/**
 * Every booking as one list (S4-003) — the register the calendar replaced as
 * Bookings' landing page (U15). Kept whole, because its filters (upcoming,
 * past, waiting to be marked) answer questions a diary does not. The org's bookings across every service,
 * each rendered in the booking's own timezone — the zone the booker saw —
 * because an Organization has no single zone to fold them into.
 *
 * PAST bookings are included now (#241). They were always in the database and
 * filtered out of every surface, which was fine while a finished appointment
 * had nothing left to say. It has: an outcome is recorded by a person, so the
 * appointments waiting to be marked have to be somewhere a merchant can find
 * them. "Upcoming" is still the default view.
 *
 * The page fetches; `BookingsView` decides how to render. Day grouping used to
 * live here as hand-rolled `Intl` helpers; it now lives in `lib/format/datetime`
 * so Home's schedule band and this screen cannot disagree about what "Today"
 * means.
 */
export const metadata = { title: "All bookings" };

export default async function BookingsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();

    const [every, params, services, organization] = await Promise.all([
        listBookingsWithPast(),
        searchParams,
        listServices().catch(() => []),
        resolveActiveOrganization(),
    ]);
    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";
    // New booking finds the customer by search (E4) and can send a pay link.
    const people = {
        canSearch: may("contact:read"),
        payLink:
            may("booking:write") &&
            may("invoice:write") &&
            (await hasPaymentProvider().catch(() => false)),
    };

    // From Home's "Last 24 hours" (F6): the confirmed bookings made since
    // then, as Home counted them.
    const since = sinceParam(params);
    const upcoming = since
        ? every.filter(
              (b) => b.status === "CONFIRMED" && isSince(b.createdAt, since),
          )
        : every;

    // No bookings at all yet: "Share your booking page" while it is live
    // (DEC-069, L8). Only then is the web address read, and a read that
    // fails (or a role it isn't shown to) just leaves the button out.
    const share =
        every.length === 0 && !since
            ? shareLink(await readWebAddressLinks(), BOOKINGS_FIRST_RUN)
            : null;

    return (
        <PageContainer width="wide">
            <PageHeader
                breadcrumb={[
                    <Link
                        key="b"
                        href="/bookings"
                        className="hover:text-foreground"
                    >
                        Bookings
                    </Link>,
                    "All bookings",
                ]}
                title="All bookings"
                description="Reservations across your services, in the timezone each was booked in."
                actions={
                    <>
                        <Button asChild variant="outline">
                            <Link href="/bookings">Calendar</Link>
                        </Button>
                        <NewBookingDialog
                            services={services
                                .filter((s) => s.status === "ACTIVE")
                                .map((s) => ({
                                    id: s.id,
                                    name: s.name,
                                    timezone: s.timezone,
                                    minutes: s.durationMinutes,
                                    priceCents: s.priceCents,
                                }))}
                            people={people}
                            // Paying with a class pack spends one (ADR-007),
                            // while Class packs is on (E12).
                            canUsePacks={
                                canReadPacks(organization) &&
                                canUsePacksOnBookings(organization) &&
                                packsOn(await modulesOrUnknown())
                            }
                        />
                    </>
                }
            />
            <div className="mt-6 space-y-4">
                {since ? (
                    <SinceNotice
                        count={upcoming.length}
                        noun={{ one: "booking", other: "bookings" }}
                        verb="made"
                        clearHref={withoutSince("/bookings/all", params)}
                    />
                ) : null}
                <BookingsView
                    bookings={upcoming}
                    initialView={viewParam(params)}
                    share={share}
                />
            </div>
        </PageContainer>
    );
}
