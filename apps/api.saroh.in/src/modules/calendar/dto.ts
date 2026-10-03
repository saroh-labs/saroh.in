import { IsOptional, Matches } from "class-validator";

/**
 * Which days the calendar reads, in the business's zone (plan 005 E20):
 * `from` and `to` ("YYYY-MM-DD", both inclusive). The `month` alias the app
 * before E20 sent is gone (follow-up Z3): the global pipe refuses it as an
 * unknown property. How far a range reaches is `range.ts`'s.
 */
export class CalendarQueryDto {
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "from must be YYYY-MM-DD." })
    from?: string;

    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "to must be YYYY-MM-DD." })
    to?: string;
}
