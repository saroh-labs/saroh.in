import { Module } from "@nestjs/common";

import { OrganizationContextModule } from "../organizations/organization-context.module";
import { MembersController } from "./members.controller";
import { MembersService } from "./members.service";

@Module({
    // A storefront invite needs `member:invite` in the business (F16), which
    // the inviter's resolved organization context answers.
    imports: [OrganizationContextModule],
    controllers: [MembersController],
    providers: [MembersService],
    exports: [MembersService],
})
export class MembersModule {}
