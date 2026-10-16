import { plainToInstance } from "class-transformer";
import type { ValidationError } from "class-validator";
import { validateSync } from "class-validator";

import { CreateCustomerDto } from "../customers/dto";
import { isGstRate } from "../invoices/gst";
import type { ProductStatus } from "../products/dto";
import { CreateProductDto, PRODUCT_STATUSES } from "../products/dto";
import { slugify } from "../stores/slug";
import type { ImportValues, RowIssue } from "./import-plan";

/**
 * What can be imported, and the rules for each (#175).
 *
 * Row validation reuses the CREATE DTOs rather than restating their rules, so
 * an import can never accept a row the manual form would reject — and the two
 * produce the *same* message for the same mistake. Restating them would leave
 * the copies free to drift, which is how "it imported but the form says it is
 * invalid" happens.
 */

export const IMPORT_ENTITIES = ["products", "customers"] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

export function isImportEntity(value: string): value is ImportEntity {
    return (IMPORT_ENTITIES as readonly string[]).includes(value);
}

/** Flatten class-validator's nested errors into row issues. */
function toIssues(errors: ValidationError[]): Omit<RowIssue, "row">[] {
    return errors.flatMap((e) => {
        const messages = Object.values(e.constraints ?? {});
        const nested = e.children?.length ? toIssues(e.children) : [];
        return [
            ...messages.map((message) => ({ field: e.property, message })),
            ...nested,
        ];
    });
}

function validateWith<T extends object>(
    cls: new () => T,
    values: ImportValues,
): Omit<RowIssue, "row">[] {
    // `whitelist` is deliberately off: unmapped columns were already dropped by
    // applyMapping, so anything present here is a field we chose to map.
    const instance = plainToInstance(cls, values);
    return toIssues(validateSync(instance, { skipMissingProperties: false }));
}

/**
 * How a spreadsheet writes a product's status, in the words the products
 * list uses (Draft · Live · Archived) and the ones other tools export.
 */
const STATUS_WORDS: Readonly<Record<string, ProductStatus>> = {
    draft: "DRAFT",
    live: "PUBLISHED",
    active: "PUBLISHED",
    published: "PUBLISHED",
    archived: "ARCHIVED",
    hidden: "ARCHIVED",
};

/** A status in any case, or the cell as written when it is none of them. */
export function normalizeStatus(raw: string): string {
    const trimmed = raw.trim();
    return STATUS_WORDS[trimmed.toLowerCase()] ?? trimmed;
}

/** 1,299 and 1,20,000 — thousands commas, the western way or the Indian. */
const GROUPED = /^-?(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d+)?$/;

/**
 * An amount as a spreadsheet writes it: "₹1,299", "Rs. 450", "450.00 ".
 * The rupee sign and thousands commas go; anything else is left for the
 * check to name.
 */
export function normalizeMoney(raw: string): string {
    const bare = raw
        .trim()
        .replace(/^(?:₹|rs\.?|inr)\s*/i, "")
        .replace(/\s*\/-$/, "")
        .trim();
    return GROUPED.test(bare) ? bare.replace(/,/g, "") : bare;
}

/** Why an amount can't be written, in the merchant's words; null when it can. */
function moneyProblem(label: string, value: string): string | null {
    if (/^-\d+(?:\.\d+)?$/.test(value)) {
        return `${label} can't be less than 0.`;
    }
    if (!/^\d+(?:\.\d+)?$/.test(value)) return `${label} isn't a number.`;
    if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
        return `${label} has more than 2 decimals.`;
    }
    return null;
}

const PRODUCT_LABELS = {
    name: "Name",
    slug: "Path",
    description: "Description",
    image: "Photo link",
    price: "Price",
    status: "Status: Draft, Live or Archived",
    mrp: "MRP",
    gstRate: "GST rate (%)",
    hsnCode: "HSN code",
} as const;

/** A field's short name inside a sentence ("Status", not its whole label). */
function shortLabel(field: string): string {
    return field === "status"
        ? "Status"
        : ((PRODUCT_LABELS as Record<string, string>)[field] ?? field);
}

