import {
    Body,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Put,
} from "@nestjs/common";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { AdminPermission } from "../admin/admin-permissions";
import { AdminRoutes } from "../admin/admin-routes.decorator";
import type {
    CancelResult,
    DraftSaved,
    PublishResult,
} from "./catalogue-writes.service";
import { CatalogueWritesService } from "./catalogue-writes.service";
import type {
    AdminPricing,
    AdminPricingImpact,
    PreviewTokenResult,
} from "./catalogue.service";
import { CatalogueService } from "./catalogue.service";
import type { AdminCoupon } from "./coupons.service";
import { CouponsService } from "./coupons.service";
import {
    CancelVersionDto,
    CreateCouponDto,
    DeleteCouponDto,
    DiscardDraftDto,
    PreviewTokenDto,
    PublishDto,
    RetryProviderSyncDto,
    RollbackDto,
    SaveDraftDto,
    UpdateCouponDto,
} from "./dto";

/**
 * Plans & modules (plans catalogue U3 reads, U4 writes), under
 * `/admin/pricing`. Registered by the admin module, so it sits behind the
 * control plane's guards and its routes are in the admin permission
 * contract.
 *
 * Every route needs `pricing:read`, minting a draft-preview link included:
 * the token shows only what the holder can already read here. Each write
 * needs its own permission besides: `pricing:edit` for the shared draft,
 * `pricing:publish` to publish, cancel a scheduled version or roll back
 * (a roll back doesn't bypass review), and `coupons:manage` for coupons,
 * which apply at once. Every write is idempotent on its key and audited.
 */
@AdminRoutes()
export class AdminPricingController {
    constructor(
        private readonly catalogue: CatalogueService,
        private readonly writes: CatalogueWritesService,
        private readonly coupons: CouponsService,
        private readonly idempotency: IdempotencyService,
    ) {}

    @Get("pricing")
    @RequireAdminPermission(AdminPermission.PricingRead)
    pricingOverview(): Promise<AdminPricing> {
        return this.catalogue.adminPricing(new Date());
    }

    @Get("pricing/impact")
    @RequireAdminPermission(AdminPermission.PricingRead)
    pricingImpact(): Promise<AdminPricingImpact> {
        return this.catalogue.adminImpact(new Date());
    }

    @Post("pricing/preview-token")
    @RequireAdminPermission(AdminPermission.PricingRead)
    pricingPreviewToken(
        @Body() dto: PreviewTokenDto,
    ): Promise<PreviewTokenResult> {
        return this.catalogue.mintPreviewToken(dto.revision, new Date());
    }

    // ── The shared draft ────────────────────────────────────────────────

