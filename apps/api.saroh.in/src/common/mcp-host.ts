import type { NextFunction, Request, Response } from "express";

/**
 * What an MCP address (`mcp.<edition>`) serves (plan 2026-11-10-001, U10):
 * the MCP endpoint and its OAuth discovery documents, nothing else. The
 * rest of the API — Better Auth included — answers only on `api.<edition>`.
 */
const MCP_HOST_PATHS = [
    /^\/mcp\/?$/,
    /^\/\.well-known\/oauth-protected-resource(\/.*)?$/,
    /^\/\.well-known\/oauth-authorization-server(\/.*)?$/,
];

export const isMcpHost = (host: string | undefined) =>
    (host ?? "").trim().toLowerCase().startsWith("mcp.");

export const mcpHostAllows = (path: string) =>
    MCP_HOST_PATHS.some((p) => p.test(path));

/** Middleware, not a guard: a guard would never see the mounted `/api/auth`. */
export function mcpHostOnly(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    if (!isMcpHost(req.headers.host) || mcpHostAllows(req.path)) {
        next();
        return;
    }
    res.status(404).json({ statusCode: 404, message: "Not found" });
}
