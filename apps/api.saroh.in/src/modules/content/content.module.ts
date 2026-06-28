import { Module } from "@nestjs/common";

import { StoresModule } from "../stores/stores.module";
import { PostCategoriesController } from "./post-categories.controller";
import { PostCategoriesService } from "./post-categories.service";
import { PostsController } from "./posts.controller";
import { PostsService } from "./posts.service";

@Module({
    imports: [StoresModule],
    controllers: [PostsController, PostCategoriesController],
    providers: [PostsService, PostCategoriesService],
    exports: [PostsService, PostCategoriesService],
})
export class ContentModule {}
