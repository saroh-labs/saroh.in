import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    MinLength,
} from "class-validator";

/** Review invitations for up to 50 orders at a time. */
export class InviteReviewsDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(50, { message: "At most 50 orders at a time" })
    @IsString({ each: true })
    orderIds!: string[];
}

/** The merchant's one public reply — plain text, editable. */
export class ReplyDto {
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim() : value,
    )
    @IsString()
    @MinLength(1, { message: "Write a reply, or close without sending" })
    @MaxLength(1000)
    reply!: string;
}

/** One line's review, from the customer's page. */
export class PublicReviewDto {
    @IsString()
    @MaxLength(64)
    orderItemId!: string;

    @Type(() => Number)
    @IsInt({ message: "Choose from one to five stars" })
    @Min(1, { message: "Choose from one to five stars" })
    @Max(5, { message: "Choose from one to five stars" })
    rating!: number;

    @IsOptional()
    @IsString()
    @MaxLength(2000, { message: "Keep it under 2,000 characters" })
    body?: string;

    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim() : value,
    )
    @IsString()
    @MinLength(1, { message: "Say how your name should appear" })
    @MaxLength(60)
    displayName!: string;
}
