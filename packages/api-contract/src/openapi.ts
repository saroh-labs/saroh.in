import { z } from "zod";

import { errorEnvelope } from "./common";

export type Surface = "v1" | "storefront";
export type Method = "get" | "post" | "put" | "patch" | "delete";

export interface RouteDef {
    method: Method;
    /** Express style, as the controller writes it: `/products/:productId`. */
    path: string;
    surface: Surface;
    tag: string;
    summary: string;
    request?: {
        params?: z.ZodObject;
        query?: z.ZodObject;
        body?: z.ZodType;
    };
    responses: Partial<Record<number, z.ZodType>>;
    /** The capability a key needs; null only for a route open to any key on its surface. */
    capability: string | null;
}

const routes: RouteDef[] = [];

/** Registers a public route so its schemas reach the OpenAPI document. */
export function defineRoute<const R extends RouteDef>(route: R): R {
    if (
        routes.some(
            (r) =>
                r.surface === route.surface &&
                r.method === route.method &&
                r.path === route.path,
        )
    ) {
        throw new Error(
            `Route ${route.method.toUpperCase()} ${route.path} is defined twice`,
        );
    }
    routes.push(route);
    return route;
}

const TITLES: Record<Surface, string> = {
    v1: "Saroh API",
    storefront: "Saroh Storefront API",
};

type JsonSchema = Record<string, unknown>;

function toSchema(schema: z.ZodType, io: "input" | "output"): JsonSchema {
    const { $schema: _dialect, ...json } = z.toJSONSchema(schema, {
        target: "draft-2020-12",
        io,
        reused: "inline",
        cycles: "throw",
    }) as JsonSchema;
    // A nested `#/$defs` ref would point at the OpenAPI document's root.
    if ("$defs" in json) {
        throw new Error(
            "A contract schema has an id; the OpenAPI build inlines schemas",
        );
    }
    return json;
}

function parameters(location: "path" | "query", shape: z.ZodObject) {
    return Object.entries(shape.shape).map(([name, field]) => ({
        name,
        in: location,
        required: !(field as z.ZodType).safeParse(undefined).success,
        schema: toSchema(field as z.ZodType, "input"),
    }));
}

function jsonContent(schema: JsonSchema) {
    return { "application/json": { schema } };
}

function operation(route: RouteDef) {
    const { params, query, body } = route.request ?? {};
    const responses: Record<string, unknown> = {};
    for (const [status, schema] of Object.entries(route.responses)) {
        if (!schema) continue;
        responses[status] = {
            description: schema.description ?? "Success",
            content: jsonContent(toSchema(schema, "output")),
        };
    }
    responses.default = {
        description: "Error",
        content: jsonContent(toSchema(errorEnvelope, "output")),
    };
    const parameterList = [
        ...(params ? parameters("path", params) : []),
        ...(query ? parameters("query", query) : []),
    ];
    return {
        summary: route.summary,
        tags: [route.tag],
        ...(parameterList.length ? { parameters: parameterList } : {}),
        ...(body
            ? {
                  requestBody: {
                      required: true,
                      content: jsonContent(toSchema(body, "input")),
                  },
              }
            : {}),
        responses,
        "x-saroh-capability": route.capability,
    };
}

/** The OpenAPI 3.1 document for one surface. Sorted, so the same routes always give the same file. */
export function buildOpenApi(surface: Surface) {
    const own = routes
        .filter((r) => r.surface === surface)
        .sort(
            (a, b) =>
                a.path.localeCompare(b.path) ||
                a.method.localeCompare(b.method),
        );
    const paths: Record<string, Record<string, unknown>> = {};
    for (const route of own) {
        const path = route.path.replace(/:(\w+)/g, "{$1}");
        (paths[path] ??= {})[route.method] = operation(route);
    }
    return {
        openapi: "3.1.0",
        info: { title: TITLES[surface], version: "1" },
        tags: Array.from(new Set(own.map((r) => r.tag)))
            .sort()
            .map((name) => ({ name })),
        paths,
    };
}
