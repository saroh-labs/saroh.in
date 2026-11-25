import { PlanLimitNotice } from "@/components/billing/plan-limit-notice";
import { AvailabilityContainer } from "@/components/bookings/availability/availability-container";
import { PageContainer } from "@/components/shared/page/page-container";
import { permitsFor } from "@/lib/organizations/permits";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";
import { seatNote } from "@/lib/staff/seat-note";

/**
 * Bookings › Hours and time off (U16; V2 in U17, DEC-170; on React Query
 * in U25, DEC-259): each person's weekly hours, time off and one-off
 * extra hours, and the business's booking rules, each saved as it is
 * changed. The page awaits only its gates (the session, the business and
 * what the role may do) and the plan's seat note, which the plan notice
 * reads anyway; everything else is `/api/bookings/availability`, read in
 * the browser (`readAvailability`). `?person=` opens on someone (the
 * calendar's ⋯ "Arjun's hours and time off", a rule request's alert), or
 * `all` on everyone.
 */
export const metadata = { title: "Hours and time off" };

export default async function AvailabilityPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const [session, params, organization, plan] = await Promise.all([
        requireSession(),
        searchParams,
        resolveActiveOrganization(),
        billingAccessOrNull(),
    ]);
    const person = typeof params.person === "string" ? params.person : null;
    const may = organization?.actions
        ? permitsFor(organization)
        : (_: string) =>
              organization?.role === "OWNER" || organization?.role === "ADMIN";
    return (
        <PageContainer width="full">
            <div>
                <AvailabilityContainer
                    person={person}
                    business={organization?.name ?? "the business"}
                    me={session.user.name ?? ""}
                    meId={session.user.id}
                    // A Member keeps anyone's hours, time off and extra
                    // hours (DEC-170, Q13); who takes bookings, closing
                    // the business and its rules stay `service:write`.
                    canEdit={may("hours:write")}
                    canManage={may("service:write")}
                    seatNote={seatNote(plan)}
                    limitNotice={
                        // Everyone who takes bookings uses a team seat (DEC-105).
                        may("service:write") ? (
                            <PlanLimitNotice
                                moduleId="members"
                                className="mb-3"
                            />
                        ) : null
                    }
                />
            </div>
        </PageContainer>
    );
}
