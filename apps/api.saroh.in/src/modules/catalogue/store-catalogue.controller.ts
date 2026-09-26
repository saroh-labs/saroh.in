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
import { blankToNull, CatalogueAccess } from "./catalogue-access";
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
import { single } from "./single-query";
import { SkuService } from "./sku.service";

/**
 * The old per-storefront addresses, kept for one release (#529): each
 * resolves the storefront's business under the storefront's own access
 * rules and calls the same organization-scoped service.
 */
@Controller("stores/:storeId")
@UseGuards(BetterAuthGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class CatalogueController {
    constructor(
        private readonly access: CatalogueAccess,
        private readonly catalogue: CatalogueService,
        private readonly options: OptionsService,
        private readonly sku: SkuService,
        private readonly fields: FieldsService,
        private readonly allergens: AllergensService,
    ) {}

    private async readOrg(storeId: string, user: AuthUser) {
        return (await this.access.readViaStore(storeId, user.id))
            .organizationId;
    }

    private writeOrg(storeId: string, user: AuthUser) {
        return this.access.writeViaStore(storeId, user.id);
    }

    // ---- Allergens (#483) ----

    @Get("allergens")
    async listAllergens(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
    ) {
        return this.allergens.views(await this.readOrg(storeId, user));
    }

    @Post("allergens")
    @HttpCode(201)
    async addAllergens(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: AddAllergensDto,
    ) {
        return this.allergens.add(
            await this.writeOrg(storeId, user),
            dto.names,
        );
    }

    /** Refused while any product lists it. */
    @Delete("allergens/:allergenId")
    async removeAllergen(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("allergenId") allergenId: string,
    ) {
        return this.allergens.remove(
            await this.writeOrg(storeId, user),
            allergenId,
        );
    }

    // ---- Custom fields (#482) ----

    @Get("fields")
    async listFields(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
    ) {
        return this.fields.views(await this.readOrg(storeId, user));
    }

    @Post("fields")
    @HttpCode(201)
    async createField(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: CreateFieldDto,
    ) {
        return this.fields.create(await this.writeOrg(storeId, user), dto);
    }

    @Patch("fields/:fieldId")
    async updateField(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("fieldId") fieldId: string,
        @Body() dto: UpdateFieldDto,
    ) {
        return this.fields.update(
            await this.writeOrg(storeId, user),
            fieldId,
            dto,
        );
    }

    /** Soft: its values are kept, and restore brings it back. */
    @Delete("fields/:fieldId")
    async removeField(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("fieldId") fieldId: string,
    ) {
        return this.fields.remove(await this.writeOrg(storeId, user), fieldId);
    }

    @Post("fields/:fieldId/restore")
    @HttpCode(200)
    async restoreField(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("fieldId") fieldId: string,
    ) {
        return this.fields.restore(await this.writeOrg(storeId, user), fieldId);
    }

    /** The pattern, whether to suggest, and a product's number for {N}. */
    @Get("sku-pattern")
    async skuPattern(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Query("productId") productId?: unknown,
    ) {
        const one = single("product", productId);
        return this.sku.get(await this.readOrg(storeId, user), one);
    }

    /** Every variant's SKU today and under this pattern, with any clash. */
    @Get("sku-pattern/preview")
    async skuPreview(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Query("pattern") pattern?: unknown,
    ) {
        const one = single("pattern", pattern) ?? "";
        return this.sku.preview(await this.readOrg(storeId, user), one);
    }

    @Put("sku-pattern")
    async saveSkuPattern(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: SaveSkuPatternDto,
    ) {
        return this.sku.save(await this.writeOrg(storeId, user), dto);
    }

    @Get("catalogue")
    async get(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
    ) {
        const scope = await this.access.readViaStore(storeId, user.id);
        return this.catalogue.get(scope.organizationId, scope.canWrite);
    }

    /** What a new product in this category starts with. */
    @Get("catalogue/defaults/effective")
    async effectiveDefaults(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Query("categoryId") categoryId?: string,
    ) {
        return this.catalogue.effective(
            await this.readOrg(storeId, user),
            blankToNull(categoryId),
        );
    }

    @Put("catalogue/defaults")
    async saveDefaults(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: SaveDefaultsDto,
    ) {
        return this.catalogue.saveDefaults(
            await this.writeOrg(storeId, user),
            dto,
        );
    }

    @Post("catalogue/defaults/undo")
    @HttpCode(200)
    async undoDefaults(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: UndoDefaultsDto,
    ) {
        return this.catalogue.undoDefaults(
            await this.writeOrg(storeId, user),
            dto,
        );
    }

    @Get("options")
    async listOptions(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
    ) {
        return this.options.views(await this.readOrg(storeId, user));
    }

    @Post("options")
    @HttpCode(201)
    async createOption(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: CreateOptionDto,
    ) {
        return this.options.create(await this.writeOrg(storeId, user), dto);
    }

    @Patch("options/:optionId")
    async renameOption(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("optionId") optionId: string,
        @Body() dto: RenameOptionDto,
    ) {
        return this.options.rename(
            await this.writeOrg(storeId, user),
            optionId,
            dto,
        );
    }

    @Delete("options/:optionId")
    async removeOption(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("optionId") optionId: string,
    ) {
        return this.options.remove(
            await this.writeOrg(storeId, user),
            optionId,
        );
    }

    @Post("options/:optionId/values")
    @HttpCode(201)
    async addValue(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("optionId") optionId: string,
        @Body() dto: AddOptionValueDto,
    ) {
        return this.options.addValue(
            await this.writeOrg(storeId, user),
            optionId,
            dto,
        );
    }

    @Delete("options/:optionId/values/:valueId")
    async removeValue(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("optionId") optionId: string,
        @Param("valueId") valueId: string,
    ) {
        return this.options.removeValue(
            await this.writeOrg(storeId, user),
            optionId,
            valueId,
        );
    }
}
