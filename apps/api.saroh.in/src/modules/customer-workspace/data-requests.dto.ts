import { Transform } from "class-transformer";
import {
    IsIn,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/** Which requests the list shows; open ones when left out. */
export const DATA_REQUEST_FILTERS = ["open", "done", "closed", "all"] as const;
export type DataRequestFilter = (typeof DATA_REQUEST_FILTERS)[number];

/** `?status=`. */
export class ListDataRequestsQueryDto {
    @IsOptional()
    @IsIn(DATA_REQUEST_FILTERS)
    status?: DataRequestFilter;
}

/**
 * The only way the team ends a request by hand (DEC-172): closed without
 * removal, with a reason. DONE is the privacy removal's to record, so it is
 * refused here (400).
 */
export const CLOSE_OUTCOMES = ["CLOSED_WITHOUT_REMOVAL"] as const;

export const MAX_CLOSE_REASON = 500;

export class CloseDataRequestDto {
    @IsIn(CLOSE_OUTCOMES, {
        message:
            "A request can only be closed without removal here. Run the removal from the customer's page to mark it done.",
    })
    outcome!: (typeof CLOSE_OUTCOMES)[number];

    @Transform(trim)
    @IsString({ message: "Say why you're closing it" })
    @MinLength(1, { message: "Say why you're closing it" })
    @MaxLength(MAX_CLOSE_REASON)
    reason!: string;
}
