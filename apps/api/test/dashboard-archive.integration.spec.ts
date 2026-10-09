import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DealStage, db } from "@crm/db";
import { ConversionService } from "../src/currency/conversion.service";
import { DashboardService } from "../src/dashboard/dashboard.service";

const suffix = "dashboard-archive-" + crypto.randomUUID();
const userId = "user-" + suffix;
const conversion = new ConversionService(db);
const dashboard = new DashboardService(db, conversion);
let companyId: string;
let activeId: string;
let archivedId: string;
let archivedWonId: string;
let before: Awaited<ReturnType<DashboardService["summary"]>>;

beforeAll(async () => {
	await db.user.create({
		data: {
			id: userId,
			name: "Archive QA",
			email: suffix + "@example.test",
			emailVerified: true,
		},
	});
	const company = await db.company.create({
		data: { name: suffix, domain: suffix + ".test" },
	});
	companyId = company.id;
	before = await dashboard.summary(userId, { scope: "everyone" });
	const now = new Date();
	const baseCurrency = await conversion.reportingCurrency();
	const common = {
		companyId,
		ownerId: userId,
		currency: baseCurrency,
		baseCurrency,
		expectedCloseDate: now,
	};
	const active = await db.deal.create({
		data: { ...common, name: "Active", amount: 100, baseAmount: 100 },
	});
	activeId = active.id;
	const archived = await db.deal.create({
		data: {
			...common,
			name: "Archived",
			amount: 900,
			baseAmount: 900,
			archivedAt: now,
		},
	});
	archivedId = archived.id;
	const archivedWon = await db.deal.create({
		data: {
			...common,
			name: "Archived won",
			amount: 500,
			baseAmount: 500,
			stage: DealStage.CLOSED_WON,
			closedAt: now,
			archivedAt: now,
		},
	});
	archivedWonId = archivedWon.id;
	await db.deal.create({
		data: {
			...common,
			name: "Archived unconverted",
			amount: 700,
			baseAmount: null,
			archivedAt: now,
		},
	});
});

afterAll(async () => {
	if (companyId) {
		await db.deal.deleteMany({ where: { companyId } });
		await db.company.delete({ where: { id: companyId } });
	}
	await db.user.deleteMany({ where: { id: userId } });
});

describe("archived deals on the overview", () => {
	it("excludes them from personal counts, money, trends, wins and missing-rate notices", async () => {
		const value = await dashboard.summary(userId, { scope: "me" });
		expect(value.pipeline.totalDeals).toBe(1);
		expect(value.pipeline.totalCents).toBe(10000);
		expect(value.closingThisMonthTotal).toEqual({
			count: 1,
			valueCents: 10000,
		});
		expect(value.wonThisMonth.count).toBe(0);
		expect(value.performance.wins).toBe(0);
		expect(value.unconverted.count).toBe(0);
		expect(value.trend.reduce((sum, row) => sum + row.created, 0)).toBe(10000);
		expect(value.trend.reduce((sum, row) => sum + row.won, 0)).toBe(0);
		expect(value.biggestOpen.map((row) => row.id)).toEqual([activeId]);
	});

	it("applies the same archive filter to the whole team's totals", async () => {
		const value = await dashboard.summary(userId, { scope: "everyone" });
		expect(value.pipeline.totalDeals - before.pipeline.totalDeals).toBe(1);
		expect(value.pipeline.totalCents - before.pipeline.totalCents).toBe(10000);
		expect(
			value.closingThisMonthTotal.count - before.closingThisMonthTotal.count,
		).toBe(1);
		expect(value.unconverted.count).toBe(before.unconverted.count);
		expect(value.wonThisMonth.count).toBe(before.wonThisMonth.count);
		expect(value.biggestOpen.map((row) => row.id)).not.toContain(archivedId);
		expect(value.biggestOpen.map((row) => row.id)).not.toContain(archivedWonId);
	});
});
