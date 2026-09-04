import { Type } from "class-transformer";
import {
    IsIn,
    IsObject,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from "class-validator";

import type { DuplicatePolicy } from "./import-plan";

/** Bound the request body; larger files belong on the object-storage path. */
export const MAX_CSV_BYTES = 5 * 1024 * 1024;

export const DUPLICATE_POLICIES = ["SKIP", "UPDATE"] as const;

export class PreviewImportDto {
    @IsString()
    @MinLength(1, { message: "The file appears to be empty" })
    @MaxLength(MAX_CSV_BYTES, {
        message: "This file is too large to import in one request",
    })
    csv!: string;

    /** CSV header -> domain field. Unlisted headers are ignored. */
    @IsObject()
    @Type(() => Object)
    mapping!: Record<string, string>;

    @IsOptional()
    @IsIn(DUPLICATE_POLICIES, {
        message: "Duplicate handling must be SKIP or UPDATE",
    })
    policy?: DuplicatePolicy;
}

/**
 * Applying takes the same input as previewing, deliberately.
 *
 * The plan is recomputed from the file rather than trusted from the client, so
 * a merchant can never approve one preview and have a different set of writes
 * executed — whether by tampering or by a stale tab.
 */
export class ApplyImportDto extends PreviewImportDto {}
