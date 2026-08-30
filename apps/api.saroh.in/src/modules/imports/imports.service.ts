import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { StoresService } from "../stores/stores.service";
import { CsvFormatError, parseCsv } from "./csv";
import type { ApplyImportDto, PreviewImportDto } from "./dto";
import type { ImportEntity } from "./entities";
import { ENTITY_DESCRIPTORS } from "./entities";
import type { ImportPlan, WritableRow } from "./import-plan";
import { buildImportPlan, isApplicable, writableRows } from "./import-plan";

/** How many rows are written per transaction. */
const WRITE_CHUNK = 200;

/**
 * Read a field the plan has already guaranteed is present.
 *
 * Only rows that passed the required-field check are writable, so an absent
 * value here means the planner and the descriptor disagree about what is
 * required — a bug on our side, not bad input from the merchant. It therefore
 * throws rather than producing a validation message.
 */
function required(row: WritableRow, field: string): string {
    const value = row.values[field];
    if (value === undefined) {
        throw new Error(
            `Planned row ${row.row} is missing required field "${field}"`,
        );
    }
    return value;
}

export interface ApplyResult {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    plan: ImportPlan;
}

/**
 * CSV import (#175).
 *
 * `PRODUCT_STRATEGY.md` §15 requires preview, validation, useful error
 * messages, duplicate handling and a safe correction path — and treats
 * migration UX as part of activation rather than an afterthought.
 *
 * Preview and apply run the SAME planner over the SAME file. The client never
 * sends back a plan to execute; it sends the file again and the plan is
 * recomputed, so an approved preview and the executed writes cannot diverge.
 */
@Injectable()
export class ImportsService {
    constructor(private readonly stores: StoresService) {}

    async preview(
        storeId: string,
        userId: string,
        entity: ImportEntity,
        dto: PreviewImportDto,
    ): Promise<ImportPlan> {
        await this.requireWrite(storeId, userId);
        return this.plan(storeId, entity, dto);
    }

    async apply(
        storeId: string,
        userId: string,
        entity: ImportEntity,
        dto: ApplyImportDto,
    ): Promise<ApplyResult> {
        const organizationId = await this.requireWrite(storeId, userId);
        const plan = await this.plan(storeId, entity, dto);

        if (!isApplicable(plan)) {
            throw new BadRequestException({
                message:
                    plan.fileIssues.length > 0
                        ? "This file cannot be imported as mapped"
                        : "There is nothing to import",
                fileIssues: plan.fileIssues,
            });
        }

        const rows = writableRows(plan);
        let created = 0;
        let updated = 0;

        for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
            const chunk = rows.slice(i, i + WRITE_CHUNK);
            // One transaction per chunk: a failure rolls back that chunk only,
            // so a large import is not all-or-nothing (§15 asks for a
            // correction path, not an atomic monolith).
            await prisma.$transaction(async (tx) => {
                for (const row of chunk) {
                    await this.write(tx, storeId, organizationId, entity, row);
                    if (row.outcome === "CREATE") created += 1;
                    else updated += 1;
                }
            });
        }

        return {
            created,
            updated,
            skipped: plan.counts.SKIP,
            failed: plan.counts.ERROR,
            plan,
        };
    }

    /** The columns available to map, for the mapping step. */
    describe(entity: ImportEntity) {
        const d = ENTITY_DESCRIPTORS[entity];
        return {
            entity,
            requiredFields: d.requiredFields,
            mappableFields: d.mappableFields,
            keyLabel: d.keyLabel,
        };
    }

    // ------------------------------------------------------------------

    private async plan(
        storeId: string,
        entity: ImportEntity,
        dto: PreviewImportDto,
    ): Promise<ImportPlan> {
        const descriptor = ENTITY_DESCRIPTORS[entity];

        let parsed;
        try {
            parsed = await parseCsv(dto.csv);
        } catch (err) {
            if (err instanceof CsvFormatError) {
                throw new BadRequestException({
                    message: err.message,
                    field: "csv",
                });
            }
            throw err;
        }

        return buildImportPlan({
            records: parsed.records,
            mapping: dto.mapping,
            policy: dto.policy ?? "SKIP",
            existingKeys: await this.existingKeys(storeId, entity),
            requiredFields: descriptor.requiredFields,
            keyOf: descriptor.keyOf,
            validateRow: descriptor.validateRow,
        });
    }

    private async existingKeys(
        storeId: string,
        entity: ImportEntity,
    ): Promise<Set<string>> {
        if (entity === "products") {
            const rows = await prisma.product.findMany({
                where: { storeId },
                select: { slug: true },
            });
            return new Set(rows.map((r) => r.slug));
        }
        const rows = await prisma.customer.findMany({
            where: { storeId },
            select: { email: true },
        });
        return new Set(rows.map((r) => r.email.toLowerCase()));
    }

    private async write(
        tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
        storeId: string,
        organizationId: string | null,
        entity: ImportEntity,
        row: WritableRow,
    ): Promise<void> {
        const v = row.values;

        if (entity === "products") {
            const slug = row.key;
            const data = {
                name: required(row, "name"),
                description: v.description ?? null,
                image: v.image ?? null,
                price: required(row, "price"),
                currency: v.currency ?? "USD",
                status: v.status ?? "DRAFT",
            };
            if (row.outcome === "CREATE") {
                // organizationId is stamped here for the same reason as #173:
                // a NULL is invisible to org-scoped queries and to RLS.
                await tx.product.create({
                    data: { storeId, organizationId, slug, ...data },
                });
            } else {
                await tx.product.update({
                    where: { storeId_slug: { storeId, slug } },
                    data,
                });
            }
            return;
        }

        const email = row.key;
        const data = {
            firstName: v.firstName ?? null,
            lastName: v.lastName ?? null,
            phone: v.phone ?? null,
            country: v.country ?? null,
            state: v.state ?? null,
            city: v.city ?? null,
            zipCode: v.zipCode ?? null,
        };
        if (row.outcome === "CREATE") {
            await tx.customer.create({
                data: { storeId, organizationId, email, ...data },
            });
        } else {
            await tx.customer.update({
                where: { storeId_email: { storeId, email } },
                data,
            });
        }
    }

    private async requireWrite(
        storeId: string,
        userId: string,
    ): Promise<string | null> {
        const writable = await this.stores.writableOrganization(
            storeId,
            userId,
        );
        if (writable === null) {
            throw new NotFoundException("Store not found");
        }
        return writable.organizationId;
    }
}
