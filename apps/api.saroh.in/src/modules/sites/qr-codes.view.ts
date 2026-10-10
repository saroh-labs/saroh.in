import { prisma } from "@saroh/database";

import { planMeter } from "../billing/metering.service";
import type { QrPlace, QrStyle, QrTargetKind, QrTargetSite } from "./qr-target";
import { QR_BRANDING_ROW, qrSourceCode, qrTargetLook } from "./qr-target";
import { platformOrigin } from "./site-origin";

/**
 * A site's QR codes as the workspace reads them: each with its short link,
 * what it opens now, and its counts. The one place the read is built, so
 * the list and the answer to every write are the same shape.
 */

/** How many days the list's recent count covers, today included. */
export const QR_RECENT_DAYS = 7;

/** One code as the workspace reads it. */
export interface QrCodeView {
    id: string;
    /** The short id in the link. Never changes. */
    code: string;
    /** `https://<address>.saroh.app/q/<code>`; null: the site has no address. */
    link: string | null;
    target: {
        kind: QrTargetKind;
        /** The product's or page's id; null for the others. */
        ref: string | null;
        /** The product's or page's name, or a plain word for the others. */
        name: string;
        /** Where on the site it opens; null while it can't be opened. */
        path: string | null;
        /** The product or page it named is gone: a scan opens the home page. */
        missing: boolean;
    };
    place: QrPlace;
    placeNote: string | null;
    label: string | null;
    style: QrStyle;
    /** "#rrggbb". */
    color: string;
    retired: boolean;
    retiredAt: string | null;
    createdAt: string;
    updatedAt: string;
    scans: { total: number; last7Days: number };
    /** Made from a page this code opened. */
    bookings: number;
    orders: number;
}

/** A site's codes and what the workspace needs to draw them. */
export interface QrCodesView {
    /** `https://<address>.saroh.app`; null: the site has no Saroh address. */
    origin: string | null;
    /** Whether the short links open now: the site is published there. */
    live: boolean;
    /**
     * Whether the business's plan includes a branded code, print files and
     * scan counts (the `qr-branding` row). The counts below are sent either
     * way; the workspace hides them when this is false. True while nothing
     * enforces plans, as the meter answers.
     */
    included: boolean;
    /** Newest first; retired ones among them. */
    codes: QrCodeView[];
}

/** The site a code belongs to, as the service has read it. */
export interface QrSiteRow extends QrTargetSite {
    subdomain: string | null;
}

/** A code's stored row. */
export interface QrCodeRow {
    id: string;
    code: string;
    targetKind: string;
    targetRef: string | null;
    place: string;
    placeNote: string | null;
    label: string | null;
    style: string;
    color: string;
    retiredAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export const QR_CODE_SELECT = {
    id: true,
    code: true,
    targetKind: true,
    targetRef: true,
    place: true,
    placeNote: true,
    label: true,
    style: true,
    color: true,
    retiredAt: true,
    createdAt: true,
    updatedAt: true,
} as const;

/** The first day of the list's recent window: UTC midnight, six days back. */
export function recentSince(now: Date): Date {
    const day = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    day.setUTCDate(day.getUTCDate() - (QR_RECENT_DAYS - 1));
    return day;
}

/**
 * `rows` as the workspace reads them, with every count. Scans come from the
 * daily rows; bookings and orders from the records that name the code
 * (`sourceCode`, written by the booking and checkout flows).
 */
export async function qrCodesView(
    site: QrSiteRow,
    rows: QrCodeRow[],
): Promise<QrCodesView> {
    const organizationId = site.organizationId;
    const ids = rows.map((r) => r.id);
    const sources = rows.map((r) => qrSourceCode(r));
    const origin = site.subdomain ? platformOrigin(site.subdomain) : null;
    const scansOf = { qrCodeId: { in: ids }, organizationId };
    const none = ids.length === 0;

    const [included, totals, recent, bookings, orders, looks] =
        await Promise.all([
            planMeter.isIncluded(organizationId, QR_BRANDING_ROW),
            none
                ? []
                : prisma.qrScanDay.groupBy({
                      by: ["qrCodeId"],
                      where: scansOf,
                      _sum: { count: true },
                  }),
            none
                ? []
                : prisma.qrScanDay.groupBy({
                      by: ["qrCodeId"],
                      where: {
                          ...scansOf,
                          day: { gte: recentSince(new Date()) },
                      },
                      _sum: { count: true },
                  }),
            none
                ? []
                : prisma.booking.groupBy({
                      by: ["sourceCode"],
                      where: { organizationId, sourceCode: { in: sources } },
                      _count: { _all: true },
                  }),
            none
                ? []
                : prisma.order.groupBy({
                      by: ["sourceCode"],
                      where: { organizationId, sourceCode: { in: sources } },
                      _count: { _all: true },
                  }),
            Promise.all(rows.map((r) => qrTargetLook(prisma, site, r))),
        ]);

    const sum = (
        groups: { qrCodeId: string; _sum: { count: number | null } }[],
    ) => new Map(groups.map((g) => [g.qrCodeId, g._sum.count ?? 0]));
    const made = (
        groups: { sourceCode: string | null; _count: { _all: number } }[],
    ) => new Map(groups.map((g) => [g.sourceCode, g._count._all]));
    const total = sum(totals);
    const last7 = sum(recent);
    const booked = made(bookings);
    const ordered = made(orders);

    return {
        origin,
        live: origin !== null && site.currentPublicationId !== null,
        included,
        codes: rows.map((r, i) => {
            const look = looks[i] ?? { name: "Website", path: null };
            const source = qrSourceCode(r);
            return {
                id: r.id,
                code: r.code,
                link: origin ? `${origin}/q/${r.code}` : null,
                target: {
                    kind: r.targetKind as QrTargetKind,
                    ref: r.targetRef,
                    name: look.name,
                    path: look.path,
                    missing: look.path === null,
                },
                place: r.place as QrPlace,
                placeNote: r.placeNote,
                label: r.label,
                style: r.style as QrStyle,
                color: r.color,
                retired: r.retiredAt !== null,
                retiredAt: r.retiredAt ? r.retiredAt.toISOString() : null,
                createdAt: r.createdAt.toISOString(),
                updatedAt: r.updatedAt.toISOString(),
                scans: {
                    total: total.get(r.id) ?? 0,
                    last7Days: last7.get(r.id) ?? 0,
                },
                bookings: booked.get(source) ?? 0,
                orders: ordered.get(source) ?? 0,
            };
        }),
    };
}
