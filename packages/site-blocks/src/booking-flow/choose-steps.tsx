import type { SignedInCustomer } from "../account/api";
import type { BusinessReach } from "../reach-links";
import { ReachLinks } from "../reach-links";
import type { PayWords } from "./flow-words";
import type {
    BookingPageData,
    BookingStart,
    BookingWhere,
    BookPay,
} from "./model";
import { laterSkip, sessionsOnShow } from "./model";
import { DetailsStep } from "./steps/details-step";
import type { FlowMessage } from "./steps/flow-message";
import { FlowMessageLine } from "./steps/flow-message";
import { PayStep } from "./steps/pay-step";
import { ServiceStep } from "./steps/service-step";
import { WhenStep } from "./steps/when-step";
import type { Times } from "./use-times";
import { SESSIONS_SHOWN } from "./use-times";
import type { WaitlistPlace } from "./waitlist";

/**
 * Choosing, on the booking page as it has always looked (Classic): what,
 * when (with who where more than one person takes it), the booker's
 * details and how they'll pay, one under the other as each is reached. The
 * step in the address (U9) moves with each choice; the page looks the same.
 */
export function ChooseSteps({
    ids,
    page,
    times,
    chosen,
    reach,
    waitlist,
    onService,
    onPerson,
    onStart,
    details,
    words,
    payChoice,
    whoOk,
    message,
}: {
    ids: string;
    page: BookingPageData;
    times: Times;
    chosen: BookingStart | null;
    reach: BusinessReach;
    /** A full class's waitlist (A12), when the site offers one. */
    waitlist?: { placeOf: (startAt: string) => WaitlistPlace | undefined };
    onService: (id: string) => void;
    onPerson: (id: string | null) => void;
    onStart: (start: BookingStart | null) => void;
    details: {
        customer: SignedInCustomer | null;
        name: string;
        touched: boolean;
        signingOut: boolean;
        onName: (name: string) => void;
        onNotYou: () => void;
        asksWhere: boolean;
        where: BookingWhere;
        onlyWhere: BookingWhere | null;
        note: string;
        onWhere: (where: BookingWhere) => void;
        onNote: (note: string) => void;
        phone: string;
        onPhone: (phone: string) => void;
    };
    words: PayWords;
    payChoice: { pay: BookPay; onPick: (pay: BookPay) => void };
    whoOk: boolean;
    message: FlowMessage | null;
}) {
    const { service } = times;
    const { choices, gstWords, waiting, unpayable } = words;
    return (
        <>
            <ServiceStep
                services={page.services}
                serviceId={times.serviceId}
                onPick={onService}
            />

            {service ? (
                <WhenStep
                    daysState={times.daysState}
                    days={times.days}
                    isClass={times.isClass}
                    day={times.day}
                    sessions={times.sessions.slice(
                        0,
                        sessionsOnShow(
                            times.sessions,
                            times.sessionsShown,
                            chosen?.startAt,
                        ),
                    )}
                    more={
                        times.sessions.length >
                        sessionsOnShow(
                            times.sessions,
                            times.sessionsShown,
                            chosen?.startAt,
                        )
                    }
                    zone={times.zone}
                    service={service}
                    chosen={chosen}
                    business={page.businessName}
                    onRetry={() => times.retry(service.id)}
                    person={times.person}
                    onPerson={onPerson}
                    skip={times.skip}
                    later={laterSkip(times.skip, page.rules.bookAheadDays)}
                    onSkip={(next) =>
                        times.showDays(service.id, {
                            skip: next,
                            person: times.person,
                        })
                    }
                    reach={reach}
                    onDay={(d) => {
                        times.setDate(d);
                        onStart(null);
                    }}
                    onStart={onStart}
                    onMore={() =>
                        times.setSessionsShown((n) => n + SESSIONS_SHOWN)
                    }
                    waitlist={waitlist}
                />
            ) : null}

            {chosen ? (
                <DetailsStep
                    ids={ids}
                    business={page.businessName}
                    {...details}
                    forWaitlist={waiting}
                />
            ) : null}

            {chosen && whoOk && !waiting && choices.length > 0 ? (
                <PayStep
                    choices={choices}
                    pay={payChoice.pay}
                    gst={
                        choices.some((c) => c.pay !== "CREDIT")
                            ? gstWords
                            : null
                    }
                    onPick={payChoice.onPick}
                />
            ) : null}

            {/* It can't be paid for here, so it can't be booked here: the
                way to ask instead. */}
            {unpayable ? <ReachLinks reach={reach} /> : null}

            {message ? (
                // The aside says it from 700px.
                <div className="min-[700px]:hidden">
                    <FlowMessageLine message={message} />
                </div>
            ) : null}
        </>
    );
}
