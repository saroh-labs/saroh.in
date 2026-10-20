import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsIn,
    IsInt,
    IsISO8601,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from "class-validator";

import type { InvoiceSource, InvoiceView } from "./invoice-state";
import { INVOICE_SOURCES, INVOICE_VIEWS } from "./invoice-state";
import { SEARCH_MAX } from "./list-filter";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/** Trimmed, and a blank answer is no answer. */
const trimOrOmit = ({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
};

/** Up to nine whole digits and two decimals: the DTO refuses "12.345". */
const MONEY = /^\d{1,9}(\.\d{1,2})?$/;
const MONEY_MESSAGE = "An amount has at most two decimal places";

export class InvoiceLineDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Say what the line is for" })
    @MaxLength(200)
    description!: string;

    @IsInt()
    @Min(1, { message: "Quantity is at least 1" })
    @Max(9999)
    quantity!: number;

    /** Never negative: a refund is not an invoice line. */
    @Transform(trim)
    @Matches(MONEY, { message: MONEY_MESSAGE })
    unitPrice!: string;

    /**
     * GST the price includes, in percent ("18"), on a registered business's
     * tax invoice (ADR-008). Checked against GST's rates in the service.
     */
    @IsOptional()
    @Transform(trimOrOmit)
    @Matches(/^\d{1,2}(\.\d{1,2})?$/, { message: "A GST rate like 5 or 18" })
    gstRate?: string;

    /** HSN (goods) or SAC (services): four to eight digits. */
    @IsOptional()
    @Transform(trimOrOmit)
    @Matches(/^\d{4,8}$/, { message: "An HSN or SAC code is 4 to 8 digits" })
    hsnSac?: string;
}

/**
 * A manual invoice, created or edited while it is a draft. One shape for
 * both; the service says what a create cannot do without. Lines are written
 * as a whole — a PATCH that sends them replaces them.
 */
export class InvoiceInputDto {
    @IsOptional()
    @IsString()
    contactId?: string;

    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim().toUpperCase() : value,
    )
    @Matches(/^[A-Z]{3}$/, { message: "Currency must be a 3-letter code" })
    currency?: string;

    @IsOptional()
    @IsArray()
    @ArrayMinSize(1, { message: "An invoice needs at least one line" })
    @ArrayMaxSize(100)
    @ValidateNested({ each: true })
    @Type(() => InvoiceLineDto)
    lines?: InvoiceLineDto[];

    @IsOptional()
    @Transform(trim)
    @Matches(MONEY, { message: MONEY_MESSAGE })
    tax?: string;

    /** ISO; when absent an issued invoice is due seven days after issue. */
    @IsOptional()
    @IsISO8601()
    dueAt?: string | null;

    /**
     * A registered buyer's GSTIN, printed on the tax invoice (ADR-008). ""
     * clears it. Checked (shape, state, check character) in the service.
     */
    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim().toUpperCase() : value,
    )
    @IsString()
    @MaxLength(15)
    billToGstin?: string;

    /**
     * The buyer's state — a GST state code or its name. It is the place of
     * supply: another state than the business's is IGST. "" clears it.
     */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(60)
    billToState?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    billToAddress?: string;
}

/** Cancel an issued invoice with a credit note for all of it (ADR-008). */
export class CreditInvoiceDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Say why it is being cancelled" })
    @MaxLength(500)
    reason!: string;
}

export class VoidInvoiceDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Say why it is being voided" })
    @MaxLength(500)
    reason!: string;
}

/** The ledger's DTOs live with the ledger (`invoice-payments.dto.ts`). */
export {
    ChequeBouncedDto,
    ChequeClearedDto,
    RecordPaymentDto,
    RemovePaymentDto,
} from "./invoice-payments.dto";

export class ListInvoicesQueryDto {
    /**
     * Search (DEC-173, U4): a name, part of a number, or an amount ("₹8,400",
     * "8400", "8,400.00") that is the total or what is left to pay. Trimmed;
     * a blank search is none.
     */
    @IsOptional()
    @Transform(trimOrOmit)
    @IsString()
    @MaxLength(SEARCH_MAX, { message: "Search with fewer words" })
    q?: string;

    /** `owed` and `cheques` are the money strip's (DEC-173, U4). */
    @IsOptional()
    @IsIn(INVOICE_VIEWS)
    view?: InvoiceView;

    /**
     * Money received from this day on, in the business's zone
     * (`2026-10-01`): the money strip's "Paid this month" (DEC-173, U4).
     * Part payments count; an order's paper counts when it was paid.
     */
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "A date like 2026-10-01" })
    @IsISO8601({ strict: true })
    paidFrom?: string;

    @IsOptional()
    @IsString()
    contactId?: string;

    @IsOptional()
    @IsString()
    subscriptionId?: string;

    /**
     * Only invoices paid from this instant on, credit notes never (ISO):
     * Home's "Last 24 hours" money, filtered here rather than over the
     * capped newest page, where an older invoice paid today is missing.
     */
    @IsOptional()
    @IsISO8601({ strict: true })
    paidSince?: string;

    /**
     * What it was for (D18, the list's chips). A correction is filed under
     * its original's source (`list-filter.ts`).
     */
    @IsOptional()
    @IsIn(INVOICE_SOURCES)
    source?: InvoiceSource;

    /** One pack's sales: Pack Detail's "Receipts" (D18). */
    @IsOptional()
    @IsString()
    @MaxLength(64)
    packId?: string;

    /** One course's enrolments: Course Detail's "Payments" (D18). */
    @IsOptional()
    @IsString()
    @MaxLength(64)
    courseId?: string;

    /** One order's paper: its invoice and every correction to it (D18). */
    @IsOptional()
    @IsString()
    @MaxLength(64)
    orderId?: string;
}

/** Whose unpaid invoices to add up: a person, or one subscription. */
export class OwedQueryDto {
    @IsOptional()
    @IsString()
    contactId?: string;

    @IsOptional()
    @IsString()
    subscriptionId?: string;
}
