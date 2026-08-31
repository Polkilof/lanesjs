import { describe, it, expect } from "vitest";
import { useTimelineRange } from "@/lanes/vue/useTimelineRange";

describe("місячне вікно", () => {
    it("розтягує якір на цілий місяць з ексклюзивним кінцем", () => {
        const { range } = useTimelineRange({ date: "2026-03-15" });

        expect(range.value).toEqual({ start: "2026-03-01", end: "2026-04-01" });
    });

    it("prev і next ходять по місяцях через межу року", () => {
        const { range, prev, next } = useTimelineRange({ date: "2026-01-10" });

        prev();
        expect(range.value).toEqual({ start: "2025-12-01", end: "2026-01-01" });

        next();
        next();
        expect(range.value).toEqual({ start: "2026-02-01", end: "2026-03-01" });
    });

    it("не спотикається об коротший місяць", () => {
        // 31 січня плюс місяць не має ставати 3 березня
        const { range, next } = useTimelineRange({ date: "2026-01-31" });

        next();
        expect(range.value).toEqual({ start: "2026-02-01", end: "2026-03-01" });
    });

    it("count розширює вікно на кілька місяців", () => {
        const { range, next } = useTimelineRange({ date: "2026-03-15", count: 3 });

        expect(range.value).toEqual({ start: "2026-03-01", end: "2026-06-01" });

        next();
        expect(range.value).toEqual({ start: "2026-06-01", end: "2026-09-01" });
    });
});

describe("тижневе й денне вікно", () => {
    it("тиждень починається з понеділка за замовчуванням", () => {
        // 2026-03-15 — неділя
        const { range } = useTimelineRange({ unit: "week", date: "2026-03-15" });

        expect(range.value).toEqual({ start: "2026-03-09", end: "2026-03-16" });
    });

    it("weekStartsOn зсуває початок тижня", () => {
        const { range } = useTimelineRange({ unit: "week", date: "2026-03-15", weekStartsOn: 0 });

        expect(range.value).toEqual({ start: "2026-03-15", end: "2026-03-22" });
    });

    it("денне вікно рухається по днях", () => {
        const { range, next, prev } = useTimelineRange({ unit: "day", date: "2026-03-15", count: 3 });

        expect(range.value).toEqual({ start: "2026-03-15", end: "2026-03-18" });

        next();
        expect(range.value).toEqual({ start: "2026-03-18", end: "2026-03-21" });

        prev();
        expect(range.value).toEqual({ start: "2026-03-15", end: "2026-03-18" });
    });
});

describe("перехід до дати", () => {
    it("gotoDate переносить вікно на місяць цієї дати", () => {
        const { range, gotoDate } = useTimelineRange({ date: "2026-03-15" });

        gotoDate("2026-09-04");
        expect(range.value).toEqual({ start: "2026-09-01", end: "2026-10-01" });
    });

    it("today повертає вікно на поточний місяць", () => {
        const { anchor, today } = useTimelineRange({ date: "2020-01-01" });

        today();
        expect(anchor.value).not.toBe("2020-01-01");
        expect(anchor.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});

describe("заголовок", () => {
    it("для місяця показує місяць і рік", () => {
        const { title } = useTimelineRange({ date: "2026-03-15", locale: "uk-UA" });

        expect(title.value).toContain("2026");
        expect(title.value.toLowerCase()).toContain("берез");
    });

    it("для тижня показує межі періоду", () => {
        const { title } = useTimelineRange({ unit: "week", date: "2026-03-15", locale: "uk-UA" });

        expect(title.value).toContain("–");
    });

    it("formatTitle перекриває типовий заголовок", () => {
        const { title } = useTimelineRange({
            date: "2026-03-15",
            formatTitle: (range, unit) => `${unit}:${range.start}`,
        });

        expect(title.value).toBe("month:2026-03-01");
    });
});
