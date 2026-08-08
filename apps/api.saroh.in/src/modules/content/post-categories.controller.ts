import {
    Body,
    Controller,
    Delete,
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
import { CreatePostCategoryDto, UpdatePostCategoryDto } from "./dto";
import { PostCategoriesService } from "./post-categories.service";

@Controller("stores/:storeId/post-categories")
@UseGuards(BetterAuthGuard)
export class PostCategoriesController {
    constructor(private readonly categories: PostCategoriesService) {}

    @Get()
    list(@CurrentUser() user: AuthUser, @Param("storeId") storeId: string) {
        return this.categories.list(storeId, user.id);
    }

    @Post()
    @HttpCode(201)
    create(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: CreatePostCategoryDto,
    ) {
        return this.categories.create(storeId, user.id, dto);
    }

    @Put(":categoryId")
    update(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("categoryId") categoryId: string,
        @Body() dto: UpdatePostCategoryDto,
    ) {
        return this.categories.update(storeId, categoryId, user.id, dto);
    }

    @Delete(":categoryId")
    remove(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("categoryId") categoryId: string,
    ) {
        return this.categories.remove(storeId, categoryId, user.id);
    }
}
