/**
 * Дані другого сценарію: команди й люди в них.
 *
 * Окремий модуль, а не гілка в готельному: у них спільного лише те, що обидва
 * віддають `Resource[]` і `Item[]`. Змішавши їх, ми дістали б генератор із
 * прапорцем, який нічого не пояснює.
 *
 * Ієрархії тут немає в жодному типі бібліотеки — вона живе в `meta`, як і будь-що
 * прикладне. Ядро бачить плоский список рядків, і саме тому згортання не
 * потребує від нього нічого: згорнута команда — це просто коротший список.
 */
import { addDays, toEpoch, toIso } from "lanesjs";
import type { DateRange, Item, Resource } from "lanesjs";

/** Рядок або команди, або людини — саме це й вирішує, що малює слот. */
export interface Seat {
    kind: "team" | "person";
    role?: string;
    /** Кому належить рядок людини; у команди порожнє. */
    teamId?: string;
}

export type WorkKind = "feature" | "review" | "leave";

export interface Work {
    title: string;
    kind: WorkKind;
}

export interface Team {
    id: string;
    title: string;
    members: { id: string; title: string; role: string }[];
}

export const TEAMS: Team[] = [
    {
        id: "t-platform",
        title: "Platform",
        members: [
            { id: "p-1", title: "R. Delgado", role: "Tech lead" },
            { id: "p-2", title: "S. Al-Amin", role: "Backend" },
            { id: "p-3", title: "M. Okafor", role: "Backend" },
        ],
    },
    {
        id: "t-product",
        title: "Product",
        members: [
            { id: "p-4", title: "L. Bergström", role: "Design" },
            { id: "p-5", title: "A. Nakamura", role: "Frontend" },
        ],
    },
];

const WORK: { who: string; title: string; kind: WorkKind; at: number; days: number }[] = [
    { who: "p-1", title: "Release 4.2", kind: "feature", at: 0, days: 5 },
    { who: "p-1", title: "Review queue", kind: "review", at: 7, days: 2 },
    { who: "p-1", title: "Migration plan", kind: "feature", at: 11, days: 6 },
    { who: "p-2", title: "Billing API", kind: "feature", at: 1, days: 7 },
    { who: "p-2", title: "On call", kind: "review", at: 10, days: 3 },
    { who: "p-3", title: "Search index", kind: "feature", at: 2, days: 4 },
    { who: "p-3", title: "Parental leave", kind: "leave", at: 8, days: 9 },
    { who: "p-4", title: "Onboarding flow", kind: "feature", at: 0, days: 6 },
    { who: "p-4", title: "Design review", kind: "review", at: 9, days: 2 },
    { who: "p-5", title: "Timeline widget", kind: "feature", at: 3, days: 8 },
    { who: "p-5", title: "Away", kind: "leave", at: 13, days: 4 },
];

/** Робота команди: те, що стоїть на самому рядку команди, а не на людині. */
const TEAM_WORK: { who: string; title: string; kind: WorkKind; at: number; days: number }[] = [
    { who: "t-platform", title: "Quarter planning", kind: "review", at: 0, days: 2 },
    { who: "t-product", title: "Design sprint", kind: "feature", at: 5, days: 4 },
];

/**
 * Плоский список рядків: команда, за нею її люди — але лише якщо команда
 * розгорнута. Фільтрує застосунок, бо порядок `resources` це і є порядок рядків,
 * і ядро в нього не втручається.
 */
export function buildSeats(teams: Team[], expanded: Set<string>): Resource<Seat>[] {
    const rows: Resource<Seat>[] = [];

    for (const team of teams) {
        rows.push({ id: team.id, title: team.title, meta: { kind: "team" } });
        if (!expanded.has(team.id)) continue;

        for (const member of team.members) {
            rows.push({
                id: member.id,
                title: member.title,
                meta: { kind: "person", role: member.role, teamId: team.id },
            });
        }
    }

    return rows;
}

/**
 * Робота від початку діапазону, а не від сталих дат: демо має виглядати
 * однаково в будь-якому місяці, і гортання вперед не має приводити в порожнечу.
 */
export function buildWork(range: DateRange): Item<Work>[] {
    const start = toEpoch(range.start);

    return [...TEAM_WORK, ...WORK].map((entry, index) => ({
        id: "w-" + index,
        resourceId: entry.who,
        start: toIso(addDays(start, entry.at)),
        end: toIso(addDays(start, entry.at + entry.days)),
        meta: { title: entry.title, kind: entry.kind },
    }));
}
