import {
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import type { OrganizationContext } from "../../common/types/organization-context";
import { planMeter } from "../billing/metering.service";
import { authorize } from "../organizations/organization-policy";
import type { CreateQrCodeDto, UpdateQrCodeDto } from "./qr-codes.dto";
import type {
    QrCodeRow,
    QrCodesView,
    QrCodeView,
    QrSiteRow,
} from "./qr-codes.view";
import { QR_CODE_SELECT, qrCodesView } from "./qr-codes.view";
import {
    newQrCode,
    QR_BRANDING_ROW,
    QR_CODE_ATTEMPTS,
    QR_INK,
    qrCodeLength,
} from "./qr-target";
import { checkedQrColor, checkedQrTarget } from "./qr-target-check";
import { assertSiteInOrg } from "./site-access";

export type { QrCodesView, QrCodeView } from "./qr-codes.view";

/**
 * A site's QR codes, for the workspace: make one, list them with their
 * scans, point one somewhere new, retire one.
 *
 * - A code is a short link on the site's Saroh address
 *   (`<address>.saroh.app/q/<code>`), never the custom domain: the Saroh
 *   address forwards after a change and can't lapse (DEC-069).
 * - What it opens is checked when it is saved, against what the site has
 *   now (`qr-target-check.ts`), and worked out again on every scan
 *   (`qr-target.ts`).
 * - A plain code is on every plan. A branded one is the `qr-branding`
 *   catalogue row; a business that moved down keeps the branded codes it
 *   made and can still re-point or retire them.
 * - A code is retired, never deleted: paper outlives the row. Its scans
 *   stay, and a scan of it forwards to the home page.
 */

/** How many codes one site holds. A bound on the table, not a plan limit. */
export const QR_CODES_PER_SITE_MAX = 500;

@Injectable()
export class QrCodesService {
    /** The site's codes with their counts. `site:read`. */
    async list(ctx: OrganizationContext, siteId: string): Promise<QrCodesView> {
        authorize(ctx, "site:read");
        const site = await this.site(ctx, siteId);
        const rows = await prisma.qrCode.findMany({
            where: { siteId, organizationId: ctx.organizationId },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: QR_CODE_SELECT,
        });
        return qrCodesView(site, rows);
    }

    /** Make a code. `site:update`. */
    async create(
        ctx: OrganizationContext,
        siteId: string,
        dto: CreateQrCodeDto,
    ): Promise<QrCodeView> {
        authorize(ctx, "site:update");
        const site = await this.site(ctx, siteId);
        const organizationId = ctx.organizationId;

        const color = checkedQrColor(dto.color ?? QR_INK);
        const style = dto.style ?? "PLAIN";
        if (style === "BRANDED") {
            await planMeter.assertIncluded(organizationId, QR_BRANDING_ROW);
        }
        const target = await checkedQrTarget(
            site,
            dto.targetKind,
            dto.targetRef ?? null,
        );

        const held = await prisma.qrCode.count({
            where: { siteId, organizationId },
        });
        if (held >= QR_CODES_PER_SITE_MAX) {
            throw new ConflictException({
                message:
                    "This site has as many QR codes as it can hold. Point one you no longer use somewhere new.",
                details: { reason: "too-many" },
            });
        }

        const data = {
            siteId,
            organizationId,
            targetKind: target.kind,
            targetRef: target.ref,
            place: dto.place,
            placeNote: dto.placeNote ?? null,
            label: dto.label ?? null,
            style,
            color,
        };
        // The id is unique per site, so a clash is only ever with this
        // business's own codes: try another, a little longer each few tries.
        for (let attempt = 0; attempt < QR_CODE_ATTEMPTS; attempt++) {
            try {
                const row = await prisma.qrCode.create({
                    data: { ...data, code: newQrCode(qrCodeLength(attempt)) },
                    select: QR_CODE_SELECT,
                });
                return await this.one(site, row);
            } catch (error) {
                if (prismaErrorCode(error) !== "P2002") throw error;
            }
        }
        throw new ConflictException({
            message: "We couldn't make a code just now. Try again.",
            details: { reason: "no-free-code" },
        });
    }

    /**
     * Point a code somewhere new, or change where it is placed, its label,
     * style or colour. Its short id and link never change. `site:update`.
     */
    async update(
        ctx: OrganizationContext,
        siteId: string,
        qrCodeId: string,
        dto: UpdateQrCodeDto,
    ): Promise<QrCodeView> {
        authorize(ctx, "site:update");
        const site = await this.site(ctx, siteId);
        const organizationId = ctx.organizationId;
        const existing = await this.code(organizationId, siteId, qrCodeId);
        if (existing.retiredAt) {
            throw new ConflictException({
                message: "This code is retired, so it can't be changed.",
                details: { reason: "retired" },
            });
        }

        const data: {
            targetKind?: string;
            targetRef?: string | null;
            place?: string;
            placeNote?: string | null;
            label?: string | null;
            style?: string;
            color?: string;
        } = {};
        if (dto.color) data.color = checkedQrColor(dto.color);
        if (dto.style) {
            // Going branded is the plan's to allow. A code that already is
            // stays so, whatever the plan is now.
            if (dto.style === "BRANDED" && existing.style !== "BRANDED") {
                await planMeter.assertIncluded(organizationId, QR_BRANDING_ROW);
            }
            data.style = dto.style;
        }
        if (dto.targetKind) {
            const target = await checkedQrTarget(
                site,
                dto.targetKind,
                dto.targetRef ?? null,
            );
            data.targetKind = target.kind;
            data.targetRef = target.ref;
        }
        if (dto.place) data.place = dto.place;
        if (dto.placeNote !== undefined) data.placeNote = dto.placeNote;
        if (dto.label !== undefined) data.label = dto.label;

        await prisma.qrCode.updateMany({
            where: { id: qrCodeId, siteId, organizationId },
            data,
        });
        return this.one(
            site,
            await this.code(organizationId, siteId, qrCodeId),
        );
    }

    /**
     * Retire a code: it stops counting and a scan of it opens the home
     * page. Its scans are kept. Retiring one already retired changes
     * nothing. `site:update`.
     */
    async retire(
        ctx: OrganizationContext,
        siteId: string,
        qrCodeId: string,
    ): Promise<QrCodeView> {
        authorize(ctx, "site:update");
        const site = await this.site(ctx, siteId);
        const organizationId = ctx.organizationId;
        const existing = await this.code(organizationId, siteId, qrCodeId);
        if (!existing.retiredAt) {
            await prisma.qrCode.updateMany({
                where: {
                    id: qrCodeId,
                    siteId,
                    organizationId,
                    retiredAt: null,
                },
                data: { retiredAt: new Date() },
            });
        }
        return this.one(
            site,
            await this.code(organizationId, siteId, qrCodeId),
        );
    }

    /** The site, proved to be this business's; another's is a 404. */
    private async site(
        ctx: OrganizationContext,
        siteId: string,
    ): Promise<QrSiteRow> {
        await assertSiteInOrg(ctx, siteId);
        const site = await prisma.site.findFirst({
            where: {
                id: siteId,
                organizationId: ctx.organizationId,
                deletedAt: null,
            },
            select: {
                id: true,
                organizationId: true,
                subdomain: true,
                storefrontId: true,
                currentPublicationId: true,
            },
        });
        if (!site) throw new NotFoundException(`Site "${siteId}" not found`);
        return site;
    }

    /** One of the site's codes; another site's or business's is a 404. */
    private async code(
        organizationId: string,
        siteId: string,
        qrCodeId: string,
    ): Promise<QrCodeRow> {
        const row = await prisma.qrCode.findFirst({
            where: { id: qrCodeId, siteId, organizationId },
            select: QR_CODE_SELECT,
        });
        if (!row) throw new NotFoundException("QR code not found");
        return row;
    }

    /** One row as the workspace reads it. */
    private async one(site: QrSiteRow, row: QrCodeRow): Promise<QrCodeView> {
        return (await qrCodesView(site, [row])).codes[0];
    }
}