/**
 * The DTO's messages are the product form's; a few are written for a
 * developer ("description must be shorter than or equal to 5000
 * characters"). Those are said in the merchant's words.
 */
function productMessage(issue: Omit<RowIssue, "row">): Omit<RowIssue, "row"> {
    const field = issue.field ?? "";
    if (field === "slug") {
        return {
            field,
            message: "Path uses only lower-case letters, numbers and hyphens.",
        };
    }
    if (!issue.message.startsWith(`${field} `)) return issue;
    const longest = /shorter than or equal to (\d+)/.exec(issue.message);
    return {
        field,
        message: longest
            ? `${shortLabel(field)} is longer than ${longest[1]} characters.`
            : `${shortLabel(field)} can't be read. Check it in your file.`,
    };
}

export interface EntityDescriptor {
    /** Domain fields a row cannot be written without. */
    requiredFields: readonly string[];
    /** Every field a column may be mapped to, for the mapping UI. */
    mappableFields: readonly string[];
    /**
     * What the mapping step calls each field (UX-065): "First name", not
     * `firstName`. Every mappable field has one.
     */
    fieldLabels: Readonly<Record<string, string>>;
    /**
     * Other headings a column is matched on when the file is first read,
     * normalized ("fullname", "pincode") → the field.
     */
    aliases: Readonly<Record<string, string>>;
    /** Human label for the natural key, used in preview copy. */
    keyLabel: string;
    keyOf: (values: ImportValues) => string | null;
    validateRow: (values: ImportValues) => Omit<RowIssue, "row">[];
    /** Forgive how a spreadsheet writes a value, before it is judged. */
    normalize?: (values: ImportValues) => ImportValues;
    /**
     * A file to start from: the headings, then example rows. Every heading
     * is matched to its field when the file comes back (entities.spec).
     */
    sample: readonly (readonly string[])[];
}

/**
 * A customer's "Full name" column split into first and last name (UX-065):
 * the first word, then the rest. A file that maps first and last name
 * itself keeps them; the full name never overwrites them.
 */
export function splitFullName(values: ImportValues): ImportValues {
    const { name, ...rest } = values;
    const full = (name ?? "").trim().replace(/\s+/g, " ");
    if (!full || rest.firstName !== undefined || rest.lastName !== undefined) {
        return rest;
    }
    const [first, ...others] = full.split(" ");
    return {
        ...rest,
        firstName: first,
        ...(others.length > 0 ? { lastName: others.join(" ") } : {}),
    };
}

