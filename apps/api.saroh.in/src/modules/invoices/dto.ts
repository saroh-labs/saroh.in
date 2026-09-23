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

import type { InvoiceView, PaymentMethod } from "./invoice-state";
import { INVOICE_VIEWS, PAYMENT_METHODS } from "./invoice-state";

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

export class RecordPaymentDto {
    @IsIn(PAYMENT_METHODS)
    method!: PaymentMethod;

    @IsOptional()
    @Transform(trimOrOmit)
    @IsString()
    @MaxLength(120)
    reference?: string;

    @IsOptional()
    @Transform(trimOrOmit)
    @IsString()
    @MaxLength(500)
    note?: string;

    /** When the money came in; defaults to now. */
    @IsOptional()
    @IsISO8601()
    paidAt?: string;
}

export class ListInvoicesQueryDto {
    @IsOptional()
    @IsIn(INVOICE_VIEWS)
    view?: InvoiceView;

    @IsOptional()
    @IsString()
    contactId?: string;

    @IsOptional()
    @IsString()
    subscriptionId?: string;
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
