// The dated launch (LAUNCH_AT): what a build is given before, at and after
// the instant, and how long the scheduled launch run waits. Every case names
// its own instant and its own "now": nothing here reads the clock, the
// environment or the real launch date. Run by `pnpm run check:deploy-env`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
    appVars,
    AT_LAUNCH,
    buildVars,
    deployVarFlags,
    launchInstant,
    parseJsonc,
    withLaunch,
} from "./cf-env.mjs";
import { APPS, LAUNCH_WAIT_MAX_SECONDS, launchWait } from "./cf-plan.mjs";

const LAUNCH_AT = "2031-03-04T16:00:00+05:30";
const AT = Date.UTC(2031, 2, 4, 10, 30, 0);
const at = (offsetMs) => new Date(AT + offsetMs);
const SITE = AT_LAUNCH["saroh.in"];
const WORKSPACE = AT_LAUNCH["app.saroh.in"];

test("the instant is read with its offset", () => {
    assert.equal(launchInstant(LAUNCH_AT), AT);
    assert.equal(launchInstant("2031-03-04T10:30:00Z"), AT);
    assert.equal(launchInstant("2031-03-04T10:30:00.000Z"), AT);
    assert.equal(launchInstant(" 2031-03-04T10:30Z "), AT);
});

test("a value that is not a full instant is not read at all", () => {
    for (const bad of [
        "",
        "soon",
        "2031-03-04",
        "2031-03-04T16:00:00",
        "2031-03-04 16:00:00+05:30",
        "2031-13-40T16:00:00Z",
        "1900000000000",
        1900000000000,
        true,
        null,
        undefined,
    ])
        assert.equal(launchInstant(bad), null, String(bad));
});

test("before the instant a build gets exactly what the file says", () => {
    const vars = { API_URL: "https://api.example.com", LAUNCH_AT };
    assert.deepEqual(withLaunch(vars, SITE, at(-1)), vars);
    assert.deepEqual(withLaunch(vars, WORKSPACE, at(-86_400_000)), vars);
});

test("at the instant and after it, the app's switches are on", () => {
    const vars = { API_URL: "https://api.example.com", LAUNCH_AT };
    assert.deepEqual(withLaunch(vars, SITE, at(0)), {
        ...vars,
        NEXT_PUBLIC_LAUNCH_MODE: "open",
    });
    assert.deepEqual(withLaunch(vars, WORKSPACE, at(86_400_000)), {
        ...vars,
        NEXT_PUBLIC_PLANS: "on",
    });
});

test("the Worker is handed the switches the date added, and only those", () => {
    const vars = { API_URL: "https://api.example.com", LAUNCH_AT };
    assert.equal(deployVarFlags(vars, withLaunch(vars, SITE, at(-1))), "");
    assert.equal(
        deployVarFlags(vars, withLaunch(vars, SITE, at(0))),
        "--var NEXT_PUBLIC_LAUNCH_MODE:open",
    );
    const forced = { LAUNCH_AT, NEXT_PUBLIC_PLANS: "off" };
    assert.equal(
        deployVarFlags(forced, withLaunch(forced, WORKSPACE, at(1))),
        "",
    );
});

test("a switch written in vars wins, before and after", () => {
    const shut = { LAUNCH_AT, NEXT_PUBLIC_LAUNCH_MODE: "waitlist" };
    assert.deepEqual(withLaunch(shut, SITE, at(1)), shut);
    const open = { LAUNCH_AT, NEXT_PUBLIC_LAUNCH_MODE: "open" };
    assert.deepEqual(withLaunch(open, SITE, at(-1)), open);
    const off = { LAUNCH_AT, NEXT_PUBLIC_PLANS: "off" };
    assert.deepEqual(withLaunch(off, WORKSPACE, at(1)), off);
});

test("a LAUNCH_AT that can't be read opens nothing, however late it is", () => {
    for (const bad of ["soon", "2031-03-04", "2031-03-04T16:00:00", ""]) {
        const vars = { LAUNCH_AT: bad };
        assert.deepEqual(withLaunch(vars, SITE, new Date(8.64e15)), vars);
    }
});

test("no LAUNCH_AT, or an app with no switches: nothing changes", () => {
    const vars = { API_URL: "https://api.example.com" };
    assert.equal(withLaunch(vars, SITE, new Date(8.64e15)), vars);
    const dated = { LAUNCH_AT };
    assert.equal(withLaunch(dated, undefined, at(1)), dated);
    assert.equal(AT_LAUNCH["accounts.saroh.in"], undefined);
});

test("the dev environment's builds never change by date", () => {
    for (const dir of Object.values(APPS)) {
        const written = appVars(dir, "development");
        assert.equal(written.LAUNCH_AT, undefined, `${dir} dev vars`);
        assert.deepEqual(
            buildVars(dir, "development", new Date(8.64e15)),
            written,
        );
    }
});

test("production: a build long before any launch is the file as written", () => {
    for (const dir of Object.values(APPS))
        assert.deepEqual(
            buildVars(dir, "production", new Date(0)),
            appVars(dir, "production"),
        );
});

test("every launch switch is hashed, so the build fingerprint changes at the instant", () => {
    const { globalEnv } = parseJsonc(readFileSync("turbo.json", "utf8"));
    for (const switches of Object.values(AT_LAUNCH))
        for (const name of Object.keys(switches))
            assert.ok(
                globalEnv.includes(name),
                `${name} must be in turbo.json's globalEnv (hashed), not only passed through`,
            );
    for (const folder of Object.keys(AT_LAUNCH))
        assert.ok(
            Object.values(APPS).includes(`apps/${folder}`),
            `AT_LAUNCH names ${folder}, which is not a deployed app`,
        );
});

test("the scheduled run waits for the instant, and for the latest one", () => {
    assert.equal(launchWait([LAUNCH_AT], at(-45 * 60_000)), 45 * 60 + 5);
    assert.equal(launchWait([LAUNCH_AT], at(-1)), 6);
    assert.equal(launchWait([LAUNCH_AT], at(0)), 0);
    assert.equal(launchWait([LAUNCH_AT], at(3_600_000)), 0);
    assert.equal(
        launchWait([LAUNCH_AT, "2031-03-04T10:40:00Z"], at(0)),
        10 * 60 + 5,
    );
});

test("the scheduled run deploys nothing when this isn't the launch", () => {
    assert.equal(launchWait([], at(0)), "none");
    assert.equal(launchWait([LAUNCH_AT, "soon"], at(1)), "none");
    assert.equal(
        launchWait([LAUNCH_AT], at(-(LAUNCH_WAIT_MAX_SECONDS + 60) * 1000)),
        "none",
    );
    assert.equal(launchWait([LAUNCH_AT], at(-7 * 86_400_000)), "none");
});
