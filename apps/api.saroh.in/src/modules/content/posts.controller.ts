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
import { CreatePostDto, UpdatePostDto } from "./dto";
import { PostsService } from "./posts.service";

@Controller("stores/:storeId/posts")
@UseGuards(BetterAuthGuard)
export class PostsController {
    constructor(private readonly posts: PostsService) {}

    @Get()
    list(@CurrentUser() user: AuthUser, @Param("storeId") storeId: string) {
        return this.posts.list(storeId, user.id);
    }

    @Post()
    @HttpCode(201)
    create(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: CreatePostDto,
    ) {
        return this.posts.create(storeId, user.id, dto);
    }

    @Get(":postId")
    get(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("postId") postId: string,
    ) {
        return this.posts.get(storeId, postId, user.id);
    }

    @Put(":postId")
    update(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("postId") postId: string,
        @Body() dto: UpdatePostDto,
    ) {
        return this.posts.update(storeId, postId, user.id, dto);
    }

    @Delete(":postId")
    remove(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("postId") postId: string,
    ) {
        return this.posts.remove(storeId, postId, user.id);
    }
}
