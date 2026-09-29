import { IsOptional, Matches } from "class-validator";

/**
 * Which days the calendar reads, in the business's zone (plan 005 E20):
 * `from` and `to` ("YYYY-MM-DD", both inclusive), or — for one release,
 * until follow-up Z3 — `month` ("YYYY-MM"), which the previous app sends.
 * Which combination is asked, and how far it reaches, is `range.ts`'s.
 */
export class CalendarMonthQueryDto {
    @IsOptional()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "month must be YYYY-MM." })
    month?: string;

    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "from must be YYYY-MM-DD." })
    from?: string;

    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "to must be YYYY-MM-DD." })
    to?: string;
}
