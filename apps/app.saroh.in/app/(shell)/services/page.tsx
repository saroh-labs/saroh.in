import { Button } from "@saroh/ui/button";
import {
    FailedState,
    PartialNotice,
    PermissionDeniedState,
} from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { ServicesScreen } from "@/components/services/services-screen";
import { PageContainer } from "@/components/shared/page-container";
import { whoCanChange } from "@/components/shared/who-can-change";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { knownRoleName } from "@/lib/organizations/role-name";
import { resolveActiveOrganization } from "@/lib/organizations/service";
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

/** What someone whose role can't read services is told. */
async function servicesDenied() {
    const organization = await resolveActiveOrganization();
    return whoCanChange({
        thing: "Services",
        business: organization?.name,
        role: organization ? knownRoleName(organization) : null,
    });
}

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
            <PageContainer width="full">
                <PageHeader
                    breadcrumb={["Bookings", "Services"]}
                    title="Services"
                />
                <div>
                    {read.forbidden ? (
                        // A denial is not a failure: nothing broke and
                        // trying again does the same thing. The denied
                        // card, never the red one (`saroh-product-states`).
                        <PermissionDeniedState {...await servicesDenied()} />
                    ) : (
                        <FailedState
                            title="Couldn't load your services"
                            description="Nothing has been changed. Try again in a moment."
                            action={
                                <Button asChild variant="outline">
                                    <Link href="/services">Try again</Link>
                                </Button>
                            }
                        />
                    )}
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
        <PageContainer width="full">
            <div>
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
