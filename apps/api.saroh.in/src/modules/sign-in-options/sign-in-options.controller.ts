import { Controller, Get } from "@nestjs/common";

import { configuredProviders } from "./sign-in-options";

/**
 * PUBLIC, mounted at `/public/sign-in-options` with NO guards: the sign-in
 * pages ask it before anyone is signed in. It says which social providers
 * have their keys set — names only, never a key.
 */
@Controller("public/sign-in-options")
export class SignInOptionsController {
    @Get()
    options() {
        return { providers: configuredProviders() };
    }
}
