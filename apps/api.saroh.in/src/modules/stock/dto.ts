import type { StockEntryKind } from "@saroh/database";
import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from "class-validator";

/**
 * The Stock API's bodies and queries (#514). Every write takes an optional
 * `idempotencyKey`: the screen sends one per tap, so a retried save applies
 * once and replays its first answer.
 */

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;
const blankToNull = ({ value }: { value: unknown }) =>
    typeof value === "string" && value.trim() === "" ? null : trim({ value });

/** Every kind of stock-log entry, for the log's filter. */
export const STOCK_ENTRY_KINDS = [
    "SOLD",
    "RETURNED",
    "BAKED",
    "RECEIVED",
    "WASTED",
    "COUNTED",
    "MOVED",
    "REVERSED",
] as const satisfies readonly StockEntryKind[];

/** What the entries sheet records: in, out, or back from a customer. */
export const HAND_ENTRY_KINDS = [
    "RECEIVED",
    "BAKED",
    "WASTED",
    "RETURNED",
] as const satisfies readonly StockEntryKind[];
export type HandEntryKind = (typeof HAND_ENTRY_KINDS)[number];

/** Fields every stock write carries. */
class StockWriteDto {
    @IsOptional()
    @IsString()
    @MinLength(8)
    @MaxLength(200)
    idempotencyKey?: string;

    @IsOptional()
    @Transform(blankToNull)
    @IsString()
    @MaxLength(500)
    note?: string | null;
}

/** One shelf: a storefront's stock of a product, or of one variant. */
class ShelfDto extends StockWriteDto {
    @IsString()
    storeId!: string;

    @IsString()
    productId!: string;

    @IsOptional()
    @IsString()
    variantId?: string | null;
}

export class CountRowDto {
    @IsString()
    storeId!: string;

    @IsString()
    productId!: string;

    @IsOptional()
    @IsString()
    variantId?: string | null;

    /** What the counter was shown ("Log says N"); null when shown nothing. */
    @IsOptional()
    @IsInt({ message: "Whole numbers only." })
    expected?: number | null;

    @IsInt({ message: "Whole numbers only." })
    @Min(0, { message: "A count is 0 or more." })
    @Max(1_000_000)
    counted!: number;
}

/** Count several shelves at once — the Count stock bar's one save. */
export class CountStockDto extends StockWriteDto {
    @IsArray()
    @ArrayMinSize(1, { message: "Count at least one." })
    @ArrayMaxSize(500)
    @ValidateNested({ each: true })
    @Type(() => CountRowDto)
    counts!: CountRowDto[];
}

/** Received, baked, wasted, or returned by a customer. */
export class StockEntryDto extends ShelfDto {
    @IsIn(HAND_ENTRY_KINDS)
    kind!: HandEntryKind;

    @IsInt({ message: "Whole numbers only." })
    @Min(1, { message: "Enter how many, 1 or more." })
    @Max(1_000_000)
    units!: number;

    /** The order a return came back from, when there is one. */
    @IsOptional()
    @IsString()
    orderId?: string | null;
}

/** "+N · Add" — units received at a shelf. */
export class AdjustStockDto extends ShelfDto {
    @IsInt({ message: "Whole numbers only." })
    @Min(1, { message: "Enter how many, 1 or more." })
    @Max(1_000_000)
    units!: number;
}

export class MoveStockDto extends StockWriteDto {
    @IsString()
    fromStoreId!: string;

    @IsString()
    toStoreId!: string;

    @IsString()
    productId!: string;

    @IsOptional()
    @IsString()
    variantId?: string | null;

    @IsInt({ message: "Whole numbers only." })
    @Min(1, { message: "Enter how many to move, 1 or more." })
    @Max(1_000_000)
    units!: number;
}

/** Undo: a batch of entries, all or none. */
export class ReverseStockDto extends StockWriteDto {
    @IsArray()
    @ArrayMinSize(1, { message: "Pick what to undo." })
    @ArrayMaxSize(500)
    @IsString({ each: true })
    entryIds!: string[];
}

export class ResolveCheckDto extends StockWriteDto {}

/** `GET …/stock` */
export class StockLevelsQueryDto {
    /** Narrow the columns to one storefront. */
    @IsOptional()
    @IsString()
    storefront?: string;

    /** One product's rows. */
    @IsOptional()
    @IsString()
    product?: string;
}

/** `GET …/stock/log` */
export class StockLogQueryDto {
    /** One kind, or several comma-separated ("WASTED,COUNTED"). */
    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string"
            ? value
                  .split(",")
                  .map((k) => k.trim().toUpperCase())
                  .filter(Boolean)
            : value,
    )
    @IsIn(STOCK_ENTRY_KINDS, {
        each: true,
        message: "Pick a kind of change the log records.",
    })
    kind?: StockEntryKind[];

    @IsOptional()
    @IsString()
    storefront?: string;

    @IsOptional()
    @IsString()
    product?: string;

    @IsOptional()
    @IsString()
    variant?: string;

    /** The last entry of the page before; the next page starts after it. */
    @IsOptional()
    @IsString()
    cursor?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(200)
    limit?: number;
}
