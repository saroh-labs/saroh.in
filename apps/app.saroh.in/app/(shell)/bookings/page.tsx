import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { BookingsView } from "@/components/bookings/bookings-view";
import { listUpcomingBookings } from "@/lib/services/service";
import { requireSession } from "@/lib/session";
import { viewParam } from "@/lib/views/search-params";

/**
 * Owner bookings calendar (S4-003). The org's UPCOMING bookings across every
 * service, each rendered in the booking's own timezone — the zone the booker
 * saw — because an Organization has no single zone to fold them into.
 *
 * The page fetches; `BookingsView` decides how to render. Day grouping used to
 * live here as hand-rolled `Intl` helpers; it now lives in `lib/format/datetime`
 * so Home's schedule band and this screen cannot disagree about what "Today"
 * means.
 */
export const metadata = { title: "Bookings" };

export default async function BookingsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();

    const [upcoming, params] = await Promise.all([
        listUpcomingBookings(),
        searchParams,
    ]);

    return (
        <main className="mx-auto w-full max-w-7xl p-6 sm:p-8">
            <PageHeader
                title="Bookings"
                description="Upcoming reservations across your services, in the timezone each was booked in."
                actions={
                    <Button asChild variant="outline">
                        <Link href="/services">Services</Link>
                    </Button>
                }
            />
            <div className="mt-6">
                <BookingsView
                    bookings={upcoming}
                    initialView={viewParam(params)}
                />
            </div>
        </main>
    );
}
