/**
 * Розкладка таймлайна: діапазон і події → слоти осі та покладені на сітку бари.
 *
 * Без DOM, без Vue, без Date.now() — усе, що впливає на результат, приходить
 * у `LayoutInput`. Координати віддаються у слотах, не в пікселях (рішення 06).
 */

import type {
    DateRange,
    IsoDate,
    Item,
    Layout,
    LayoutInput,
    PlacedItem,
    Row,
    Slot,
    SlotStep,
} from "./types";

const MS_PER_DAY = 86_400_000;
const DEFAULT_WEEKEND_DAYS = [0, 6];
const DEFAULT_WEEK_STARTS_ON = 1;

/**
 * YYYY-MM-DD → епоха UTC-опівночі. Уся арифметика йде в UTC, щоб перехід на
 * літній час не зсував межі днів; локальний час з'являється лише в `Slot.date`.
 */
function toEpoch(date: IsoDate): number {
    const [year, month, day] = date.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
}

function toIso(epoch: number): IsoDate {
    return new Date(epoch).toISOString().slice(0, 10);
}

/** Локальна опівніч — лише для форматерів у шарі vue (рішення 05). */
function toLocalDate(epoch: number): Date {
    const utc = new Date(epoch);
    return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

function addDays(epoch: number, days: number): number {
    return epoch + days * MS_PER_DAY;
}

function diffDays(from: number, to: number): number {
    return Math.round((to - from) / MS_PER_DAY);
}

/** День тижня, 0 — неділя. */
function weekday(epoch: number): number {
    return new Date(epoch).getUTCDay();
}

function startOfWeek(epoch: number, weekStartsOn: number): number {
    return addDays(epoch, -((weekday(epoch) - weekStartsOn + 7) % 7));
}

function slotSize(step: SlotStep): number {
    return step === "week" ? 7 : 1;
}

interface Axis {
    slots: Slot[];
    /** Фактичний діапазон осі: при кроці «тиждень» ширший за заданий. */
    range: DateRange;
}

/**
 * Будує колонки осі. При кроці «тиждень» початок відсувається назад до початку
 * тижня — вісь завжди складається з цілих слотів, обрізаних колонок не буває.
 */
function buildAxis(
    range: DateRange,
    step: SlotStep,
    today: IsoDate | undefined,
    weekendDays: number[],
    weekStartsOn: number,
): Axis {
    const size = slotSize(step);
    const requestedStart = toEpoch(range.start);
    const requestedEnd = toEpoch(range.end);
    const axisStart = step === "week" ? startOfWeek(requestedStart, weekStartsOn) : requestedStart;
    const todayEpoch = today === undefined ? null : toEpoch(today);

    const slots: Slot[] = [];
    for (let cursor = axisStart, index = 0; cursor < requestedEnd; cursor = addDays(cursor, size), index++) {
        const end = addDays(cursor, size);
        slots.push({
            index,
            start: toIso(cursor),
            end: toIso(end),
            date: toLocalDate(cursor),
            isToday: todayEpoch !== null && todayEpoch >= cursor && todayEpoch < end,
            isWeekend: step === "day" && weekendDays.includes(weekday(cursor)),
        });
    }

    return {
        slots,
        range: {
            start: toIso(axisStart),
            end: slots.length === 0 ? toIso(axisStart) : slots[slots.length - 1].end,
        },
    };
}

function slotIndexOf(epoch: number, axisStart: number, step: SlotStep): number {
    const days = diffDays(axisStart, epoch);
    return step === "week" ? Math.floor(days / 7) : days;
}

/**
 * Кладе подію на вісь. Повертає null, якщо вона повністю поза видимим вікном.
 *
 * `end`, який не більший за `start`, трактується як один слот: це типова
 * помилка даних, і пробачити її дешевше, ніж мовчки загубити подію.
 */
function place<I>(
    item: Item<I>,
    axisStart: number,
    axisEnd: number,
    step: SlotStep,
): PlacedItem<I> | null {
    const start = toEpoch(item.start);
    const rawEnd = toEpoch(item.end);
    const end = rawEnd > start ? rawEnd : addDays(start, slotSize(step));

    if (end <= axisStart || start >= axisEnd) return null;

    const visibleStart = Math.max(start, axisStart);
    const visibleEnd = Math.min(end, axisEnd);
    const slotIndex = slotIndexOf(visibleStart, axisStart, step);
    const lastSlotIndex = slotIndexOf(addDays(visibleEnd, -1), axisStart, step);

    return {
        item,
        slotIndex,
        slotSpan: Math.max(1, lastSlotIndex - slotIndex + 1),
        lane: 0,
        clippedStart: start < axisStart,
        clippedEnd: end > axisEnd,
    };
}

interface PackResult<I> {
    bars: PlacedItem<I>[];
    laneCount: number;
}

/**
 * Розкладає бари по доріжках так, щоб ті, що перетинаються, не накладались.
 * Жадібний прохід зліва направо: подія сідає в першу доріжку, яка звільнилась.
 *
 * Порядок сортування зафіксований аж до `id`, щоб та сама вхідна пачка завжди
 * давала ту саму картинку — інакше бари «стрибали» б між перерендерами.
 */
function packLanes<I>(bars: PlacedItem<I>[]): PackResult<I> {
    const ordered = [...bars].sort(
        (a, b) =>
            a.slotIndex - b.slotIndex ||
            b.slotSpan - a.slotSpan ||
            (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0),
    );

    const laneEnds: number[] = [];
    for (const placed of ordered) {
        let lane = laneEnds.findIndex((end) => end <= placed.slotIndex);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = placed.slotIndex + placed.slotSpan;
        placed.lane = lane;
    }

    return { bars: ordered, laneCount: Math.max(1, laneEnds.length) };
}

/**
 * Головна функція ядра.
 *
 * Порядок рядків дорівнює порядку `resources` — ядро не сортує й не фільтрує
 * (рішення 04). Події невідомих ресурсів ігноруються; вхідні масиви не мутуються.
 */
export function buildLayout<R = unknown, I = unknown>(input: LayoutInput<R, I>): Layout<R, I> {
    const axis = buildAxis(
        input.range,
        input.step,
        input.today,
        input.weekendDays ?? DEFAULT_WEEKEND_DAYS,
        input.weekStartsOn ?? DEFAULT_WEEK_STARTS_ON,
    );

    const axisStart = toEpoch(axis.range.start);
    const axisEnd = toEpoch(axis.range.end);

    const byResource = new Map<string, Item<I>[]>();
    for (const item of input.items) {
        const bucket = byResource.get(item.resourceId);
        if (bucket) bucket.push(item);
        else byResource.set(item.resourceId, [item]);
    }

    const rows: Row<R, I>[] = input.resources.map((resource) => {
        const bars: PlacedItem<I>[] = [];
        const backgrounds: PlacedItem<I>[] = [];

        for (const item of byResource.get(resource.id) ?? []) {
            const placed = place(item, axisStart, axisEnd, input.step);
            if (placed === null) continue;
            if (item.display === "background") backgrounds.push(placed);
            else bars.push(placed);
        }

        const packed = packLanes(bars);
        return { resource, bars: packed.bars, backgrounds, laneCount: packed.laneCount };
    });

    return { range: axis.range, step: input.step, slots: axis.slots, rows };
}
