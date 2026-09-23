import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Put,
    UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import type { AuthUser } from "../../common/types/store-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { CatalogueService } from "./catalogue.service";
import {
    AddOptionValueDto,
    CreateOptionDto,
    RenameOptionDto,
    SaveDefaultsDto,
    UndoDefaultsDto,
} from "./dto";
import { OptionsService } from "./options.service";

/**
 * Store-wide catalogue settings: the settings page's one read, the options
 * its variants choose by, and the defaults new products start with. Read =
 * store access, write = store write, like products and categories.
 */
@Controller("stores/:storeId")
@UseGuards(BetterAuthGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class CatalogueController {
    constructor(
        private readonly catalogue: CatalogueService,
        private readonly options: OptionsService,
    ) {}

    @Get("catalogue")
    get(@CurrentUser() user: AuthUser, @Param("storeId") storeId: string) {
        return this.catalogue.get(storeId, user.id);
    }

    @Put("catalogue/defaults")
    saveDefaults(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: SaveDefaultsDto,
    ) {
        return this.catalogue.saveDefaults(storeId, user.id, dto);
    }

    @Post("catalogue/defaults/undo")
    @HttpCode(200)
    undoDefaults(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: UndoDefaultsDto,
    ) {
        return this.catalogue.undoDefaults(storeId, user.id, dto);
    }

    @Get("options")
    listOptions(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
    ) {
        return this.options.list(storeId, user.id);
    }

    @Post("options")
    @HttpCode(201)
    createOption(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: CreateOptionDto,
    ) {
        return this.options.create(storeId, user.id, dto);
    }

    @Patch("options/:optionId")
    renameOption(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("optionId") optionId: string,
        @Body() dto: RenameOptionDto,
    ) {
        return this.options.rename(storeId, optionId, user.id, dto);
    }

    @Delete("options/:optionId")
    removeOption(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("optionId") optionId: string,
    ) {
        return this.options.remove(storeId, optionId, user.id);
    }

    @Post("options/:optionId/values")
    @HttpCode(201)
    addValue(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("optionId") optionId: string,
        @Body() dto: AddOptionValueDto,
    ) {
        return this.options.addValue(storeId, optionId, user.id, dto);
    }

    @Delete("options/:optionId/values/:valueId")
    removeValue(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("optionId") optionId: string,
        @Param("valueId") valueId: string,
    ) {
        return this.options.removeValue(storeId, optionId, valueId, user.id);
    }
}
