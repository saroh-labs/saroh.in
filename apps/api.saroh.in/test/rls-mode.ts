/**
 * The integration suite's RLS mode (#53): `TEST_RLS=on`.
 *
 * A normal run builds its schema with `db push` and connects as the database
 * owner, so no row-level-security policy exists and none could bite. This mode
 * is the readiness test for switching enforcement on in an environment:
 *
 *  1. globalSetup builds the schema by replaying the MIGRATIONS (which is where
 *     the policies live), then creates a login role with NOBYPASSRLS and only
 *     DML rights — what production's runtime role will be.
 *  2. Every worker connects as that role and sets `RLS_ENFORCEMENT=on`.
 *  3. Every `@Injectable()` method called with an organization context — an
 *     `OrganizationContext` object, or a first parameter named
 *     `organizationId`/`orgId` — runs inside `runInOrgContext`, the way
 *     `OrgRlsInterceptor` runs a real request. Specs call services directly
 *     and never pass through the interceptor, so without this nothing would
 *     run with the GUC set and the policies' permissive branch would pass
 *     every test.
 *
 * Fixture writes and assertions that call `prisma` directly still run with no
 * context, as jobs and public routes do.
 */

/** True when the suite should run with RLS enforced over a NOBYPASSRLS role. */
export function isRlsTestMode(env: NodeJS.ProcessEnv = process.env): boolean {
    const v = env.TEST_RLS?.trim().toLowerCase();
    return v === "1" || v === "on" || v === "true";
}

/** The test-only runtime role. Never created outside a test database. */
export const RLS_TEST_ROLE = "saroh_rls_test";

/** Where globalSetup leaves the role's connection URL for the workers. */
export const RLS_URL_ENV = "TEST_RLS_DATABASE_URL";

/** `url` with its user and password swapped for the role's. */
export function roleUrl(url: string, role: string, password: string): string {
    const parsed = new URL(url);
    parsed.username = role;
    parsed.password = password;
    return parsed.toString();
}

type Method = (...args: unknown[]) => unknown;

const CONTEXT_PARAM = /^(?:async\s+)?[\w$]*\s*\(\s*(organizationId|orgId)\b/;

/**
 * The organization a call is made for, when the call carries one: an
 * `OrganizationContext` as the first argument, or a string first argument
 * whose parameter is named `organizationId`/`orgId`.
 */
export function organizationOfCall(
    method: Method,
    args: readonly unknown[],
): string | undefined {
    const first = args[0];
    if (first && typeof first === "object") {
        const ctx = first as Record<string, unknown>;
        if (
            typeof ctx.organizationId === "string" &&
            typeof ctx.userId === "string" &&
            typeof ctx.role === "string"
        ) {
            return ctx.organizationId;
        }
        return undefined;
    }
    if (typeof first === "string" && first.length > 0) {
        if (CONTEXT_PARAM.test(method.toString())) return first;
    }
    return undefined;
}

/**
 * Wrap every prototype method of `target` so a call made for an organization
 * runs inside that organization's RLS context.
 */
export function wrapOrgScopedMethods(
    target: { prototype: object },
    runInOrgContext: <T>(organizationId: string, fn: () => T) => T,
): void {
    const proto = target.prototype as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === "constructor") continue;
        const desc = Object.getOwnPropertyDescriptor(proto, name);
        if (!desc || typeof desc.value !== "function") continue;
        const original = desc.value as Method;
        const wrapped = function (this: unknown, ...args: unknown[]): unknown {
            const organizationId = organizationOfCall(original, args);
            if (!organizationId) return original.apply(this, args);
            return runInOrgContext(organizationId, () =>
                original.apply(this, args),
            );
        };
        // Nest reads parameter metadata off the method; keep it on the wrapper.
        for (const key of Reflect.getOwnMetadataKeys?.(original) ?? []) {
            Reflect.defineMetadata?.(
                key,
                Reflect.getOwnMetadata(key, original),
                wrapped,
            );
        }
        Object.defineProperty(wrapped, "name", { value: original.name });
        Object.defineProperty(proto, name, { ...desc, value: wrapped });
    }
}
