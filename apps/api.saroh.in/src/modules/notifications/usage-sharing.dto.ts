import { IsBoolean } from "class-validator";

/** `PATCH /organizations/:id/me/usage-sharing`: yes or no (DEC-125). */
export class UpdateUsageSharingDto {
    @IsBoolean()
    sharesUsage!: boolean;
}
