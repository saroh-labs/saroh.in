import { Transform, Type } from "class-transformer";
import {
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
} from "class-validator";

import type {
    InvoiceStatus,
    SubscriptionStatusKey,
    SubscriptionView,
} from "./admin-billing";
import {
    INVOICE_STATUSES,
    SUBSCRIPTION_STATUSES,
    SUBSCRIPTION_VIEWS,
} from "./admin-billing";
import type { HistoryShow } from "./admin-billing-history";
import { HISTORY_MAX_PAGE, HISTORY_SHOWS } from "./admin-billing-history";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/** "2026-10": a calendar month. */
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Saroh's invoices across businesses (DEC-179): filters and page. */
export class ListSarohInvoicesDto {
    @IsOptional()
    @Matches(MONTH, { message: "month must look like 2026-10" })
    month?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    q?: string;

    @IsOptional()
    @IsIn(["yes", "no"])
    gstin?: "yes" | "no";

    /** Paid, unpaid or refunded (R29). */
    @IsOptional()
    @IsIn(INVOICE_STATUSES)
    status?: InvoiceStatus;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100_000)
    page?: number;
}

/** The month's GST export: the same filters, the month required. */
export class ExportSarohInvoicesDto {
    @Matches(MONTH, { message: "month must look like 2026-10" })
    month!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    q?: string;

    @IsOptional()
    @IsIn(["yes", "no"])
    gstin?: "yes" | "no";

    /** Paid, unpaid or refunded (R29). */
    @IsOptional()
    @IsIn(INVOICE_STATUSES)
    status?: InvoiceStatus;
}

/** Every business's Saroh subscription (DEC-179): filters and page. */
export class ListSarohSubscriptionsDto {
    /** A business's name or slug, or a provider id (DEC-166). */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    q?: string;

    @IsOptional()
    @IsIn(SUBSCRIPTION_STATUSES)
    status?: SubscriptionStatusKey;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    plan?: string;

    @IsOptional()
    @IsIn(SUBSCRIPTION_VIEWS)
    view?: SubscriptionView;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100_000)
    page?: number;
}

/** A subscription's history (admin plan U15): which chip, and the page. */
export class SubscriptionHistoryDto {
    @IsOptional()
    @IsIn(HISTORY_SHOWS)
    show?: HistoryShow;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(HISTORY_MAX_PAGE)
    page?: number;
}
