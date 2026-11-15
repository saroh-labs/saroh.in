import { Controller, Get, NotFoundException, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { authFor } from "../../common/auth/auth";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";

/**
 * The OAuth discovery documents at the root (U9). Better Auth answers them
 * only inside its handler, mounted at `/api/auth/*`, so they are forwarded:
 * on `api.<edition>`, the authorization server's metadata (at the
 * path-inserted `/.well-known/oauth-authorization-server/api/auth`); on
 * `mcp.<edition>`, the protected resource's (`…/oauth-protected-resource`
 * and `…/mcp`), naming `api.<edition>` as who signs in. 404 while `API_MCP`
 * is off.
 */
@Controller(".well-known")
export class WellKnownController {
    constructor(private readonly flags: FeatureFlagService) {}

    @Get([
        "oauth-authorization-server{/*rest}",
        "oauth-protected-resource{/*rest}",
    ])
    async document(@Req() req: Request, @Res() res: Response): Promise<void> {
        if (!(await this.flags.isEnabled(FlagKey.API_MCP))) {
            throw new NotFoundException();
        }
        const host = req.headers.host ?? "";
        const answer = await authFor(host).handler(
            new Request(`https://${host}${req.originalUrl}`, {
                headers: { accept: "application/json" },
            }),
        );
        res.status(answer.status);
        const type = answer.headers.get("content-type");
        if (type) res.setHeader("content-type", type);
        res.setHeader("cache-control", "public, max-age=300");
        res.send(await answer.text());
    }
}
