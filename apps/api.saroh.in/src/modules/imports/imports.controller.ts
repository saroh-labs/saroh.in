import {
    BadRequestException,
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import type { AuthUser } from "../../common/types/store-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { ApplyImportDto, PreviewImportDto } from "./dto";
import type { ImportEntity } from "./entities";
import { isImportEntity } from "./entities";
import { ImportsService } from "./imports.service";

@Controller("stores/:storeId/imports")
@UseGuards(BetterAuthGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class ImportsController {
    constructor(private readonly imports: ImportsService) {}

    /** The fields a column may be mapped to, for the mapping step. */
    @Get(":entity")
    describe(@Param("entity") entity: string) {
        return this.imports.describe(this.entity(entity));
    }

    /**
     * Compute what an import WOULD do. Writes nothing — §15 requires the
     * merchant to see creates, updates, skips and per-row errors first.
     */
    @Post(":entity/preview")
    @HttpCode(200)
    preview(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("entity") entity: string,
        @Body() dto: PreviewImportDto,
    ) {
        return this.imports.preview(storeId, user.id, this.entity(entity), dto);
    }

    @Post(":entity/apply")
    @HttpCode(200)
    apply(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("entity") entity: string,
        @Body() dto: ApplyImportDto,
    ) {
        return this.imports.apply(storeId, user.id, this.entity(entity), dto);
    }

    /** Reject an unknown entity at the edge rather than indexing a record with it. */
    private entity(value: string): ImportEntity {
        if (!isImportEntity(value)) {
            throw new BadRequestException({
                message: `Cannot import "${value}"`,
                field: "entity",
            });
        }
        return value;
    }
}
