import { plainToInstance } from "class-transformer";
import type { ValidationError } from "class-validator";
import { validateSync } from "class-validator";

import { CreateCustomerDto } from "../customers/dto";
import { isGstRate } from "../invoices/gst";
import { CreateProductDto } from "../products/dto";
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
        mappableFields: [
            "name",
            "slug",
            "description",
            "image",
            "price",
            "currency",
            "status",
            "mrp",
            "gstRate",
            "hsnCode",
        ],
        fieldLabels: {
            name: "Name",
            slug: "Web address",
            description: "Description",
            image: "Photo link",
            price: "Price",
            currency: "Currency",
            status: "Status (draft, published, archived)",
            mrp: "MRP",
            gstRate: "GST rate (%)",
            hsnCode: "HSN code",
        },
        aliases: {
            title: "name",
            productname: "name",
            url: "slug",
            webaddress: "slug",
            photo: "image",
            imageurl: "image",
            sellingprice: "price",
            gst: "gstRate",
            gstpercent: "gstRate",
            hsn: "hsnCode",
            maximumretailprice: "mrp",
        },
        keyLabel: "the product's web address",
        // Mirrors ProductsService.create: an explicit slug wins, otherwise it is
        // derived from the name. Unique per business (@@unique([organizationId, slug])).
        keyOf: (v) => {
            const slug = slugify(v.slug ?? v.name ?? "");
            return slug === "" ? null : slug;
        },
        validateRow: (v) => {
            const issues = validateWith(CreateProductDto, v);
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
    },
};
