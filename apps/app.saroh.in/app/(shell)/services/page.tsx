import { Button } from "@saroh/ui/button";
import { FailedState, PartialNotice } from "@saroh/ui/data-state";
import Link from "next/link";

import { BARE, BookingsTopBar } from "@/components/bookings/calendar/parts";
import { ServicesScreen } from "@/components/services/services-screen";
import { PageContainer } from "@/components/shared/page-container";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { alsoSellFeatures } from "@/lib/services/also-sell";
import {
    businessCurrencyOf,
    readCanEditServices,
    readHasBookingPage,
    readStaffOrNull,
} from "@/lib/services/editor-data";
import { readServices } from "@/lib/services/service";
import { readServiceUsage } from "@/lib/services/usage-read";
import { requireSession } from "@/lib/session";
import { readBookingPayment } from "@/lib/staff/service";

/**
 * Bookings › Services (U16, E2): what people can book, as the design's
 * cards. The services read is the page; the staff read (who takes each),
 * the bookings read (how each is used) and the sites read (whether there is
 * a booking page) degrade on their own and say so. The module list, for
 * "Also sell" (E12), leaves the card out when it can't be read; how people
 * pay (DEC-088) marks nothing when it can't.
 */
export const metadata = { title: "Services" };

export default async function ServicesPage() {
    await requireSession();
    const [read, staffList, hasPage, canEdit, modules, payment] =
        await Promise.all([
            readServices(),
            readStaffOrNull(),
            readHasBookingPage(),
            readCanEditServices(),
            modulesOrUnknown(),
            readBookingPayment(),
        ]);

    if (!read.ok) {
        return (
            <PageContainer width="full" className={BARE}>
                <BookingsTopBar page="Services" />
                <div className="px-[22px] pb-6 pt-[18px]">
                    <FailedState
                        title={
                            read.forbidden
                                ? "Your role can't see services"
                                : "Couldn't load your services"
                        }
                        description={
                            read.forbidden
                                ? "An owner or admin can change what your role reaches in Team."
                                : "Nothing has been changed. Try again in a moment."
                        }
                        action={
                            read.forbidden ? undefined : (
                                <Button asChild variant="outline">
                                    <Link href="/services">Try again</Link>
                                </Button>
                            )
                        }
                    />
                </div>
            </PageContainer>
        );
    }

    const services = read.services;
    const timezone =
        staffList?.timezone ?? services.at(0)?.timezone ?? "Asia/Kolkata";
    const usage = await readServiceUsage(
        services.map((s) => s.id),
        timezone,
    );

    return (
        <PageContainer width="full" className={BARE}>
            <BookingsTopBar page="Services" />
            <div className="px-[22px] pb-6 pt-[18px] max-[759px]:px-4">
                {staffList && usage ? null : (
                    <PartialNotice className="mb-3">
                        {!staffList && !usage
                            ? "Who takes each service and how each is used could not be loaded."
                            : !staffList
                              ? "Who takes each service could not be loaded."
                              : "How much each service is booked could not be loaded."}
                    </PartialNotice>
                )}
                <ServicesScreen
                    services={services}
                    staff={staffList?.staff ?? null}
                    usage={usage}
                    currency={businessCurrencyOf(services)}
                    canEdit={canEdit}
                    hasPage={hasPage}
                    payment={payment}
                    alsoSell={alsoSellFeatures(modules)}
                    modules={modules ?? []}
                />
            </div>
        </PageContainer>
    );
}
