import { Type } from "class-transformer";
import {
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from "class-validator";

/**
 * `?limit=&cursor=` on an item's price history read. Both arrive as text:
 * the limit is converted here, explicitly (`backend-nestjs.md`).
 */
export class PriceHistoryQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number;

    /** The `nextCursor` of the page before. */
    @IsOptional()
    @IsString()
    @MaxLength(200)
    cursor?: string;
}
