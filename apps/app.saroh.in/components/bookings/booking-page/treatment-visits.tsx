import { IntentLink } from "@saroh/ui/intent-link";
import { ArrowRight } from "lucide-react";

import { NewBookingDialog } from "@/components/bookings/new-booking/new-booking-dialog";
import { useBookingSave } from "@/lib/bookings/use-bookings";
import type { TreatmentView } from "@/lib/services/booking-calendar";
import {
    orderHref,
    orderLabel,
    visitLabel,
    visitsDoneText,
    visitToBook,
} from "@/lib/services/treatment";

/**
 * A visit of a treatment on the booking page (E10, DEC-050): "Visit 2 of 3",
 * the order it is paid on — a link for someone who may read orders, words
 * for anyone else — and "Book visit 3", which opens New booking with the
 * service, the customer and the order already set.
 */
export function TreatmentVisits({
    treatment,
    service,
    who,
    canReadOrder,
}: {
    treatment: TreatmentView;
    service: {
        id: string;
        name: string;
        timezone: string;
        durationMinutes: number;
        priceCents: number | null;
    };
    /** Whose treatment it is, by name. */
    who: string;
    canReadOrder: boolean;
}) {
    const { refresh } = useBookingSave();
    const next = visitToBook(treatment, who);
    const done = visitsDoneText(treatment);
    return (
        <section className="rounded-xl border border-border bg-card p-4 min-[760px]:px-[18px]">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-sm font-medium">
                        {visitLabel(treatment)}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {canReadOrder ? (
                            <IntentLink
                                href={orderHref(treatment)}
                                className="inline-flex items-center gap-1 rounded-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                {orderLabel(treatment)}
                                <ArrowRight aria-hidden className="size-3.5" />
                            </IntentLink>
                        ) : (
                            orderLabel(treatment)
                        )}
                        {" · "}
                        {treatment.booked} of {treatment.visits} booked
                    </p>
                </div>
                {next ? (
                    <NewBookingDialog
                        services={[
                            {
                                id: service.id,
                                name: service.name,
                                timezone: service.timezone,
                                minutes: service.durationMinutes,
                                priceCents: service.priceCents,
                            },
                        ]}
                        people={{ canSearch: false, payLink: false }}
                        visit={next}
                        // The booking page, the list and the diary read again.
                        onBooked={refresh}
                    />
                ) : null}
            </div>
            {done ? (
                <p className="mt-3 text-sm text-muted-foreground">{done}</p>
            ) : null}
        </section>
    );
}