export const ENTITY_DESCRIPTORS: Record<ImportEntity, EntityDescriptor> = {
    products: {
        requiredFields: ["name", "price"],
        // No currency: a business sells in one (DEC-030), so a product
        // takes its storefront's and a form never asks which.
        mappableFields: [
            "name",
            "price",
            "mrp",
            "gstRate",
            "hsnCode",
            "status",
            "description",
            "slug",
            "image",
        ],
        fieldLabels: PRODUCT_LABELS,
        aliases: {
            title: "name",
            productname: "name",
            item: "name",
            itemname: "name",
            path: "slug",
            url: "slug",
            webaddress: "slug",
            photo: "image",
            photolink: "image",
            imageurl: "image",
            image: "image",
            sellingprice: "price",
            saleprice: "price",
            rate: "price",
            gst: "gstRate",
            gstpercent: "gstRate",
            gstrate: "gstRate",
            hsn: "hsnCode",
            hsncode: "hsnCode",
            maximumretailprice: "mrp",
        },
        keyLabel: "the product's name",
        // Mirrors ProductsService.create: an explicit slug wins, otherwise it is
        // derived from the name. Unique per business (@@unique([organizationId, slug])).
        keyOf: (v) => {
            const slug = slugify(v.slug ?? v.name ?? "");
            return slug === "" ? null : slug;
        },
        normalize: (v) => ({
            ...v,
            ...(v.status !== undefined
                ? { status: normalizeStatus(v.status) }
                : {}),
            ...(v.price !== undefined
                ? { price: normalizeMoney(v.price) }
                : {}),
            ...(v.mrp !== undefined ? { mrp: normalizeMoney(v.mrp) } : {}),
            ...(v.gstRate !== undefined
                ? { gstRate: v.gstRate.replace(/\s*%$/, "").trim() }
                : {}),
            ...(v.hsnCode !== undefined
                ? { hsnCode: v.hsnCode.replace(/\s+/g, "") }
                : {}),
        }),
        validateRow: (v) => {
            // Status and amounts are said here, in the import's words; the
            // DTO's own rules still judge every other field.
            const own: Omit<RowIssue, "row">[] = [];
            const status = v.status;
            if (
                status !== undefined &&
                !(PRODUCT_STATUSES as readonly string[]).includes(status)
            ) {
                own.push({
                    field: "status",
                    message: `Status is Draft, Live or Archived. '${status}' isn't one.`,
                });
            }
            for (const field of ["price", "mrp"] as const) {
                const value = v[field];
                const problem =
                    value === undefined
                        ? null
                        : moneyProblem(shortLabel(field), value);
                if (problem) own.push({ field, message: problem });
            }
            const judged = new Set(own.map((i) => i.field));
            const issues = [
                ...own,
                ...validateWith(CreateProductDto, v)
                    .filter((i) => !judged.has(i.field))
                    .map(productMessage),
            ];
            // GST's own rates, as the editor checks them (ProductsService).
            const rate = v.gstRate?.trim();
            if (
                rate &&
                !issues.some((i) => i.field === "gstRate") &&
                !isGstRate(rate)
            ) {
                issues.push({
                    field: "gstRate",
                    message: `${rate}% is not a GST rate. Use 0, 0.25, 3, 5, 12, 18, 28 or 40.`,
                });
            }
            return issues;
        },
        sample: [
            [
                "Name",
                "Price",
                "MRP",
                "GST rate",
                "HSN code",
                "Status",
                "Description",
            ],
            [
                "Steel Water Bottle 1L",
                "499",
                "599",
                "18",
                "7323",
                "Live",
                "Keeps water cold for 12 hours.",
            ],
            [
                "Masala Chai 250g",
                "180",
                "200",
                "5",
                "0902",
                "Draft",
                "Assam tea with cardamom, ginger and clove.",
            ],
        ],
    },
    customers: {
        requiredFields: ["email"],
        mappableFields: [
            "email",
            "name",
            "firstName",
            "lastName",
            "phone",
            "country",
            "state",
            "city",
            "zipCode",
        ],
        fieldLabels: {
            email: "Email",
            name: "Full name",
            firstName: "First name",
            lastName: "Last name",
            phone: "Phone",
            country: "Country",
            state: "State",
            city: "City",
            zipCode: "Postcode / PIN",
        },
        aliases: {
            fullname: "name",
            customername: "name",
            customer: "name",
            emailaddress: "email",
            mobile: "phone",
            mobilenumber: "phone",
            phonenumber: "phone",
            pincode: "zipCode",
            pin: "zipCode",
            postcode: "zipCode",
            postalcode: "zipCode",
            zip: "zipCode",
        },
        keyLabel: "email",
        // Uniqueness is @@unique([storeId, email]); the DTO lowercases on
        // transform, so the key must match that normalization exactly.
        keyOf: (v) => {
            const email = (v.email ?? "").trim().toLowerCase();
            return email === "" ? null : email;
        },
        validateRow: (v) => validateWith(CreateCustomerDto, splitFullName(v)),
        sample: [
            ["Email", "Full name", "Phone", "City", "State", "PIN code"],
            [
                "priya.sharma@example.com",
                "Priya Sharma",
                "98765 43210",
                "Pune",
                "Maharashtra",
                "411001",
            ],
            [
                "arjun.mehta@example.com",
                "Arjun Mehta",
                "91234 56789",
                "Jaipur",
                "Rajasthan",
                "302001",
            ],
        ],
    },
};
