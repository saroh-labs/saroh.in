import { PartialRead } from "@/components/shared/failed-read";
import { FailedState, PermissionDeniedState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";

import { ServicesScreen } from "@/components/services/services-screen";
import { PageContainer } from "@/components/shared/page-container";
import { whoCanChange } from "@/components/shared/who-can-change";
import { canWriteCourses } from "@/lib/courses/access";
import { readMissingRates } from "@/lib/gst-rates/service";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { rolledOut } from "@/lib/modules/rollout";
import { knownRoleName } from "@/lib/organizations/role-name";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { alsoSellFeatures } from "@/lib/services/also-sell";
import { readBookingLink } from "@/lib/services/booking-link-read";
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
import { couldntLoad } from "@saroh/ui/lib/state-copy";

/**
 * Bookings › Services (U16, E2; U15, #1031): what people can book. The
 * services read is the page; the staff read (who takes each), the
 * bookings read (how each is used) and the sites read (whether there is
 * a booking page) degrade on their own and say so. The module list, for
 * "Also sell" (E12) and New course in the New service menu, leaves both
 * out when it can't be read; how people
 * pay (DEC-088) marks nothing when it can't. A GST-registered business with
 * priced things on sale and no GST rate reads one line saying so, with the
 * sheet to choose them in; unread, it says nothing.
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
    const [
        read,
        staffList,
        hasPage,
        canEdit,
        modules,
        payment,
        missingRates,
        organization,
        bookingLink,
    ] = await Promise.all([
        readServices(),
        readStaffOrNull(),
        readHasBookingPage(),
        readCanEditServices(),
        modulesOrUnknown(),
        readBookingPayment(),
        // What is on sale with no GST rate; null draws no notice.
        readMissingRates(),
        resolveActiveOrganization(),
        // "Your booking page" (DEC-175); null leaves the row out.
        readBookingLink(),
    ]);
    // New course joins New service only while Courses is on here and this
    // role may add one: the same answers the Courses screen gives.
    const canNewCourse =
        canWriteCourses(organization) &&
        rolledOut(modules ?? []).some(
            (m) => m.key === "COURSES" && m.lifecycle === "ENABLED",
        );

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
                            title={couldntLoad("your services")}
                            retryHref="/services"
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
                    <PartialRead
                        className="mb-3"
                        things={
                            !staffList && !usage
                                ? "who takes each service or how much each is booked"
                                : !staffList
                                  ? "who takes each service"
                                  : "how much each service is booked"
                        }
                    />
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
                    missingRates={missingRates}
                    canNewCourse={canNewCourse}
                    bookingLink={bookingLink}
                />
            </div>
        </PageContainer>
    );
}
