import { Transform, Type } from "class-transformer";
import {
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from "class-validator";

/**
 * The Customers list's query (DEC-041, C3): `?q=&chip=&sort=&store=&page=`.
 * Everything arrives as text, so `page` converts explicitly.
 */

/** Rows per page: the design pages by Previous and Next, 50 at a time. */
export const CUSTOMERS_PAGE_SIZE = 50;

/** The filter chips, in the order the design shows them. */
export const CUSTOMER_CHIPS = [
    "all",
    "returning",
    "subscribers",
    "open",
    "offers",
    "attention",
] as const;
export type CustomerChip = (typeof CUSTOMER_CHIPS)[number];

/** Last order (newest first), Spent (highest first) or Name (A to Z). */
export const CUSTOMER_SORTS = ["last", "spent", "name"] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

/** Longer than any name, phone or email anyone types into a search box. */
export const CUSTOMER_SEARCH_MAX = 100;

/** Far past any business's customers at 50 a page; a bound, not a limit. */
const PAGE_MAX = 10_000;

const trimmed = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/** A blank value is no value: `?store=` means every storefront. */
const blankless = ({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const t = value.trim();
    return t === "" ? undefined : t;
};

export class ListCustomersQueryDto {
    @IsOptional()
    @Transform(trimmed)
    @IsString()
    @MaxLength(CUSTOMER_SEARCH_MAX, {
        message: `Search for fewer than ${CUSTOMER_SEARCH_MAX} characters.`,
    })
    q?: string;

    @IsOptional()
    @Transform(blankless)
    @IsIn(CUSTOMER_CHIPS, {
        message: "Pick all, returning, subscribers, open, offers or attention.",
    })
    chip?: CustomerChip;

    @IsOptional()
    @Transform(blankless)
    @IsIn(CUSTOMER_SORTS, { message: "Sort by last, spent or name." })
    sort?: CustomerSort;

    /** A storefront id: customers who bought there. */
    @IsOptional()
    @Transform(blankless)
    @IsString()
    @MaxLength(64)
    store?: string;

    /** 1-based. */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: "page must be a whole number" })
    @Min(1)
    @Max(PAGE_MAX)
    page?: number;
}

/** Paying store customers no contact holds yet (`customers/unlinked`). */
export class ListUnlinkedQueryDto {
    @IsOptional()
    @Transform(blankless)
    @IsString()
    @MaxLength(64)
    store?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: "page must be a whole number" })
    @Min(1)
    @Max(PAGE_MAX)
    page?: number;
}
