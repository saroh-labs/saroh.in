import { Module } from "@nestjs/common";

import { SignInOptionsController } from "./sign-in-options.controller";

/** Which social sign-in buttons the accounts pages may show. */
@Module({ controllers: [SignInOptionsController] })
export class SignInOptionsModule {}
