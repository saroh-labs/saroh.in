import { IsISO8601 } from "class-validator";

/** Undo of "Mark all as read": the instant that press answered with. */
export class UndoReadAllDto {
    @IsISO8601({ strict: true })
    readAt!: string;
}
