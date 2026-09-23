import { Matches } from "class-validator";

/** Which month the calendar reads: "YYYY-MM", in the business's zone. */
export class CalendarMonthQueryDto {
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "month must be YYYY-MM." })
    month!: string;
}
