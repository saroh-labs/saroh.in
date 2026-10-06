import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { env } from "@/env";
import { templateRendersAllowed } from "@/lib/template-renders/guard";
import { templateRenderIndex } from "@/lib/template-renders/render";
import { rootDomain } from "@/lib/test-release";

/**
 * What the template renders can draw (industry templates U14): every
 * gallery template with its colourways and its sample business's pages,
 * for the capture script to walk (`e2e/marketing-shots/template-shots.ts`).
 * Behind the same lock as the pages; a 404 otherwise.
 */
export async function GET() {
    const host = (await headers()).get("host");
    if (
        !templateRendersAllowed({
            host,
            rootDomain: rootDomain(),
            flag: env.TEMPLATE_RENDERS,
            vercelEnv: env.VERCEL_ENV,
        })
    ) {
        return new NextResponse("Not found", {
            status: 404,
            headers: { "x-robots-tag": "noindex" },
        });
    }
    return NextResponse.json(
        { templates: templateRenderIndex() },
        { headers: { "x-robots-tag": "noindex", "cache-control": "no-store" } },
    );
}
