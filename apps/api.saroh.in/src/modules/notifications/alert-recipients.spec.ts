/**
 * Who is emailed a new enquiry or a customer's message (audit 2026-11-12
 * #1–2): whoever's resolved permissions (role row plus extras) read it, who
 * hasn't turned that email off, and who isn't paused. Never by role name.
 */
jest.mock("@saroh/database", () => ({
    prisma: {
        membership: { findMany: jest.fn() },
        organizationRole: { findMany: jest.fn() },
        notificationPreference: { findMany: jest.fn() },
    },
}));
jest.mock("../billing/over-limit.service", () => ({
    overLimit: { pausedNow: jest.fn() },
}));

import { prisma } from "@saroh/database";

import { overLimit } from "../billing/over-limit.service";
import { emailedAbout } from "./alert-recipients";

const members = prisma.membership.findMany as jest.Mock;
const roles = prisma.organizationRole.findMany as jest.Mock;
const prefs = prisma.notificationPreference.findMany as jest.Mock;
const pausedNow = overLimit.pausedNow as jest.Mock;

const person = (id: string, role: string, extraActions: string[] = []) => ({
    id: `m_${id}`,
    userId: id,
    role,
    extraActions,
    user: { email: `${id}@example.com` },
});

beforeEach(() => {
    jest.clearAllMocks();
    roles.mockResolvedValue([]);
    prefs.mockResolvedValue([]);
    pausedNow.mockResolvedValue(null);
});

describe("emailedAbout", () => {
    it("emails the built-in Owner and Admin, who read leads, and not a Member", async () => {
        members.mockResolvedValue([
            person("owner", "OWNER"),
            person("admin", "ADMIN"),
            person("member", "MEMBER"),
        ]);
        await expect(emailedAbout("org_1", "enquiry")).resolves.toEqual([
            "owner@example.com",
            "admin@example.com",
        ]);
    });

    it("leaves out an Admin whose role row lacks lead:read", async () => {
        members.mockResolvedValue([person("admin", "ADMIN")]);
        roles.mockResolvedValue([
            { key: "ADMIN", actions: ["org:read", "contact:read"] },
        ]);
        await expect(emailedAbout("org_1", "enquiry")).resolves.toEqual([]);
    });

    it("emails a role the business made with lead:read", async () => {
        members.mockResolvedValue([person("desk", "front-desk")]);
        roles.mockResolvedValue([
            { key: "front-desk", actions: ["org:read", "lead:read"] },
        ]);
        await expect(emailedAbout("org_1", "enquiry")).resolves.toEqual([
            "desk@example.com",
        ]);
    });

    it("emails a Member given lead:read as an extra permission", async () => {
        members.mockResolvedValue([person("member", "MEMBER", ["lead:read"])]);
        await expect(emailedAbout("org_1", "enquiry")).resolves.toEqual([
            "member@example.com",
        ]);
    });

    it("emails nobody who turned that email off", async () => {
        members.mockResolvedValue([person("owner", "OWNER")]);
        prefs.mockResolvedValue([
            {
                userId: "owner",
                event: "enquiry",
                channel: "email",
                enabled: false,
            },
        ]);
        await expect(emailedAbout("org_1", "enquiry")).resolves.toEqual([]);
        expect(prefs).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId: "org_1",
                    event: "enquiry",
                    channel: "email",
                },
            }),
        );
    });

    it("leaves out a paused member, never the owner", async () => {
        members.mockResolvedValue([
            person("owner", "OWNER"),
            person("admin", "ADMIN"),
        ]);
        pausedNow.mockResolvedValue({
            memberIds: new Set(["m_owner", "m_admin"]),
        });
        await expect(emailedAbout("org_1", "enquiry")).resolves.toEqual([
            "owner@example.com",
        ]);
    });

    it("asks message:read for a customer's message", async () => {
        members.mockResolvedValue([
            person("desk", "front-desk"),
            person("sales", "sales"),
        ]);
        roles.mockResolvedValue([
            { key: "front-desk", actions: ["message:read"] },
            { key: "sales", actions: ["lead:read"] },
        ]);
        await expect(emailedAbout("org_1", "message")).resolves.toEqual([
            "desk@example.com",
        ]);
    });
});
