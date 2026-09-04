import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { OrganizationsModule } from "../organizations/organizations.module";
import { PostCategoriesController } from "./post-categories.controller";
import { PostCategoriesService } from "./post-categories.service";
import { PostsController } from "./posts.controller";
import { PostsService } from "./posts.service";

/**
 * A site's writing (ADR-004, #209).
 *
 * Imports {@link OrganizationsModule} for the `OrganizationContextService` that
 * `OrganizationGuard` needs. It no longer depends on `StoresModule`: a post
 * belongs to the site it is published on, so a business with a website and no
 * shop can write.
 */
@Module({
    imports: [forwardRef(() => OrganizationsModule)],
    controllers: [PostsController, PostCategoriesController],
    providers: [PostsService, PostCategoriesService, OrganizationGuard],
    exports: [PostsService, PostCategoriesService],
})
export class ContentModule {}
