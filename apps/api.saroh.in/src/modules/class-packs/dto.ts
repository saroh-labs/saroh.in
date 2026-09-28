import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const MONEY = /^\d{1,9}(\.\d{1,2})?$/;

export const PACK_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type PackStatus = (typeof PACK_STATUSES)[number];

/**
 * A class pack, created or changed. A change reaches only packs sold after
 * it: every purchase keeps the classes, price and validity it was sold with.
 */
export class PackInputDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Give the pack a name" })
    @MaxLength(120)
    name?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    description?: string | null;

    @IsOptional()
    @IsInt()
    @Min(1, { message: "A pack has at least one class" })
    @Max(500)
    credits?: number;

    @IsOptional()
    @IsInt()
    @Min(1, { message: "A pack is valid for at least a day" })
    @Max(3650)
    validityDays?: number;

    @IsOptional()
    @Transform(trim)
    @Matches(MONEY, { message: "A price has at most two decimal places" })
    price?: string;

    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim().toUpperCase() : value,
    )
    @Matches(/^[A-Z]{3}$/, { message: "Currency must be a 3-letter code" })
    currency?: string;

    /** The services it pays for. Written as a whole. */
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(100)
    @IsString({ each: true })
    serviceIds?: string[];
}

/** What the staff list can be filtered to, drafts included (E14). */
export const PACK_LIST_STATUSES = ["DRAFT", ...PACK_STATUSES] as const;
export type PackListStatus = (typeof PACK_LIST_STATUSES)[number];

/**
 * The staff Packs list. With no `status`, it lists live and archived packs
 * but not drafts, as every app before the Pack Editor (E18) expects: an
 * older Packs screen would draw a draft as a pack on sale. The editor's app
 * asks for them with `include=drafts` (everything) or `status=DRAFT`.
 */
export class ListPacksQueryDto {
    @IsOptional()
    @IsIn(PACK_LIST_STATUSES)
    status?: PackListStatus;

    @IsOptional()
    @IsIn(["drafts"])
    include?: "drafts";
}

/** The draft revision an editor holds, sent with every draft write (#285). */
export class PackRevisionDto {
    @IsInt({ message: "Reload the pack and try again" })
    @Min(0)
    revision!: number;
}

/**
 * An autosave from the Pack Editor (E14): the fields in view and the
 * revision it holds. On a DRAFT it writes the pack; on a live pack it writes
 * the unpublished changes, and sales keep the published terms. A field sent
 * as null is one the editor has emptied (a draft not priced yet).
 */
export class PackDraftDto extends PackInputDto {
    @IsInt({ message: "Reload the pack and try again" })
    @Min(0)
    revision!: number;
}

/** Deleting a draft names the revision in the query: a DELETE has no body. */
export class DeletePackDraftQueryDto {
    @Type(() => Number)
    @IsInt({ message: "Reload the pack and try again" })
    @Min(0)
    revision!: number;
}

export class SellPackDto {
    @IsString()
    contactId!: string;
}

export class ListPurchasesQueryDto {
    @IsOptional()
    @IsString()
    contactId?: string;

    @IsOptional()
    @IsString()
    packId?: string;

    /**
     * Only packs that pay for this service — what New booking and "Use a
     * class pack" offer. A filter, not a lookup: another business's service
     * id simply matches nothing here.
     */
    @IsOptional()
    @IsString()
    @MaxLength(64)
    serviceId?: string;
}

/** Pay an existing booking with a pack; no purchase means the soonest to expire. */
export class UsePackDto {
    @IsOptional()
    @IsString()
    @MaxLength(64)
    packPurchaseId?: string;
}
