import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    Put,
    UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import type { AuthUser } from "../../common/types/store-context";
import { CreateStoreDto, UpdateStoreDto } from "./dto";
import { StoresService } from "./stores.service";

/**
 * Owner-scoped store endpoints. The owning user is always the authenticated
 * session user (resolved by BetterAuthGuard, read via @CurrentUser) — never
 * client-supplied — and the service enforces ownership on read/update.
 */
@Controller("stores")
@UseGuards(BetterAuthGuard)
export class StoresController {
    constructor(private readonly storesService: StoresService) {}

    @Get()
    list(@CurrentUser() user: AuthUser) {
        return this.storesService.listForUser(user.id);
    }

    @Post()
    @HttpCode(201)
    create(@CurrentUser() user: AuthUser, @Body() dto: CreateStoreDto) {
        return this.storesService.createForUser(user.id, dto);
    }

    @Get(":id")
    get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.storesService.getForUser(id, user.id);
    }

    @Put(":id")
    update(
        @CurrentUser() user: AuthUser,
        @Param("id") id: string,
        @Body() dto: UpdateStoreDto,
    ) {
        return this.storesService.updateForUser(user.id, id, dto);
    }
}
