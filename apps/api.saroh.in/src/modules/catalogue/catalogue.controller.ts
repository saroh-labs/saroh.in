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
    Query,
    UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import type { AuthUser } from "../../common/types/store-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { AllergensService } from "./allergens.service";
import { CatalogueService } from "./catalogue.service";
import {
    AddAllergensDto,
    AddOptionValueDto,
    CreateFieldDto,
    CreateOptionDto,
    RenameOptionDto,
    SaveDefaultsDto,
    SaveSkuPatternDto,
    UndoDefaultsDto,
    UpdateFieldDto,
} from "./dto";
import { FieldsService } from "./fields.service";
import { OptionsService } from "./options.service";
import { SkuService } from "./sku.service";

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
        private readonly sku: SkuService,
        private readonly fields: FieldsService,
        private readonly allergens: AllergensService,
    ) {}

    // ---- Allergens (#483) ----

    @Get("allergens")
    listAllergens(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
    ) {
        return this.allergens.list(storeId, user.id);
    }

    @Post("allergens")
    @HttpCode(201)
    addAllergens(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: AddAllergensDto,
    ) {
        return this.allergens.add(storeId, user.id, dto.names);
    }

    /** Refused while any product lists it. */
    @Delete("allergens/:allergenId")
    removeAllergen(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("allergenId") allergenId: string,
    ) {
        return this.allergens.remove(storeId, allergenId, user.id);
    }

    // ---- Custom fields (#482) ----

    @Get("fields")
    listFields(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
    ) {
        return this.fields.list(storeId, user.id);
    }

    @Post("fields")
    @HttpCode(201)
    createField(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: CreateFieldDto,
    ) {
        return this.fields.create(storeId, user.id, dto);
    }

    @Patch("fields/:fieldId")
    updateField(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("fieldId") fieldId: string,
        @Body() dto: UpdateFieldDto,
    ) {
        return this.fields.update(storeId, fieldId, user.id, dto);
    }

    /** Soft: its values are kept, and restore brings it back. */
    @Delete("fields/:fieldId")
    removeField(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("fieldId") fieldId: string,
    ) {
        return this.fields.remove(storeId, fieldId, user.id);
    }

    @Post("fields/:fieldId/restore")
    @HttpCode(200)
    restoreField(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("fieldId") fieldId: string,
    ) {
        return this.fields.restore(storeId, fieldId, user.id);
    }

    /** The pattern, whether to suggest, and a product's number for {N}. */
    @Get("sku-pattern")
    skuPattern(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Query("productId") productId?: string,
    ) {
        return this.sku.get(storeId, user.id, productId);
    }

    /** Every variant's SKU today and under this pattern, with any clash. */
    @Get("sku-pattern/preview")
    skuPreview(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Query("pattern") pattern = "",
    ) {
        return this.sku.preview(storeId, user.id, pattern);
    }

    @Put("sku-pattern")
    saveSkuPattern(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: SaveSkuPatternDto,
    ) {
        return this.sku.save(storeId, user.id, dto);
    }

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