    @Put("pricing/draft")
    @RequireAdminPermission(
        AdminPermission.PricingRead,
        AdminPermission.PricingEdit,
    )
    saveDraft(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Body() dto: SaveDraftDto,
    ): Promise<DraftSaved> {
        return this.idempotency.run(
            {
                scope: "pricing.draft.save",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            { catalog: dto.catalog, revision: dto.revision },
            () =>
                this.writes.saveDraft(
                    staff.userId,
                    { catalog: dto.catalog, revision: dto.revision },
                    new Date(),
                ),
        );
    }

    @Delete("pricing/draft")
    @RequireAdminPermission(
        AdminPermission.PricingRead,
        AdminPermission.PricingEdit,
    )
    discardDraft(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Body() dto: DiscardDraftDto,
    ): Promise<{ discarded: true }> {
        return this.idempotency.run(
            {
                scope: "pricing.draft.discard",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            { revision: dto.revision, reason: dto.reason ?? "" },
            () => this.writes.discardDraft(staff.userId, dto),
        );
    }

    // ── Versions ────────────────────────────────────────────────────────

    @Post("pricing/publish")
    @RequireAdminPermission(
        AdminPermission.PricingRead,
        AdminPermission.PricingPublish,
    )
    publish(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Body() dto: PublishDto,
    ): Promise<PublishResult> {
        return this.idempotency.run(
            {
                scope: "pricing.version.publish",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            {
                revision: dto.revision,
                goLiveAt: dto.goLiveAt ?? null,
                policy: dto.policy,
                note: dto.note ?? "",
                reason: dto.reason,
            },
            () => this.writes.publish(staff.userId, dto, new Date()),
        );
    }

    /** Cancel a scheduled version, and the moves to it. */
    @Delete("pricing/versions/:version")
    @RequireAdminPermission(
        AdminPermission.PricingRead,
        AdminPermission.PricingPublish,
    )
    cancelVersion(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("version", ParseIntPipe) version: number,
        @Body() dto: CancelVersionDto,
    ): Promise<CancelResult> {
        return this.idempotency.run(
            {
                scope: "pricing.version.cancel",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            { version, reason: dto.reason },
            () =>
                this.writes.cancelVersion(
                    staff.userId,
                    version,
                    dto,
                    new Date(),
                ),
        );
    }

    @Post("pricing/versions/:version/rollback")
    @RequireAdminPermission(
        AdminPermission.PricingRead,
        AdminPermission.PricingPublish,
    )
    rollback(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("version", ParseIntPipe) version: number,
        @Body() dto: RollbackDto,
    ): Promise<PublishResult> {
        return this.idempotency.run(
            {
                scope: "pricing.version.rollback",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            { version, note: dto.note ?? "", reason: dto.reason },
            () => this.writes.rollback(staff.userId, version, dto, new Date()),
        );
    }

    /** Ask the billing provider again for a version's failed plans (U15). */
    @Post("pricing/versions/:version/provider-sync")
    @RequireAdminPermission(
        AdminPermission.PricingRead,
        AdminPermission.PricingPublish,
    )
    retryProviderSync(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("version", ParseIntPipe) version: number,
        @Body() dto: RetryProviderSyncDto,
    ): Promise<{ version: number; retried: number }> {
        return this.idempotency.run(
            {
                scope: "pricing.version.provider-sync",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            { version, reason: dto.reason },
            () =>
                this.writes.retryProviderSync(
                    staff.userId,
                    version,
                    dto,
                    new Date(),
                ),
        );
    }

    // ── Coupons (outside versions) ──────────────────────────────────────

    @Get("pricing/coupons")
    @RequireAdminPermission(AdminPermission.PricingRead)
    listCoupons(): Promise<AdminCoupon[]> {
        return this.coupons.list();
    }

    @Post("pricing/coupons")
    @RequireAdminPermission(
        AdminPermission.PricingRead,
        AdminPermission.CouponsManage,
    )
    createCoupon(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Body() dto: CreateCouponDto,
    ): Promise<AdminCoupon> {
        const fields = {
            code: dto.code,
            discountPaise: dto.discountPaise,
            months: dto.months,
            planIds: dto.planIds,
            maxRedemptions: dto.maxRedemptions,
            expiresAt: dto.expiresAt ?? null,
            active: dto.active ?? false,
        };
        return this.idempotency.run(
            {
                scope: "pricing.coupon.create",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            { ...fields, reason: dto.reason },
            () =>
                this.coupons.create(
                    staff.userId,
                    {
                        ...fields,
                        expiresAt: fields.expiresAt
                            ? new Date(fields.expiresAt)
                            : null,
                        reason: dto.reason,
                        idempotencyKey: dto.idempotencyKey,
                    },
                    new Date(),
                ),
        );
    }

    @Patch("pricing/coupons/:couponId")
    @RequireAdminPermission(
        AdminPermission.PricingRead,
        AdminPermission.CouponsManage,
    )
    updateCoupon(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("couponId") couponId: string,
        @Body() dto: UpdateCouponDto,
    ): Promise<AdminCoupon> {
        return this.idempotency.run(
            {
                scope: "pricing.coupon.update",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            { couponId, ...dto },
            () =>
                this.coupons.update(
                    staff.userId,
                    couponId,
                    {
                        discountPaise: dto.discountPaise,
                        months: dto.months,
                        planIds: dto.planIds,
                        maxRedemptions: dto.maxRedemptions,
                        expiresAt:
                            dto.expiresAt === undefined
                                ? undefined
                                : dto.expiresAt === null
                                  ? null
                                  : new Date(dto.expiresAt),
                        active: dto.active,
                        reason: dto.reason,
                        idempotencyKey: dto.idempotencyKey,
                    },
                    new Date(),
                ),
        );
    }

    /** Delete a coupon (archived instead once a business has used it). */
    @Delete("pricing/coupons/:couponId")
    @RequireAdminPermission(
        AdminPermission.PricingRead,
        AdminPermission.CouponsManage,
    )
    deleteCoupon(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("couponId") couponId: string,
        @Body() dto: DeleteCouponDto,
    ) {
        return this.idempotency.run(
            {
                scope: "pricing.coupon.delete",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            { couponId, reason: dto.reason },
            () => this.coupons.remove(staff.userId, couponId, dto, new Date()),
        );
    }
}
