import { phoneText } from "../lib/phone";
import { cn } from "../lib/utils";
import type { BusinessReach } from "../reach-links";
import { ReachLinks } from "../reach-links";
import type { headerFacts } from "./flow-helpers";
import { kicker, pageTitle, zoneName } from "./flow-helpers";
import type { BookingService } from "./model";
import { card } from "./styles";

/**
 * The booking page's header and the cards it shows when nothing can be
 * booked online. Drawn from `--site-*` only (gate G2).
 */

type Facts = ReturnType<typeof headerFacts>;

/** What can be booked, the place and the phone, and the zone times are in. */
export function BookingHeader({
    services,
    facts,
    businessName,
    timezone,
}: {
    services: BookingService[];
    facts: Facts;
    businessName: string;
    timezone: string;
}) {
    return (
        <section className="bg-site-hero-bg text-site-hero-fg">
            <div className="mx-auto max-w-[1060px] px-5 pb-[38px] pt-[34px]">
                <p className="text-site-accent text-xs font-semibold uppercase tracking-[0.14em]">
                    {kicker(services)}
                </p>
                <h1 className="font-site-heading mt-2.5 text-balance text-[clamp(34px,6vw,56px)] font-semibold leading-[1.02] tracking-[-0.035em]">
                    {pageTitle(services)}
                </h1>
                {facts.place ? (
                    <p className="mt-3 text-[14.5px] opacity-70">
                        {facts.place}
                    </p>
                ) : null}
                <p
                    className={cn(
                        "opacity-70",
                        facts.place
                            ? "mt-1.5 text-[13px]"
                            : "mt-3 text-[14.5px]",
                    )}
                >
                    {facts.place ? null : <>{businessName} · </>}
                    {facts.phone ? (
                        <>
                            <a
                                href={`tel:${facts.phone}`}
                                className="focus-visible:ring-site-accent rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2"
                            >
                                {phoneText(facts.phone)}
                            </a>{" "}
                            ·{" "}
                        </>
                    ) : null}
                    Times are in {zoneName(timezone)}
                </p>
            </div>
        </section>
    );
}

/**
 * Online booking paused at the plan's monthly cap (DEC-095), said up front
 * naming no plan — or not open at all (Appointments off, nothing offered).
 */
export function ClosedCard({
    paused,
    businessName,
    phone,
    reach,
}: {
    paused: boolean;
    businessName: string;
    phone: string | null;
    reach: BusinessReach;
}) {
    if (!paused) {
        return (
            <div className={card}>
                <h2 className="font-site-heading text-site-fg text-[19px] font-semibold tracking-[-0.02em]">
                    Online booking isn&apos;t open right now
                </h2>
                <p className="text-site-body mt-2 text-sm">
                    Get in touch with {businessName} to book a time.
                </p>
                <ReachLinks reach={reach} className="mt-1" />
            </div>
        );
    }
    return (
        <div className={card}>
            <h2 className="font-site-heading text-site-fg text-[19px] font-semibold tracking-[-0.02em]">
                Online booking is paused for now
            </h2>
            <p className="text-site-body mt-2 text-sm">
                {phone ? (
                    <>
                        Call {businessName} on{" "}
                        <a
                            href={`tel:${phone}`}
                            className="focus-visible:ring-site-accent rounded-sm underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2"
                        >
                            {phoneText(phone)}
                        </a>{" "}
                        to book a time.
                    </>
                ) : (
                    <>Get in touch with {businessName} to book a time.</>
                )}
            </p>
            {/* With no phone in the sentence, the ways the site does show:
                a message, at least. */}
            {phone ? null : <ReachLinks reach={reach} className="mt-1" />}
        </div>
    );
}
