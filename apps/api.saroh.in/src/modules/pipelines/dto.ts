import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
    IsInt,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/** One initial stage in a new pipeline. Order is assigned by array position. */
export class InitialStageDto {
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(60)
    name!: string;
}

/**
 * Create a Pipeline for the org (S3-005). `stages` seeds the board columns in
 * array order (0..n); when omitted the service falls back to the default
 * New→Lost set so a pipeline is never created empty (a lead can't sit in a
 * pipeline with no stages).
 */
export class CreatePipelineDto {
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(80)
    name!: string;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(20)
    @ValidateNested({ each: true })
    @Type(() => InitialStageDto)
    stages?: InitialStageDto[];
}

/** Append a Stage to a pipeline. Order defaults to the end when omitted. */
export class CreateStageDto {
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(60)
    name!: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    order?: number;
}

/** Rename and/or reorder a Stage. Both fields optional (a sparse patch). */
export class UpdateStageDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(60)
    name?: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    order?: number;
}
