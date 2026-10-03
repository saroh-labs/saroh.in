import { IsInt, Min } from "class-validator";

/** `POST /admin/pricing/preview-token`: the draft revision on screen. */
export class PreviewTokenDto {
    @IsInt()
    @Min(0)
    revision!: number;
}
