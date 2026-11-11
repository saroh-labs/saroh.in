/**
 * Every `/v1` and `/v1/storefront` handler declares the capability a key
 * needs and checks it with `authorize` before it does anything (plan
 * 2026-11-10-001, U8). And the contract (the OpenAPI documents) and the
 * controllers name the same routes, so `v1.json` is complete.
 *
 * The declaration is the handler's contract route: `@ContractRoute(def)`,
 * or the `defineRoute` entry with the handler's surface, method and path.
 * The check is behavioural: each handler is called with a context that
 * holds no action and services that throw if touched, and must refuse
 * with the declared action before it reaches anything.
 */
// better-auth is ESM, which ts-jest can't load; no session is read here.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("@saroh/auth", () => ({ isTrustedOrigin: () => false }));

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Controller, ForbiddenException, Get } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common/enums/request-method.enum";
import type { RouteDef } from "@saroh/api-contract";
import {
    buildOpenApi,
    v1CreateProduct,
    v1ListProducts,
} from "@saroh/api-contract";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import { CONTRACT_ROUTE, ContractRoute } from "./v1-support";

type Ctor = new (...args: unknown[]) => object;

interface Handler {
    controller: Ctor;
    name: string;
    method: string;
    /** The Nest route, `/v1/products/:productId`. */
    route: string;
}

const join2 = (...parts: string[]) =>
    `/${parts
        .flatMap((p) => p.split("/"))
        .filter(Boolean)
        .join("/")}`;

function handlersOf(controller: Ctor): Handler[] {
    const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? "");
    const proto = controller.prototype as Record<string, unknown>;
    return Object.getOwnPropertyNames(proto)
        .filter((name) => name !== "constructor")
        .filter((name) => {
            const fn = proto[name];
            return (
                typeof fn === "function" &&
                Reflect.getMetadata(PATH_METADATA, fn) !== undefined
            );
        })
        .map((name) => {
            const fn = proto[name] as object;
            const verb = Reflect.getMetadata(METHOD_METADATA, fn) as number;
            return {
                controller,
                name,
                method: RequestMethod[verb] ?? String(verb),
                route: join2(
                    base,
                    String(Reflect.getMetadata(PATH_METADATA, fn) ?? ""),
                ),
            };
        });
}

/** Where a route sits in the contract: its surface and its path there. */
function contractPlace(route: string): {
    surface: "v1" | "storefront";
    path: string;
} {
    return route.startsWith("/v1/storefront/")
        ? { surface: "storefront", path: route.slice("/v1/storefront".length) }
        : { surface: "v1", path: route.slice("/v1".length) };
}

const openApiPath = (path: string) => path.replace(/:(\w+)/g, "{$1}");

/** The contract's capability for a handler, or undefined when it has none. */
function declared(handler: Handler): string | null | undefined {
    const fn = (handler.controller.prototype as Record<string, object>)[
        handler.name
    ];
    const def = fn
        ? (Reflect.getMetadata(CONTRACT_ROUTE, fn) as RouteDef | undefined)
        : undefined;
    if (def) return def.capability;
    const { surface, path } = contractPlace(handler.route);
    const op = (
        buildOpenApi(surface).paths[openApiPath(path)] as
            Record<string, { "x-saroh-capability"?: string | null }> | undefined
    )?.[handler.method.toLowerCase()];
    return op?.["x-saroh-capability"];
}

/** A catch-all that only refuses (a storefront key's unknown read). */
const isCatchAll = (h: Handler) => h.route.includes("*");

const untouchable: object = new Proxy(
    {},
    {
        get(_t, prop) {
            if (prop === "then") return undefined;
            throw new Error(`reached a dependency (${String(prop)}) first`);
        },
    },
);

