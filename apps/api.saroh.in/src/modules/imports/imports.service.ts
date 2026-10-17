import {
    BadRequestException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { ActivationEvents } from "../analytics/activation-events";
import type { PriceFacts } from "../audit/price-history";
import { productFacts, recordPrices } from "../audit/price-history";
import { planMeter } from "../billing/metering.service";
import { loadPriceTerms } from "../invoices/price-terms";
import { listAt } from "../products/listings.service";
import { sanitizeRichHtml } from "../sites/sanitize";
import {
    assertCurrencyChangeAllowed,
    defaultProductCurrency,
    storefrontCurrency,
} from "../stores/currency";
import { StoresService } from "../stores/stores.service";
import { CsvFormatError, parseCsv } from "./csv";
import type { ApplyImportDto, PreviewImportDto } from "./dto";
import type { ImportEntity } from "./entities";
import { ENTITY_DESCRIPTORS, splitFullName } from "./entities";
import type { ImportPlan, WritableRow } from "./import-plan";
import {
    buildImportPlan,
    isApplicable,
    suggestMapping,
    writableRows,
} from "./import-plan";
import type { ProductMrpContext, StoredProductSums } from "./product-mrp";
import { productMrpIssues } from "./product-mrp";

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

export interface PreviewResult {
    /** Column names in file order, for the mapping step. */
    headers: string[];
    /** The mapping actually used — the caller's, or a suggestion when none was given. */
    mapping: Record<string, string>;
    plan: ImportPlan;
}

export interface ApplyResult {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    /**
     * New products left out because the import was asked to bring in only
     * what the plan has room for (`createAtMost`, UX-036). 0 otherwise.
     */
    overLimit: number;
    plan: ImportPlan;
}

/**
 * Keep the first `most` rows that would add a product, and every update;
 * the rest of the new ones are left out (UX-036: "import the 6 that fit").
 * Archived rows add nothing to the count, as the cap counts (U13).
 */
export function keepFirstNew(
    rows: readonly WritableRow[],
    most: number | undefined,
    adds: (row: WritableRow) => boolean,
): { kept: WritableRow[]; left: number } {
    if (most === undefined) return { kept: [...rows], left: 0 };
    let taken = 0;
    let left = 0;
    const kept = rows.filter((r) => {
        if (!adds(r)) return true;
        if (taken < most) {
            taken += 1;
            return true;
        }
        left += 1;
        return false;
    });
    return { kept, left };
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
    constructor(
        private readonly stores: StoresService,
        // @Optional for the same reason ModuleLifecycleService's is: this
        // service is also constructed directly in DB-backed specs, which pass
        // only what they exercise. Requiring it made every such construction
        // throw on first write. `app.bootstrap.spec` asserts it IS resolved in
        // the real graph, so optional here cannot become silently inert (#176).
        @Optional() private readonly activation?: ActivationEvents,
    ) {}

    async preview(
        storeId: string,
        userId: string,
        entity: ImportEntity,
        dto: PreviewImportDto,
    ): Promise<PreviewResult> {
        const organizationId = await this.requireWrite(storeId, userId);
        return this.plan(storeId, organizationId, entity, dto);
    }

    async apply(
        storeId: string,
        userId: string,
        entity: ImportEntity,
        dto: ApplyImportDto,
    ): Promise<ApplyResult> {
        const organizationId = await this.requireWrite(storeId, userId);
        const { plan } = await this.plan(storeId, organizationId, entity, dto);

        if (!isApplicable(plan)) {
            throw new BadRequestException({
                message:
                    plan.fileIssues.length > 0
                        ? "This file cannot be imported as mapped"
                        : "There is nothing to import",
                // `details` is the one slot the error filter forwards.
                details: { fileIssues: plan.fileIssues },
            });
        }

        let created = 0;
        let updated = 0;

        // New products count toward the plan's cap (U13): the whole file is
        // checked before anything is written, so an import that can't fit
        // is refused whole rather than stopping partway; each chunk checks
        // again on its own transaction. Asked for only what fits
        // (`createAtMost`, UX-036), the new rows past it are left out first.
        const addsProduct = (r: WritableRow) =>
            entity === "products" &&
            r.outcome === "CREATE" &&
            (r.values.status ?? "DRAFT") !== "ARCHIVED";
        const { kept: rows, left: overLimit } = keepFirstNew(
            writableRows(plan),
            entity === "products" ? dto.createAtMost : undefined,
            addsProduct,
        );
        const newProducts = (chunk: readonly WritableRow[]) =>
            chunk.filter(addsProduct).length;
        if (organizationId && newProducts(rows) > 0) {
            await planMeter.assertRoom(organizationId, "products", {
                adding: newProducts(rows),
            });
        }

        for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
            const chunk = rows.slice(i, i + WRITE_CHUNK);
            // One transaction per chunk: a failure rolls back that chunk only,
            // so a large import is not all-or-nothing (§15 asks for a
            // correction path, not an atomic monolith).
            await prisma.$transaction(async (tx) => {
                if (organizationId)
                    await planMeter.roomInTx(tx, organizationId, "products", {
                        adding: newProducts(chunk),
                    });
                for (const row of chunk) {
                    await this.write(
                        tx,
                        storeId,
                        organizationId,
                        entity,
                        row,
                        userId,
                    );
                    if (row.outcome === "CREATE") created += 1;
                    else updated += 1;
                }
            });
        }

        if (organizationId) {
            await this.activation?.importCompleted(organizationId, {
                entity,
                created,
                updated,
                failed: plan.counts.ERROR,
            });
        }

        return {
            created,
            updated,
            skipped: plan.counts.SKIP,
            failed: plan.counts.ERROR,
            overLimit,
            plan,
        };
    }

    /**
     * The columns available to map, for the mapping step, a sample file to
     * start from, and the currency the preview's amounts read in.
     */
    async describe(storeId: string, entity: ImportEntity) {
        const d = ENTITY_DESCRIPTORS[entity];
        const currency =
            entity === "products"
                ? await storefrontCurrency(prisma, storeId)
                : null;
        return {
            entity,
            requiredFields: d.requiredFields,
            mappableFields: d.mappableFields,
            fieldLabels: d.fieldLabels,
            keyLabel: d.keyLabel,
            sample: d.sample,
            currency,
        };
    }

    // ------------------------------------------------------------------

    private async plan(
        storeId: string,
        organizationId: string | null,
        entity: ImportEntity,
        dto: PreviewImportDto,
    ): Promise<PreviewResult> {
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

        // An empty mapping means "you choose": suggest one so the first preview
        // is already informative rather than a wall of missing-field errors.
        // Only a field the import takes: a column sent for another one (an
        // older tab's "currency") is left out, as "Don't import" is.
        const mapping =
            Object.keys(dto.mapping).length > 0
                ? Object.fromEntries(
                      Object.entries(dto.mapping).filter(([, field]) =>
                          descriptor.mappableFields.includes(field),
                      ),
                  )
                : suggestMapping(
                      parsed.headers,
                      descriptor.mappableFields,
                      descriptor.aliases,
                  );

        const policy = dto.policy ?? "SKIP";
        // A product row is also judged against its MRP by the amount to pay
        // (`product-mrp.ts`), with the products the business already has.
        const mrp =
            entity === "products" && organizationId
                ? await this.productMrpContext(storeId, organizationId, policy)
                : null;
        const plan = buildImportPlan({
            records: parsed.records,
            mapping,
            policy,
            existingKeys: mrp
                ? new Set(mrp.existing.keys())
                : await this.existingKeys(storeId, organizationId, entity),
            requiredFields: descriptor.requiredFields,
            fieldLabels: descriptor.fieldLabels,
            normalize: descriptor.normalize,
            keyOf: descriptor.keyOf,
            normalize: descriptor.normalize,
            validateRow: mrp
                ? (values) => {
                      const issues = descriptor.validateRow(values);
                      return issues.length > 0
                          ? issues
                          : productMrpIssues(
                                values,
                                descriptor.keyOf(values),
                                mrp,
                            );
                  }
                : descriptor.validateRow,
        });

        return { headers: parsed.headers, mapping, plan };
    }

    /**
     * What the MRP rule needs of the business to judge a product row: how
     * its prices carry GST, and each product it has by web address (which
     * is also every key a row can collide with).
     */
    private async productMrpContext(
        storeId: string,
        organizationId: string,
        policy: ProductMrpContext["policy"],
    ): Promise<ProductMrpContext> {
        const [rows, terms, currency] = await Promise.all([
            prisma.product.findMany({
                where: { organizationId },
                select: {
                    slug: true,
                    mrp: true,
                    gstRate: true,
                    gstPriceMode: true,
                    currency: true,
                    variants: {
                        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
                        select: { title: true, price: true, mrp: true },
                    },
                },
            }),
            loadPriceTerms(prisma, organizationId),
            // Only for a refusal's sums: the storefront's, else what the
            // business's products are already priced in.
            storefrontCurrency(prisma, storeId),
        ]);
        const existing = new Map<string, StoredProductSums>();
        let pricedIn: string | null = currency;
        for (const r of rows) {
            pricedIn ??= r.currency;
            existing.set(r.slug, {
                mrp: r.mrp?.toString() ?? null,
                gstRate: r.gstRate?.toString() ?? null,
                gstPriceMode: r.gstPriceMode,
                currency: r.currency,
                variants: r.variants.map((v) => ({
                    title: v.title,
                    price: v.price?.toString() ?? null,
                    mrp: v.mrp?.toString() ?? null,
                })),
            });
        }
        return {
            terms,
            policy,
            existing,
            currency: pricedIn ?? "INR",
        };
    }

    private async existingKeys(
        storeId: string,
        organizationId: string | null,
        entity: ImportEntity,
    ): Promise<Set<string>> {
        if (entity === "products") {
            // A product's address is unique in its business (#510): a row
            // whose slug the catalogue has updates that product, whichever
            // storefront sells it (#531).
            if (!organizationId) return new Set();
            const rows = await prisma.product.findMany({
                where: { organizationId },
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
        /** Who ran the import: each row's price history entry names them. */
        userId: string,
    ): Promise<void> {
        const v = row.values;

        if (entity === "products") {
            const slug = row.key;
            const data = {
                name: required(row, "name"),
                // Rendered as HTML on the product page and the shop, so it
                // is cleaned here as every editor save cleans it.
                description: v.description
                    ? sanitizeRichHtml(v.description).trim() || null
                    : null,
                image: v.image ?? null,
                price: required(row, "price"),
                status: v.status ?? "DRAFT",
                // Validated per row as the editor's fields are (UX-065);
                // a blank cell leaves them unset.
                ...(v.mrp?.trim() ? { mrp: v.mrp.trim() } : {}),
                ...(v.gstRate?.trim() ? { gstRate: v.gstRate.trim() } : {}),
                ...(v.hsnCode?.trim()
                    ? { hsnCode: v.hsnCode.replace(/\s+/g, "") }
                    : {}),
            };
            // Every storefront belongs to a business; so does every product.
            if (!organizationId) {
                throw new BadRequestException(
                    "This location is not attached to a business.",
                );
            }
            if (row.outcome === "CREATE") {
                // Left blank: the storefront's currency, else the
                // business's (DEC-030) — never a USD guess.
                const currency =
                    v.currency ??
                    (await defaultProductCurrency(tx, {
                        storeId,
                        organizationId,
                    })) ??
                    undefined;
                // The business's product, sold at this storefront (#510).
                const product = await tx.product.create({
                    data: { storeId, organizationId, slug, currency, ...data },
                    select: { id: true, currency: true },
                });
                await listAt(tx, {
                    organizationId,
                    productId: product.id,
                    storeId,
                });
                // The row's first price history entry.
                await recordPrices(
                    tx,
                    { organizationId, userId },
                    {
                        kind: "PRODUCT",
                        id: product.id,
                        name: data.name,
                        currency: product.currency,
                    },
                    null,
                    productFacts(data),
                    "import",
                );
            } else {
                // The catalogue's product, now also sold here (a listing it
                // already has is kept as it is). A blank currency keeps the
                // product's; another one must suit every storefront that
                // sells it (DEC-030).
                const current = await tx.product.findUniqueOrThrow({
                    where: { organizationId_slug: { organizationId, slug } },
                    select: {
                        id: true,
                        currency: true,
                        price: true,
                        mrp: true,
                        gstRate: true,
                        gstPriceMode: true,
                    },
                });
                if (v.currency && v.currency !== current.currency) {
                    await assertCurrencyChangeAllowed(tx, {
                        productId: current.id,
                        name: data.name,
                        currency: v.currency,
                    });
                }
                const product = await tx.product.update({
                    where: { id: current.id },
                    data: {
                        ...data,
                        ...(v.currency ? { currency: v.currency } : {}),
                    },
                    select: { id: true, currency: true },
                });
                await listAt(tx, {
                    organizationId,
                    productId: product.id,
                    storeId,
                });
                // One entry for the row, when it moved what the product
                // costs: a blank MRP or rate cell leaves that one as it was.
                const was = productFacts(current);
                await recordPrices(
                    tx,
                    { organizationId, userId },
                    {
                        kind: "PRODUCT",
                        id: product.id,
                        name: data.name,
                        currency: product.currency,
                    },
                    was,
                    { ...was, ...setFacts(productFacts(data), data) },
                    "import",
                );
            }
            return;
        }

        const email = row.key;
        // "Full name" splits into first and last (UX-065).
        const c = splitFullName(v);
        const data = {
            firstName: c.firstName ?? null,
            lastName: c.lastName ?? null,
            phone: c.phone ?? null,
            country: c.country ?? null,
            state: c.state ?? null,
            city: c.city ?? null,
            zipCode: c.zipCode ?? null,
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
            throw new NotFoundException("Location not found");
        }
        return writable.organizationId;
    }
}

/**
 * Of a row's facts, only the ones its cells set: a blank MRP or GST rate
 * cell writes nothing, so it is no change.
 */
function setFacts(
    facts: PriceFacts,
    data: { mrp?: string; gstRate?: string },
): Partial<PriceFacts> {
    return {
        price: facts.price,
        ...(data.mrp !== undefined ? { mrp: facts.mrp } : {}),
        ...(data.gstRate !== undefined ? { gstRate: facts.gstRate } : {}),
    };
}
