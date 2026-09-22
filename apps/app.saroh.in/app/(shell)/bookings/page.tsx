import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { BookingsView } from "@/components/bookings/bookings-view";
import { NewBookingDialog } from "@/components/bookings/new-booking-dialog";
import { PageContainer } from "@/components/shared/page-container";
import { canReadPacks, canWritePacks } from "@/lib/class-packs/access";
import { listContacts } from "@/lib/contacts/service";
import { contactName } from "@/lib/crm/format";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { listBookingsWithPast, listServices } from "@/lib/services/service";
import { requireSession } from "@/lib/session";
import { viewParam } from "@/lib/views/search-params";

/**
 * Owner bookings calendar (S4-003). The org's bookings across every service,
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
export const metadata = { title: "Bookings" };

export default async function BookingsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();

    const [upcoming, params, services, contacts, organization] =
        await Promise.all([
            listBookingsWithPast(),
            searchParams,
            listServices().catch(() => []),
            // Contacts belong to CRM, which may be off: then the dialog asks for
            // a name and email instead of offering people you know.
            listContacts().catch(() => []),
            resolveActiveOrganization(),
        ]);

    return (
        <PageContainer width="wide">
            <PageHeader
                title="Bookings"
                description="Reservations across your services, in the timezone each was booked in."
                actions={
                    <>
                        <Button asChild variant="outline">
                            <Link href="/services">Services</Link>
                        </Button>
                        <NewBookingDialog
                            services={services
                                .filter((s) => s.status === "ACTIVE")
                                .map((s) => ({
                                    id: s.id,
                                    name: s.name,
                                    timezone: s.timezone,
                                    minutes: s.durationMinutes,
                                }))}
                            contacts={contacts.map((c) => ({
                                id: c.id,
                                name: contactName(c),
                                email: c.email,
                            }))}
                            // Paying with a class pack spends one (ADR-007).
                            canUsePacks={
                                canReadPacks(organization) &&
                                canWritePacks(organization)
                            }
                        />
                    </>
                }
            />
            <div className="mt-6">
                <BookingsView
                    bookings={upcoming}
                    initialView={viewParam(params)}
                />
            </div>
        </PageContainer>
    );
}