/** The problems with one handler; empty when it declares and checks. */
async function audit(handler: Handler): Promise<string[]> {
    const where = `${handler.method} ${handler.route} (${handler.controller.name}.${handler.name})`;
    const problems: string[] = [];
    const capability = declared(handler);
    if (!capability && !isCatchAll(handler)) {
        problems.push(`${where}: no capability declared`);
    }
    const deps =
        (Reflect.getMetadata("design:paramtypes", handler.controller) as
            unknown[] | undefined) ?? [];
    const instance = new handler.controller(
        ...deps.map(() => untouchable),
    ) as Record<string, (...args: unknown[]) => unknown>;
    const nobody: OrganizationContext = {
        organizationId: "org_scan",
        userId: "user_scan",
        role: "MEMBER",
        actions: new Set(),
    };
    // Every argument is the context: whatever the handler reads first, it
    // must be the refusal.
    const args = Array.from({ length: 8 }, () => nobody);
    try {
        await instance[handler.name]?.apply(instance, args);
        problems.push(`${where}: answered with no action allowed`);
    } catch (error) {
        if (!(error instanceof ForbiddenException)) {
            problems.push(
                `${where}: did not call authorize first (${error instanceof Error ? error.message : String(error)})`,
            );
        } else if (capability) {
            const action = (
                error.getResponse() as { details?: { action?: string } }
            ).details?.action;
            if (action !== capability) {
                problems.push(
                    `${where}: declares ${capability} but authorizes ${action}`,
                );
            }
        }
    }
    return problems;
}

/** Every controller in the API whose path is under `/v1`. */
function v1Controllers(): Ctor[] {
    const src = join(__dirname, "..", "..");
    const files: string[] = [];
    const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (
                entry.name.endsWith(".controller.ts") &&
                /@Controller\(\s*["'`]v1[/"'`]/.test(readFileSync(full, "utf8"))
            ) {
                files.push(full);
            }
        }
    };
    walk(src);
    return files.flatMap((file) =>
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        Object.values(require(file) as Record<string, unknown>).filter(
            (value): value is Ctor =>
                typeof value === "function" &&
                /^v1(\/|$)/.test(
                    String(Reflect.getMetadata(PATH_METADATA, value) ?? ""),
                ),
        ),
    );
}

describe("route capabilities (plan 2026-11-10-001, U8)", () => {
    const handlers = v1Controllers().flatMap(handlersOf);

    it("finds the secret routes", () => {
        expect(handlers.length).toBeGreaterThan(20);
        expect(handlers.map((h) => h.route)).toContain("/v1/products");
    });

    it("every /v1 and /v1/storefront handler declares a capability and authorizes it first", async () => {
        const problems = (await Promise.all(handlers.map(audit))).flat();
        expect(problems).toEqual([]);
    });

    it("the contract and the controllers name the same routes", () => {
        const served = new Set(
            handlers
                .filter((h) => !isCatchAll(h))
                .map((h) => {
                    const { surface, path } = contractPlace(h.route);
                    return `${surface} ${h.method} ${openApiPath(path)}`;
                }),
        );
        const documented = (["v1", "storefront"] as const).flatMap((surface) =>
            Object.entries(buildOpenApi(surface).paths).flatMap(([path, ops]) =>
                Object.keys(ops).map(
                    (m) => `${surface} ${m.toUpperCase()} ${path}`,
                ),
            ),
        );
        expect(documented.filter((r) => !served.has(r))).toEqual([]);
        expect([...served].filter((r) => !documented.includes(r))).toEqual([]);
    });

    describe("fails a handler that", () => {
        @Controller("v1/scan-fixture")
        class Fixture {
            constructor(private readonly dep: { touch(): void }) {}

            /** No contract route, but authorizes. */
            @Get("undeclared")
            undeclared(ctx: OrganizationContext) {
                authorize(ctx, "order:read");
            }

            /** Declared in the contract, never authorizes. */
            @ContractRoute(v1ListProducts)
            open() {
                return [];
            }

            /** Touches a service before it checks. */
            @ContractRoute(v1CreateProduct)
            early(ctx: OrganizationContext) {
                this.dep.touch();
                authorize(ctx, "store:write");
            }
        }

        it("declares nothing, never authorizes, or reaches a service first", async () => {
            const problems = (
                await Promise.all(handlersOf(Fixture as Ctor).map(audit))
            ).flat();
            expect(problems).toEqual([
                expect.stringContaining("undeclared): no capability declared"),
                expect.stringContaining(
                    "open): answered with no action allowed",
                ),
                expect.stringContaining("early): did not call authorize first"),
            ]);
        });
    });
});
