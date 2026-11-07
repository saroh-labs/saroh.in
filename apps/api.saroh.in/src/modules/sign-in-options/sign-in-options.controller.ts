import { Controller, Get, Headers } from "@nestjs/common";

import { authEditionOf } from "../../common/auth/auth-address";
import { env } from "../../env";
import { configuredProviders } from "./sign-in-options";

/**
 * PUBLIC, mounted at `/public/sign-in-options` with NO guards: the sign-in
 * pages ask it before anyone is signed in. It says which social providers
 * have their keys set on the sign-in instance this address reaches (each
 * edition's accounts asks its own API address) — names only, never a key.
 */
@Controller("public/sign-in-options")
export class SignInOptionsController {
    @Get()
    options(@Headers("host") host?: string) {
        return {
            providers: configuredProviders(
                env,
                authEditionOf(host, env.BETTER_AUTH_URL),
            ),
        };
    }
}
