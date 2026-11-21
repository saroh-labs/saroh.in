import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import { readPages, sectionLabel } from "./change-units";
import { modulePageState } from "./module-pages";
import { reviewerScope } from "./site-access";

/**
 * Where a service shows on a site (website editor plan U47a): the pages,
 * draft and live, whose sections are bound to it by id ("From Services":
 * a services list, a booking block, a Lookbook photo that books it), and
 * whether the booking page offers it. The price sheet (U48) lists these
 * under "Changes it in Services and everywhere it shows".
 *
 * A typed mention of the service is not a use: its price is the check
 * before publish's (`publish-checks.ts`), not something a price change moves.
 *
 * shortcut: a timetable that lists every class (no ids) is not counted; add
 * it when a class's price shows on the timetable.
 */

export interface ServiceUseSection {
    /** The section's key; null for a live page published before keys. */
    key: string | null;
    label: string;
    /** In the draft (shown), and in what is live now. */
    draft: boolean;
    live: boolean;
}

export interface ServiceUsePage {
    /** Null for a live page published before pages carried ids. */
    pageId: string | null;
    title: string;
    path: string;
    sections: ServiceUseSection[];
}

export interface ServiceUses {
    serviceId: string;
    pages: ServiceUsePage[];
    /** The booking page offers it (so do new bills, always). */
    bookingPage: boolean;
}

/** Whether a section's content names the service by id, anywhere in it. Pure. */
export function namesService(content: unknown, serviceId: string): boolean {
    if (Array.isArray(content)) {
        return content.some((item) => namesService(item, serviceId));
    }
    if (content === null || typeof content !== "object") return false;
    const o = content as Record<string, unknown>;
    if (o.serviceId === serviceId) return true;
    if (Array.isArray(o.serviceIds) && o.serviceIds.includes(serviceId)) {
        return true;
    }
    return Object.values(o).some(
        (v) => typeof v === "object" && namesService(v, serviceId),
    );
}

interface DraftPage {
    id: string;
    title: string;
    path: string;
    sections: { key: string; type: string; content: unknown }[];
}

/** The draft's and the live snapshot's uses, page by page. Pure. */
export function serviceUsePages(
    serviceId: string,
    draft: readonly DraftPage[],
    live: unknown,
): ServiceUsePage[] {
    const out: ServiceUsePage[] = draft.map((p) => ({
        pageId: p.id,
        title: p.title,
        path: p.path,
        sections: p.sections
            .filter((s) => namesService(s.content, serviceId))
            .map((s) => ({
                key: s.key,
                label: sectionLabel(s),
                draft: true,
                live: false,
            })),
    }));
    for (const l of live ? readPages(live) : []) {
        let page = out.find((p) =>
            l.id !== null ? p.pageId === l.id : p.path === l.path,
        );
        if (!page) {
            page = { pageId: l.id, title: l.title, path: l.path, sections: [] };
            out.push(page);
        }
        l.sections.forEach((section, i) => {
            const content = (section as { content?: unknown } | null)?.content;
            if (!namesService(content, serviceId)) return;
            const key = l.keys?.[i] ?? null;
            const same =
                key !== null
                    ? page.sections.find((s) => s.key === key)
                    : undefined;
            if (same) same.live = true;
            else {
                page.sections.push({
                    key,
                    label: sectionLabel(section),
                    draft: false,
                    live: true,
                });
            }
        });
    }
    return out.filter((p) => p.sections.length > 0);
}

@Injectable()
export class ServiceUsesService {
    /** `service:read` and `site:read`; a site or service not this business's is a 404. */
    async read(
        ctx: OrganizationContext,
        siteId: string,
        serviceId: string,
    ): Promise<ServiceUses> {
        authorize(ctx, "site:read");
        authorize(ctx, "service:read");
        const organizationId = ctx.organizationId;
        const [site, service] = await Promise.all([
            prisma.site.findFirst({
                where: {
                    id: siteId,
                    organizationId,
                    deletedAt: null,
                    ...reviewerScope(ctx),
                },
                select: {
                    currentPublication: { select: { snapshot: true } },
                    pages: {
                        where: { hidden: false },
                        orderBy: { createdAt: "asc" },
                        select: {
                            id: true,
                            title: true,
                            path: true,
                            versions: {
                                where: { status: "DRAFT" },
                                orderBy: { createdAt: "desc" },
                                take: 1,
                                select: {
                                    sections: {
                                        where: { hidden: false },
                                        orderBy: { order: "asc" },
                                        select: {
                                            key: true,
                                            type: true,
                                            content: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            prisma.service.findFirst({
                where: { id: serviceId, organizationId, deletedAt: null },
                select: { status: true, showOnBookingPage: true },
            }),
        ]);
        if (!site) throw new NotFoundException(`Site "${siteId}" not found`);
        if (!service) {
            throw new NotFoundException(`Service "${serviceId}" not found`);
        }
        const book = await modulePageState("BOOK", organizationId);
        return {
            serviceId,
            pages: serviceUsePages(
                serviceId,
                site.pages.map((p) => ({
                    id: p.id,
                    title: p.title,
                    path: p.path,
                    sections: p.versions.flatMap((v) => v.sections),
                })),
                site.currentPublication?.snapshot ?? null,
            ),
            bookingPage:
                book.state === "on" &&
                service.status === "ACTIVE" &&
                service.showOnBookingPage,
        };
    }
}
