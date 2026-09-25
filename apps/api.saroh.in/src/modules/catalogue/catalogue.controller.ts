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

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { MergeReportService } from "../products/merge-report.service";
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
import { SkuService } from "./sku.service";

/**
 * The business's catalogue settings (#529): the settings page's one read,
 * the options variants choose by, custom fields, allergens, the SKU pattern
 * and the defaults new products start with. Org-nested, so the business
 * comes from the path the guard proved; reading needs `store:read`,
 * changing needs `store:write`.
 */
@Controller("organizations/:organizationId/catalogue")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class OrganizationCatalogueController {
    constructor(
        private readonly access: CatalogueAccess,
        private readonly catalogue: CatalogueService,
        private readonly options: OptionsService,
        private readonly sku: SkuService,
        private readonly fields: FieldsService,
        private readonly allergens: AllergensService,
        private readonly mergeReports: MergeReportService,
    ) {}

    @Get()
    get(@OrgContext() ctx: OrganizationContext) {
        const scope = this.access.read(ctx);
        return this.catalogue.get(scope.organizationId, scope.canWrite);
    }

    // ---- Defaults ----

    /** What a new product in this category starts with. */
    @Get("defaults/effective")
    effectiveDefaults(
        @OrgContext() ctx: OrganizationContext,
        @Query("categoryId") categoryId?: string,
    ) {
        return this.catalogue.effective(
            this.access.read(ctx).organizationId,
            blankToNull(categoryId),
        );
    }

    @Put("defaults")
    saveDefaults(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: SaveDefaultsDto,
    ) {
        return this.catalogue.saveDefaults(this.access.write(ctx), dto);
    }

    @Post("defaults/undo")
    @HttpCode(200)
    undoDefaults(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: UndoDefaultsDto,
    ) {
        return this.catalogue.undoDefaults(this.access.write(ctx), dto);
    }

    // ---- Options ----

    @Get("options")
    listOptions(@OrgContext() ctx: OrganizationContext) {
        return this.options.views(this.access.read(ctx).organizationId);
    }

    @Post("options")
    @HttpCode(201)
    createOption(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CreateOptionDto,
    ) {
        return this.options.create(this.access.write(ctx), dto);
    }

    @Patch("options/:optionId")
    renameOption(
        @OrgContext() ctx: OrganizationContext,
        @Param("optionId") optionId: string,
        @Body() dto: RenameOptionDto,
    ) {
        return this.options.rename(this.access.write(ctx), optionId, dto);
    }

    @Delete("options/:optionId")
    removeOption(
        @OrgContext() ctx: OrganizationContext,
        @Param("optionId") optionId: string,
    ) {
        return this.options.remove(this.access.write(ctx), optionId);
    }

    @Post("options/:optionId/values")
    @HttpCode(201)
    addValue(
        @OrgContext() ctx: OrganizationContext,
        @Param("optionId") optionId: string,
        @Body() dto: AddOptionValueDto,
    ) {
        return this.options.addValue(this.access.write(ctx), optionId, dto);
    }

    @Delete("options/:optionId/values/:valueId")
    removeValue(
        @OrgContext() ctx: OrganizationContext,
        @Param("optionId") optionId: string,
        @Param("valueId") valueId: string,
    ) {
        return this.options.removeValue(
            this.access.write(ctx),
            optionId,
            valueId,
        );
    }

    // ---- Custom fields (#482) ----

    @Get("fields")
    listFields(@OrgContext() ctx: OrganizationContext) {
        return this.fields.views(this.access.read(ctx).organizationId);
    }

    @Post("fields")
    @HttpCode(201)
    createField(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CreateFieldDto,
    ) {
        return this.fields.create(this.access.write(ctx), dto);
    }

    @Patch("fields/:fieldId")
    updateField(
        @OrgContext() ctx: OrganizationContext,
        @Param("fieldId") fieldId: string,
        @Body() dto: UpdateFieldDto,
    ) {
        return this.fields.update(this.access.write(ctx), fieldId, dto);
    }

    /** Soft: its values are kept, and restore brings it back. */
    @Delete("fields/:fieldId")
    removeField(
        @OrgContext() ctx: OrganizationContext,
        @Param("fieldId") fieldId: string,
    ) {
        return this.fields.remove(this.access.write(ctx), fieldId);
    }

    @Post("fields/:fieldId/restore")
    @HttpCode(200)
    restoreField(
        @OrgContext() ctx: OrganizationContext,
        @Param("fieldId") fieldId: string,
    ) {
        return this.fields.restore(this.access.write(ctx), fieldId);
    }

    // ---- Allergens (#483) ----

    @Get("allergens")
    listAllergens(@OrgContext() ctx: OrganizationContext) {
        return this.allergens.views(this.access.read(ctx).organizationId);
    }

    @Post("allergens")
    @HttpCode(201)
    addAllergens(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: AddAllergensDto,
    ) {
        return this.allergens.add(this.access.write(ctx), dto.names);
    }

    /** Refused while any product lists it. */
    @Delete("allergens/:allergenId")
    removeAllergen(
        @OrgContext() ctx: OrganizationContext,
        @Param("allergenId") allergenId: string,
    ) {
        return this.allergens.remove(this.access.write(ctx), allergenId);
    }

    // ---- SKU pattern (#484) ----

    /** The pattern, whether to suggest, and a product's number for {N}. */
    @Get("sku-pattern")
    skuPattern(
        @OrgContext() ctx: OrganizationContext,
        @Query("productId") productId?: string,
    ) {
        return this.sku.get(this.access.read(ctx).organizationId, productId);
    }

    /** Every variant's SKU today and under this pattern, with any clash. */
    @Get("sku-pattern/preview")
    skuPreview(
        @OrgContext() ctx: OrganizationContext,
        @Query("pattern") pattern = "",
    ) {
        return this.sku.preview(this.access.read(ctx).organizationId, pattern);
    }

    @Put("sku-pattern")
    saveSkuPattern(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: SaveSkuPatternDto,
    ) {
        return this.sku.save(this.access.write(ctx), dto);
    }

    // ---- Same-product merge (#530) ----

    /** What the merge joined, kept apart and dropped. Owner and Admin. */
    @Get("merge-report")
    mergeReport(@OrgContext() ctx: OrganizationContext) {
        return this.mergeReports.list(ctx);
    }
}
