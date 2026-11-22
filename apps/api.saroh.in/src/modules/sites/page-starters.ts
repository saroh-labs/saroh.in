import type { Prisma } from "@saroh/database";
import { parseSectionContent } from "@saroh/database";

import { offeredOnSite } from "../bookings/public-booking-page";
import type { DefaultSection } from "./module-page-sections";

/**
 * New page types (A7, DEC-246): Service detail, Offer and Our team. Each is
 * an ordinary free-form page that starts with sections filled from the
 * business, which the merchant then edits like any other. Not a page kind:
 * a site may have many of each, at any link, and nothing routes on them.
 *
 * - Service detail: a top of the page, what's included, the service's
 *   price read live from Services, a booking form for it, and a question.
 * - Offer: a top of the page, the services in it (read live), and a Book
 *   button to the Book page. It does not read Discount: a discount code is
 *   for the shop's checkout and never applies to a booking.
 * - Our team: a top of the page and the people who switched "Show on Our
 *   team" on (DEC-246), name and role only; staff carry no photo. Nobody
 *   is shown who did not opt in. The names are copied in when the page is
 *   made, so a person who switches it off later is taken off by hand.
 *
 * Sample words are plain and claim nothing (no "free", no figures). Every
 * section is checked against its contract, so a page never starts with
 * one publish would refuse.
 */
export const PAGE_STARTERS = ["SERVICE", "OFFER", "TEAM"] as const;
export type PageStarter = (typeof PAGE_STARTERS)[number];

/** How many services an Offer starts with. */
const OFFER_SERVICES = 3;
/** Our team's people: the block's own person plus its `people`. */
const TEAM_MAX = 12;

type Tx = Pick<Prisma.TransactionClient, "service" | "staffMember" | "page">;

function checked(section: DefaultSection): DefaultSection {
    const parsed = parseSectionContent(
        section.type,
        section.contractVersion,
        section.content,
    );
    if (!parsed.success) {
        throw new Error(
            `Page starter "${section.type}" is invalid: ${parsed.error.message}`,
        );
    }
    return { ...section, content: parsed.data as Record<string, unknown> };
}

const CARDS = {
    showPrices: true,
    layout: "cards",
    showDescriptions: true,
} as const;

/** The people a team page may show: active, and opted in. */
export function teamPageWhere(organizationId: string) {
    return {
        organizationId,
        status: "ACTIVE",
        showOnTeamPage: true,
    } as const;
}

export async function starterSections(
    tx: Tx,
    input: {
        organizationId: string;
        siteId: string;
        title: string;
        starter: PageStarter;
    },
): Promise<DefaultSection[]> {
    const { organizationId, siteId, title, starter } = input;
    const hero = (subheading: string, pageId?: string) =>
        checked({
            type: "hero",
            contractVersion: 2,
            content: {
                heading: title,
                subheading,
                ...(pageId
                    ? {
                          cta: {
                              label: "Book",
                              action: { kind: "page", pageId },
                          },
                      }
                    : {}),
            },
        });
    const bookPage = await tx.page.findFirst({
        where: { siteId, kind: "BOOK" },
        select: { id: true },
    });

    switch (starter) {
        case "SERVICE": {
            const service = await tx.service.findFirst({
                where: offeredOnSite(organizationId, siteId),
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                select: { id: true },
            });
            return [
                hero("Say who it is for and what they leave with."),
                checked({
                    type: "richText",
                    contractVersion: 1,
                    content: {
                        format: "html",
                        value: "<h2>What’s included</h2><p>Say what happens, step by step, and how long it takes.</p>",
                    },
                }),
                ...(service
                    ? [
                          checked({
                              type: "servicesList",
                              contractVersion: 1,
                              content: {
                                  heading: "Price",
                                  serviceIds: [service.id],
                                  ...CARDS,
                                  showBook: false,
                              },
                          }),
                          checked({
                              type: "booking",
                              contractVersion: 1,
                              content: { serviceId: service.id },
                          }),
                          checked({
                              type: "faq",
                              contractVersion: 1,
                              content: {
                                  heading: "Questions",
                                  items: [
                                      {
                                          question: "How do I book?",
                                          answer: "Pick a time above, and we confirm it by message.",
                                      },
                                  ],
                              },
                          }),
                      ]
                    : []),
            ];
        }
        case "OFFER": {
            const services = await tx.service.findMany({
                where: offeredOnSite(organizationId, siteId),
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                take: OFFER_SERVICES,
                select: { id: true },
            });
            return [
                hero("Say what the offer is, and until when.", bookPage?.id),
                ...(services.length > 0
                    ? [
                          checked({
                              type: "servicesList",
                              contractVersion: 1,
                              content: {
                                  heading: "In this offer",
                                  serviceIds: services.map((s) => s.id),
                                  ...CARDS,
                              },
                          }),
                      ]
                    : []),
            ];
        }
        case "TEAM": {
            const people = await tx.staffMember.findMany({
                where: teamPageWhere(organizationId),
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                take: TEAM_MAX,
                select: { name: true, title: true },
            });
            const [first, ...rest] = people;
            const person = (p: { name: string; title: string | null }) => ({
                name: p.name,
                ...(p.title ? { role: p.title } : {}),
            });
            return [
                hero("The people you will meet.", bookPage?.id),
                ...(people.length > 0
                    ? [
                          checked({
                              type: "person",
                              contractVersion: 1,
                              content: {
                                  variant: "team",
                                  title: "Our team",
                                  ...person(first),
                                  ...(rest.length > 0
                                      ? { people: rest.map(person) }
                                      : {}),
                              },
                          }),
                      ]
                    : []),
            ];
        }
    }
}
