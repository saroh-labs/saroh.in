import type { BusinessReach } from "../reach-links";
import type { CheckoutRequest } from "./checkout";
import type { Phase } from "./flow-state";
import type { BookingPageData, BookingService } from "./model";
import { visitsOf, whereText } from "./model";
import { BookedCard } from "./steps/booked-card";
import { DoneCard } from "./steps/done-card";
import { ExpiredCard } from "./steps/expired-card";
import { PayingCard } from "./steps/paying-card";
import { WaitlistCard } from "./steps/waitlist-card";

/**
 * The booking page past choosing: paying a hold, a hold that ran out, the
 * booked card, a place in a class's line, or a booking read again from its
 * reference (U9). Each puts focus on its own heading as it opens.
 */
export function FlowOutcome({
    phase,
    page,
    service,
    headingRef,
    soldBy,
    email,
    gst,
    now,
    zone,
    booker,
    leaving,
    deskOffered,
    reach,
    on,
    apiUrl,
}: {
    phase: Exclude<Phase, { kind: "choose" }>;
    page: BookingPageData;
    service: BookingService | null;
    headingRef: React.RefObject<HTMLHeadingElement | null>;
    soldBy: string | null;
    email: string | null;
    gst: string | null;
    now: number | null;
    zone: string;
    booker: CheckoutRequest["booker"];
    leaving: boolean;
    /** The desk is on offer: never for a deposit (E8), nor online only. */
    deskOffered: boolean;
    reach: BusinessReach;
    on: {
        again: () => void;
        leaveHold: (then: "choose" | "desk") => void;
        paid: () => void;
        backToChoosing: () => void;
    };
    apiUrl: string;
}) {
    switch (phase.kind) {
        case "done":
            return (
                <DoneCard
                    phase={phase}
                    soldBy={soldBy}
                    email={email}
                    headingRef={headingRef}
                    business={page.businessName}
                    where={
                        service
                            ? whereText(
                                  service,
                                  phase.booking,
                                  page.services,
                                  page.businessName,
                              )
                            : null
                    }
                    rules={page.rules}
                    visits={visitsOf(service)}
                    gst={gst}
                    onAgain={on.again}
                />
            );
        case "waitlisted":
            return (
                <WaitlistCard
                    phase={phase}
                    headingRef={headingRef}
                    onAgain={on.again}
                />
            );
        case "paying":
            return (
                <PayingCard
                    phase={phase}
                    now={now}
                    zone={zone}
                    headingRef={headingRef}
                    serviceName={service?.name ?? ""}
                    gst={gst}
                    business={page.businessName}
                    booker={booker}
                    busy={leaving}
                    onDesk={
                        deskOffered ? () => on.leaveHold("desk") : undefined
                    }
                    onBack={() => on.leaveHold("choose")}
                    onPaid={on.paid}
                    apiUrl={apiUrl}
                />
            );
        case "expired":
            return (
                <ExpiredCard
                    when={phase.when}
                    business={page.businessName}
                    checkoutPaid={phase.checkoutPaid}
                    reach={reach}
                    headingRef={headingRef}
                    onAgain={on.backToChoosing}
                />
            );
        case "booked":
            return (
                <BookedCard
                    lookup={phase.lookup}
                    headingRef={headingRef}
                    onAgain={on.again}
                />
            );
    }
}
