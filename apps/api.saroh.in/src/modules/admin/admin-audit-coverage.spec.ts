import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Every write under `/admin` is on the admin ledger (review B5). Auditing
 * is a call in each route's service, so nothing else fails when a new
 * route forgets it: this does. A new POST, PUT, PATCH or DELETE in an
 * `@AdminRoutes()` controller fails here until it is added below, which
 * is the reviewer's cue to check it writes `audit.write` (or
 * `recordRead` for a read-shaped write) in its transaction.
 */
const AUDITED = new Set([
    "admin-account-managers.controller.ts#assignManager",
    "admin-account-managers.controller.ts#endManager",
    "admin-account-managers.controller.ts#shareOut",
    "admin-billing-controls.controller.ts#endAutopay",
    "admin-billing-controls.controller.ts#recheckRefund",
    "admin-billing-controls.controller.ts#recordRefund",
    "admin-billing-controls.controller.ts#resolveAction",
    "admin-billing-controls.controller.ts#syncCustomer",
    "admin-business-reports.controller.ts#markBusinessReportDone",
    "admin-commission.controller.ts#endOwnRate",
    "admin-commission.controller.ts#markPaid",
    "admin-commission.controller.ts#setOwnRate",
    "admin-commission.controller.ts#setRate",
    "admin-contact-messages.controller.ts#markContactMessage",
    "admin-deployments.controller.ts#start",
    "admin-machinery.controller.ts#cancelJobs",
    "admin-machinery.controller.ts#cancelOperation",
    "admin-machinery.controller.ts#recheckDomain",
    "admin-machinery.controller.ts#replay",
    "admin-machinery.controller.ts#retry",
    "admin-organizations.controller.ts#addNote",
    "admin-organizations.controller.ts#changePlan",
    "admin-organizations.controller.ts#liftLegalHold",
    "admin-organizations.controller.ts#moveToLive",
    "admin-organizations.controller.ts#openOrganizationAccess",
    "admin-organizations.controller.ts#placeLegalHold",
    "admin-organizations.controller.ts#raiseLimit",
    "admin-organizations.controller.ts#reinstate",
    "admin-organizations.controller.ts#removeOverride",
    "admin-organizations.controller.ts#repairModules",
    "admin-organizations.controller.ts#revokeLimit",
    "admin-organizations.controller.ts#revokeOrganizationAccess",
    "admin-organizations.controller.ts#scheduleDeletion",
    "admin-organizations.controller.ts#setModule",
    "admin-organizations.controller.ts#setModuleOverride",
    "admin-organizations.controller.ts#setPlanOverride",
    "admin-organizations.controller.ts#setPriceOverride",
    "admin-organizations.controller.ts#suspend",
    "admin-organizations.controller.ts#switchTrackersOff",
    "admin-organizations.controller.ts#switchTrackersOn",
    "admin-organizations.controller.ts#trial",
    "admin-people.controller.ts#changeEmail",
    "admin-people.controller.ts#changeRole",
    "admin-people.controller.ts#confirmEmail",
    "admin-people.controller.ts#confirmOwnerChange",
    "admin-people.controller.ts#endSessions",
    "admin-people.controller.ts#markVerified",
    "admin-people.controller.ts#removeMember",
    "admin-people.controller.ts#resendInvitation",
    "admin-people.controller.ts#sendSignInCode",
    "admin-people.controller.ts#withdrawInvitation",
    "admin-pricing.controller.ts#cancelVersion",
    "admin-pricing.controller.ts#createCoupon",
    "admin-pricing.controller.ts#deleteCoupon",
    "admin-pricing.controller.ts#discardDraft",
    "admin-pricing.controller.ts#pricingPreviewToken",
    "admin-pricing.controller.ts#publish",
    "admin-pricing.controller.ts#retryProviderSync",
    "admin-pricing.controller.ts#rollback",
    "admin-pricing.controller.ts#saveDraft",
    "admin-pricing.controller.ts#updateCoupon",
    "admin-staff.controller.ts#amend",
    "admin-staff.controller.ts#claimPlatformOwner",
    "admin-staff.controller.ts#grant",
    "admin-staff.controller.ts#inviteTeammate",
    "admin-staff.controller.ts#resendInvite",
    "admin-staff.controller.ts#revoke",
    "admin-staff.controller.ts#saveProfile",
    "admin-staff.controller.ts#withdrawInvite",
    "admin-waitlist.controller.ts#invite",
    "admin-waitlist.controller.ts#removeFromWaitlist",
    "admin.controller.ts#clearOverride",
    "admin.controller.ts#setGlobal",
    "admin.controller.ts#setOverride",
    "ai-admin.controller.ts#declineAskAiRequest",
    "ai-admin.controller.ts#endAskAiOverride",
    "ai-admin.controller.ts#grantAskAiRequest",
    "ai-admin.controller.ts#resolveAskAiReport",
    "ai-admin.controller.ts#setAskAiHalt",
    "ai-admin.controller.ts#setAskAiOverride",
    "ai-admin.controller.ts#setAskAiSetting",
    "saroh-leads.controller.ts#addLead",
    "saroh-leads.controller.ts#assignLead",
    "saroh-leads.controller.ts#logBusinessContact",
    "saroh-leads.controller.ts#logLeadContact",
    "saroh-leads.controller.ts#moveLeadStage",
    "saroh-leads.controller.ts#updateLead",
    "search-pages.controller.ts#act",
    "search-pages.controller.ts#deploy",
]);

/** Writes that change nothing: a plan or a preview. */
const DRY_RUNS = new Set([
    "admin-commission.controller.ts#previewOwnRate",
    "admin-machinery.controller.ts#planCancel",
    "admin-machinery.controller.ts#planReplay",
    "admin-machinery.controller.ts#planRetry",
    "admin-organizations.controller.ts#previewOffer",
    "admin-waitlist.controller.ts#planInvite",
]);

const SRC = path.resolve(__dirname, "../..");

function controllerFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) return controllerFiles(full);
        return name.endsWith(".controller.ts") ? [full] : [];
    });
}

function adminWriteRoutes(): string[] {
    const routes: string[] = [];
    for (const file of controllerFiles(SRC)) {
        const source = readFileSync(file, "utf8");
        if (!source.includes("@AdminRoutes()")) continue;
        const write =
            /@(Post|Put|Patch|Delete)\(([^)]*)\)((?:\s*@[\s\S]*?\)\s*)*?)\s*(?:async\s+)?(\w+)\s*\(/g;
        for (const match of source.matchAll(write)) {
            routes.push(`${path.basename(file)}#${match[4]}`);
        }
    }
    return routes.sort();
}

describe("every /admin write is on the ledger", () => {
    const routes = adminWriteRoutes();

    it("finds the write routes", () => {
        expect(routes.length).toBeGreaterThan(80);
    });

    it.each(routes)("%s is listed as audited or as a dry run", (route) => {
        expect({
            route,
            listed: AUDITED.has(route) || DRY_RUNS.has(route),
        }).toEqual({ route, listed: true });
    });

    it("lists nothing that is gone", () => {
        const present = new Set(routes);
        expect(
            [...AUDITED, ...DRY_RUNS].filter((r) => !present.has(r)),
        ).toEqual([]);
    });
});
