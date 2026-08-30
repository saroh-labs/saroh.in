import { plainToInstance } from "class-transformer";
import type { ValidationError } from "class-validator";
import { validateSync } from "class-validator";

import { CreateCustomerDto } from "../customers/dto";
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
    /** Human label for the natural key, used in preview copy. */
    keyLabel: string;
    keyOf: (values: ImportValues) => string | null;
    validateRow: (values: ImportValues) => Omit<RowIssue, "row">[];
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
        ],
        keyLabel: "slug",
        // Mirrors ProductsService.create: an explicit slug wins, otherwise it is
        // derived from the name. Uniqueness is @@unique([storeId, slug]).
        keyOf: (v) => {
            const slug = slugify(v.slug ?? v.name ?? "");
            return slug === "" ? null : slug;
        },
        validateRow: (v) => validateWith(CreateProductDto, v),
    },
    customers: {
        requiredFields: ["email"],
        mappableFields: [
            "email",
            "firstName",
            "lastName",
            "phone",
            "country",
            "state",
            "city",
            "zipCode",
        ],
        keyLabel: "email",
        // Uniqueness is @@unique([storeId, email]); the DTO lowercases on
        // transform, so the key must match that normalization exactly.
        keyOf: (v) => {
            const email = (v.email ?? "").trim().toLowerCase();
            return email === "" ? null : email;
        },
        validateRow: (v) => validateWith(CreateCustomerDto, v),
    },
};
