"use client";

import type { LookId, RenderedServicesList } from "@saroh/block-contract";

import { cn } from "../lib/utils";
import { LookIcon } from "../look-icons";
import { useQrSource } from "../qr-source";
import { SiteLink } from "../site-link";
import { said } from "./look-front";
import type { PublicService } from "./service-words";
import { formatDuration, servicePriceWords } from "./service-words";
import { focusRing, NoTimesYet, serviceHref } from "./services-cards";

/** The heading over the services no group names (DEC-237). */
export const MENU_MORE = "More";

export interface MenuGroup {
    /** Null: the block has no groups, so the list has no heading. */
    name: string | null;
    services: PublicService[];
}

/**
 * The menu's groups, from what was read: each typed group over its
 * services in the group's own order, then any service no group names under
 * "More". A group whose services are all gone is left out; a service named
 * by two groups shows under the first. No groups typed: one list.
 */
export function menuGroups(
    services: readonly PublicService[],
    groups: RenderedServicesList["groups"],
): MenuGroup[] {
    const typed = groups ?? [];
    if (typed.length === 0) return [{ name: null, services: [...services] }];
    const byId = new Map(services.map((s) => [s.id, s]));
    const placed = new Set<string>();
    const out: MenuGroup[] = [];
    for (const group of typed) {
        const listed: PublicService[] = [];
        for (const id of group.serviceIds) {
            const service = byId.get(id);
            if (!service || placed.has(id)) continue;
            placed.add(id);
            listed.push(service);
        }
        if (listed.length > 0) out.push({ name: group.name, services: listed });
    }
    const rest = services.filter((s) => !placed.has(s.id));
    if (rest.length > 0) out.push({ name: MENU_MORE, services: rest });
    return out;
}

/**
 * The `menu` look (DEC-237, SLServices "Menu"): services under the
 * merchant's headings, read like a salon's price list — the name, a dotted
 * leader, the price, how long under it, and Book on every line as a link
 * (44px under a finger). Two groups across at a desk, one on a phone, where
 * a long name wraps and the price keeps to the right. Descriptions stay
 * off: a menu is scanned for a price.
 */
export function ServicesMenu({
    content,
    services,
    bookHref,
    askHref,
    look,
}: {
    content: RenderedServicesList;
    services: PublicService[];
    bookHref?: string;
    askHref?: string | null;
    look?: LookId;
}) {
    const source = useQrSource();
    const showPrices = content.showPrices !== false;
    const words = said(content.buttonLabel) ?? "Book";
    const groups = menuGroups(services, content.groups);
    return (
        <div
            data-services-menu=""
            className="mt-8 grid gap-x-12 gap-y-6 md:grid-cols-2"
        >
            {groups.map((group, g) => (
                <section key={group.name ?? g} className="min-w-0">
                    {group.name ? (
                        <h3 className="font-site-heading text-site-fg border-site-fg mb-1 border-b-[1.5px] pb-1.5 text-[calc(1.1875rem*var(--site-heading-scale))] font-semibold">
                            {group.name}
                        </h3>
                    ) : null}
                    <ul>
                        {group.services.map((service) => {
                            const price = showPrices
                                ? servicePriceWords(service)
                                : null;
                            const book = (
                                <>
                                    {words}
                                    <LookIcon
                                        name="arrow"
                                        look={look ?? "live"}
                                        size={15}
                                    />
                                </>
                            );
                            return (
                                <li
                                    key={service.id}
                                    className="border-site-border grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 border-b py-1.5 last:border-b-0"
                                >
                                    <span className="flex min-w-0 items-baseline gap-2">
                                        <span className="text-site-fg min-w-0 text-[16px] font-medium [overflow-wrap:anywhere]">
                                            {service.name}
                                        </span>
                                        {price ? (
                                            <>
                                                <span
                                                    aria-hidden="true"
                                                    className="border-site-border min-w-4 flex-1 -translate-y-1 border-b-[1.5px] border-dotted"
                                                />
                                                <span className="text-site-fg shrink-0 whitespace-nowrap text-[16px] font-semibold tabular-nums">
                                                    {price}
                                                </span>
                                            </>
                                        ) : null}
                                    </span>
                                    {bookHref ? (
                                        <SiteLink
                                            href={serviceHref(
                                                bookHref,
                                                service.id,
                                                source,
                                            )}
                                            aria-label={`${words}: ${service.name}`}
                                            className={cn(
                                                "text-site-accent-text row-span-2 inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-sm text-[15px] font-semibold underline-offset-4 hover:underline active:opacity-70",
                                                focusRing,
                                            )}
                                        >
                                            {book}
                                        </SiteLink>
                                    ) : (
                                        // The editor's canvas has no booking
                                        // page: the words show, and go nowhere.
                                        <span className="text-site-accent-text row-span-2 inline-flex min-h-11 items-center gap-1 text-[15px] font-semibold">
                                            {book}
                                        </span>
                                    )}
                                    <span className="text-site-muted col-start-1 flex flex-wrap gap-x-2 text-[13px] leading-snug">
                                        <span>
                                            {formatDuration(
                                                service.durationMinutes,
                                            )}
                                        </span>
                                        <NoTimesYet
                                            service={service}
                                            askHref={askHref}
                                        />
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ))}
        </div>
    );
}
