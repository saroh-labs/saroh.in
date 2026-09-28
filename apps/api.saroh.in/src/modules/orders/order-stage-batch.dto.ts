import { Type } from "class-transformer";
import {
    ArrayMaxSize,
    ArrayMinSize,
    ArrayUnique,
    IsArray,
    IsBoolean,
    IsIn,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    MinLength,
    ValidateNested,
} from "class-validator";

import type { OrderStage } from "./dto";
import { ORDER_STAGES } from "./dto";

/**
 * Bulk kitchen moves (round-2 B6): the batch the Orders list posts, and
 * what the API answers about it. Their own file rather than `dto.ts`,
 * which is on the size ledger (00-universal §6).
 */

/** A batch moves at most this many orders (plan B6). */
export const STAGE_BATCH_MAX = 100;

/** One order, where the list saw it, and the step to take. */
export class StageBatchLineDto {
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    orderId!: string;

    @IsIn(ORDER_STAGES, { message: "Unknown kitchen stage" })
    from!: OrderStage;

    @IsIn(ORDER_STAGES, { message: "Unknown kitchen stage" })
    to!: OrderStage;
}

export class CreateStageBatchDto {
    /**
     * Made by the client, so a retry after a lost reply names the same
     * batch and gets its stored results instead of a second move.
     */
    @IsUUID("4", { message: "The batch needs an id of its own" })
    batchId!: string;

    @IsArray()
    @ArrayMinSize(1, { message: "Choose at least one order" })
    @ArrayMaxSize(STAGE_BATCH_MAX, {
        message: `Move at most ${STAGE_BATCH_MAX} orders at once`,
    })
    @ArrayUnique((line: StageBatchLineDto) => line.orderId, {
        message: "An order is in the batch twice",
    })
    @ValidateNested({ each: true })
    @Type(() => StageBatchLineDto)
    lines!: StageBatchLineDto[];

    /**
     * Commit at once instead of holding ten seconds: a step that tells no
     * one (Start preparing), taken with an Undo afterwards (the design).
     */
    @IsOptional()
    @IsBoolean()
    now?: boolean;
}

/** What became of a line; PENDING until the commit reaches it. */
export const STAGE_BATCH_RESULTS = [
    "PENDING",
    "MOVED",
    "MOVED_BY_SOMEONE_ELSE",
    "NOT_FOUND",
    "REFUSED",
    "CANCELLED",
] as const;
export type StageBatchResult = (typeof STAGE_BATCH_RESULTS)[number];

export type StageBatchUndoResult = "UNDONE" | "REFUSED";

export interface StageBatchLineView {
    orderId: string;
    from: OrderStage;
    to: OrderStage;
    result: StageBatchResult;
    /** Why it didn't move, in a few words ("moved by someone else"). */
    reason: string | null;
    /** The step's event, once moved: what an Undo names. */
    eventId: string | null;
    /** After "Undo all": null until it reached this line. */
    undo: {
        result: StageBatchUndoResult;
        reason: string | null;
        /** The customer had already been told when it was undone (A14). */
        told: boolean;
    } | null;
}

export interface StageBatchView {
    id: string;
    status: "HELD" | "COMMITTED" | "CANCELLED";
    /** When the server commits it, ISO. */
    commitAt: string;
    committedAt: string | null;
    undoneAt: string | null;
    lines: StageBatchLineView[];
}
