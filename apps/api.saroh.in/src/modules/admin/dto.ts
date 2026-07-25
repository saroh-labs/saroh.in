import { Transform } from "class-transformer";
import { IsBoolean, IsString, MaxLength, MinLength } from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/**
 * Payload for every flag mutation.
 *
 * `reason` is REQUIRED, not optional: the flags decision (DECISIONS.md) commits
 * to recording operator AND reason for each change, and an audit trail of
 * unexplained boolean flips is close to useless during an incident review. The
 * minimum length is deliberate — it makes "x" as annoying to type as something
 * true.
 */
export class SetFlagDto {
    @IsBoolean()
    enabled!: boolean;

    @Transform(trim)
    @IsString()
    @MinLength(4, { message: "Give a reason for this change" })
    @MaxLength(500)
    reason!: string;
}

/** Clearing an override still needs a reason — it is a rollout change too. */
export class ClearFlagOverrideDto {
    @Transform(trim)
    @IsString()
    @MinLength(4, { message: "Give a reason for this change" })
    @MaxLength(500)
    reason!: string;
}
