"use client";

import { Button } from "@saroh/ui/button";

import type { ServicesLoad } from "@/components/sites/section-fields";
import { count } from "@/lib/format/plural";
import { servicePriceWords } from "@/lib/services/price-words";
import type { Section } from "@/lib/sites/service";

/**
 * The services a section shows, when it is bound to Services. A Booking
 * section (D6) shows its one service, or, with none named, every service
 * the booking page offers: `all`, the business's live ones.
 */
export function boundServiceIds(
    section: Section,
    all: readonly string[] = [],
): string[] | null {
    if (section.type === "booking") {
        const one = (section.content as { serviceId?: string }).serviceId;
        return one ? [one] : [...all];
    }
    const ids = (section.content as { serviceIds?: unknown }).serviceIds;
    return Array.isArray(ids) ? (ids as string[]) : null;
}

/**
 * "From Services" (U47, `fix/WXKSelected`): the services a bound section
 * shows, each with its time and price as Services holds them. A price opens
 * the price sheet (U48) through `onPrice`; without it the price is words.
 * Which services, and their order, stay in the section's own fields below.
 */
export function BoundServices({
    section,
    services,
    onPrice,
}: {
    section: Section;
    services: ServicesLoad;
    /** Open the price sheet for a service; absent, prices aren't tappable. */
    onPrice?: (serviceId: string) => void;
}) {
    if (services.status !== "ready") return null;
    const active = services.services.filter((s) => s.status === "ACTIVE");
    const ids = boundServiceIds(
        section,
        active.map((s) => s.id),
    );
    if (ids === null || ids.length === 0) return null;
    const byId = new Map(services.services.map((s) => [s.id, s]));
    const shown = ids.flatMap((id) => {
        const s = byId.get(id);
        return s?.status === "ACTIVE" ? [s] : [];
    });

    return (
        <section
            aria-labelledby="bound-services"
            data-bound-services=""
            className="grid gap-2"
        >
            <h3 id="bound-services" className="text-sm font-semibold">
                From Services
            </h3>
            <ul className="grid gap-1.5">
                {shown.map((s) => {
                    const price = servicePriceWords(s.priceCents, s.currency);
                    return (
                        <li
                            key={s.id}
                            className="flex min-h-11 items-center gap-2 rounded-[9px] border bg-card px-3 py-1.5"
                        >
                            <span className="min-w-0 flex-1">
                                <span
                                    data-ph-mask=""
                                    className="block truncate text-sm font-medium"
                                >
                                    {s.name}
                                </span>
                                {s.durationMinutes ? (
                                    <span className="block text-xs text-muted-foreground">
                                        {count(s.durationMinutes, "min", "min")}
                                    </span>
                                ) : null}
                            </span>
                            {onPrice ? (
                                <Button
                                    data-ph-mask=""
                                    data-price-of={s.id}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    aria-label={`Change the price of ${s.name}, ${price}`}
                                    onClick={() => onPrice(s.id)}
                                    className="shrink-0 tabular-nums"
                                >
                                    {price}
                                </Button>
                            ) : (
                                <span className="shrink-0 text-sm tabular-nums">
                                    {price}
                                </span>
                            )}
                        </li>
                    );
                })}
            </ul>
            <p className="text-xs leading-relaxed text-muted-foreground">
                {shown.length} of {count(active.length, "service")}. Names,
                prices and times come from Services, so the page never shows an
                old price.
                {onPrice ? " Tap a price to change it here." : null}
            </p>
        </section>
    );
}
