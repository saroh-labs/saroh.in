import { Prisma, prisma, runInOrgContext } from "@saroh/database";

/**
 * What "Download your data" puts in its zip, one CSV per table (owner,
 * 9 Oct, DEC-117): the business's own records, every column a person can
 * read, keyed by the same ids the files share (an order line's `orderId`,
 * a booking's `contactId`), so a spreadsheet can join them.
 *
 * Each file is every scalar column of its table as the schema has it
 * (`Prisma.dmmf`), so a column added later is in the next export without
 * a change here. Left out: what isn't the business's to read — hashes,
 * tokens, keys and the idempotency keys our own retries use
 * ({@link isOmitted}).
 *
 * Why not the Orders screen's Export: that builds its CSV in the browser
 * from the list's pages (`lib/orders/export.ts`), and each page of the
 * list's read counts every order again (`order-list.ts`), so a whole
 * business read through it would take a time that grows with the square
 * of its orders. Here each table is read in pages by id
 * ({@link EXPORT_PAGE_SIZE}), so memory and time grow with the rows only.
 */
export interface ExportTable {
    /** The file's name in the zip. */
    file: string;
    /** The Prisma model it reads. */
    model: Prisma.ModelName;
    /** Its rows of this business, never another's. */
    where: (organizationId: string) => Record<string, unknown>;
}

const OWN = (organizationId: string) => ({ organizationId });

export const EXPORT_TABLES: readonly ExportTable[] = [
    { file: "customers.csv", model: "Contact", where: OWN },
    { file: "location-customers.csv", model: "Customer", where: OWN },
    { file: "orders.csv", model: "Order", where: OWN },
    {
        file: "order-lines.csv",
        model: "OrderItem",
        where: (organizationId) => ({ order: { organizationId } }),
    },
    // Credit notes are invoices of kind CREDIT_NOTE (`kind` says which).
    { file: "invoices-and-credit-notes.csv", model: "Invoice", where: OWN },
    { file: "invoice-lines.csv", model: "InvoiceLine", where: OWN },
    { file: "payments.csv", model: "PaymentIntent", where: OWN },
    { file: "refunds.csv", model: "PaymentRefund", where: OWN },
    { file: "bookings.csv", model: "Booking", where: OWN },
    { file: "services.csv", model: "Service", where: OWN },
    { file: "products.csv", model: "Product", where: OWN },
    {
        file: "product-variants.csv",
        model: "ProductVariant",
        where: (organizationId) => ({ product: { organizationId } }),
    },
    { file: "stock.csv", model: "StockLevel", where: OWN },
    { file: "locations.csv", model: "Store", where: OWN },
    { file: "membership-plans.csv", model: "SubscriptionPlan", where: OWN },
    { file: "memberships.csv", model: "CustomerSubscription", where: OWN },
    { file: "class-packs.csv", model: "ClassPack", where: OWN },
    { file: "class-pack-purchases.csv", model: "PackPurchase", where: OWN },
    { file: "courses.csv", model: "Course", where: OWN },
    { file: "course-enrolments.csv", model: "CourseEnrollment", where: OWN },
    { file: "leads.csv", model: "Lead", where: OWN },
    { file: "enquiries.csv", model: "Submission", where: OWN },
];

/** Rows read at a time: memory stays flat whatever the business's size. */
export const EXPORT_PAGE_SIZE = 500;

const OMITTED_NAMES = new Set([
    "checkoutKey",
    "idempotencyKey",
    "encryptedCredentials",
    "credentialsIv",
    "credentialsAuthTag",
]);

/** A column that isn't the business's to read: a hash, token or key. */
export function isOmitted(field: string): boolean {
    return (
        OMITTED_NAMES.has(field) ||
        /(Hash|Token|Secret)$/.test(field) ||
        /^(token|secret|password)/i.test(field)
    );
}

interface Column {
    name: string;
    /** Free text a person typed (a name, a note): guarded in a sheet. */
    text: boolean;
}

/** The table's columns, in the schema's order, less {@link isOmitted}. */
export function columnsOf(model: Prisma.ModelName): Column[] {
    const found = Prisma.dmmf.datamodel.models.find((m) => m.name === model);
    if (!found) throw new Error(`No model ${model} in the schema`);
    return found.fields
        .filter((f) => f.kind === "scalar" || f.kind === "enum")
        .filter((f) => !isOmitted(f.name))
        .map((f) => ({
            name: f.name,
            text: f.kind === "enum" || f.type === "String",
        }));
}

/**
 * One CSV field, quoted when it has to be. Text that a spreadsheet would
 * run as a formula (it starts with `=`, `+`, `-`, `@`, a tab or a return)
 * is kept as text with a leading `'` — a customer's name is never run in
 * the owner's sheet. Numbers, dates and money are written as they are.
 */
export function csvCell(value: unknown, text = false): string {
    let out: string;
    if (value === null || value === undefined) out = "";
    else if (value instanceof Date) out = value.toISOString();
    else if (Array.isArray(value)) {
        out = value.map((v) => csvValue(v)).join("; ");
        text = true;
    } else out = csvValue(value);
    if (text && /^[=+\-@\t\r]/.test(out)) out = `'${out}`;
    return /[",\n\r]/.test(out) ? `"${out.replace(/"/g, '""')}"` : out;
}

function csvValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") {
        // A Decimal prints its exact value; JSON prints as JSON.
        return Prisma.Decimal.isDecimal(value)
            ? value.toString()
            : JSON.stringify(value);
    }
    if (typeof value === "string") return value;
    if (
        typeof value === "number" ||
        typeof value === "boolean" ||
        typeof value === "bigint"
    ) {
        return String(value);
    }
    return "";
}

export function csvLine(values: string[]): string {
    return `${values.join(",")}\r\n`;
}

interface Delegate {
    findMany(args: {
        where: Record<string, unknown>;
        select: Record<string, true>;
        orderBy: { id: "asc" };
        take: number;
        skip?: number;
        cursor?: { id: string };
    }): Promise<Record<string, unknown>[]>;
}

function delegateOf(model: Prisma.ModelName): Delegate {
    const key = model.charAt(0).toLowerCase() + model.slice(1);
    return (prisma as unknown as Record<string, Delegate>)[key];
}

/**
 * A table's CSV, a page at a time: the header, then {@link EXPORT_PAGE_SIZE}
 * rows per chunk, read by id under the business's own row-level context.
 * `onRows` hears how many rows each page had.
 */
export async function* tableCsv(
    table: ExportTable,
    organizationId: string,
    onRows: (count: number) => void = () => undefined,
): AsyncGenerator<string> {
    const columns = columnsOf(table.model);
    const select = Object.fromEntries(
        columns.map((c) => [c.name, true as const]),
    );
    if (!("id" in select)) throw new Error(`${table.model} has no id`);
    yield csvLine(columns.map((c) => csvCell(c.name)));
    const delegate = delegateOf(table.model);
    let after: string | null = null;
    for (;;) {
        const rows: Record<string, unknown>[] = await runInOrgContext(
            organizationId,
            () =>
                delegate.findMany({
                    where: table.where(organizationId),
                    select,
                    orderBy: { id: "asc" },
                    take: EXPORT_PAGE_SIZE,
                    ...(after ? { skip: 1, cursor: { id: after } } : {}),
                }),
        );
        if (rows.length === 0) return;
        onRows(rows.length);
        yield rows
            .map((row) =>
                csvLine(columns.map((c) => csvCell(row[c.name], c.text))),
            )
            .join("");
        if (rows.length < EXPORT_PAGE_SIZE) return;
        after = String(rows[rows.length - 1].id);
    }
}
