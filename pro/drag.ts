/**
 * Перетягування барів і розтягування країв — платна поведінка на безкоштовних
 * гачках. Плагін нічого не мутує: він рахує, що змінилось, і віддає це
 * застосунку. Дані лишаються там, де й були — компонент керований, і плагін не
 * має права заводити власне сховище (рішення 04).
 *
 * Обидва жести живуть в одному плагіні, бо починаються з того самого захвату
 * бара: що саме почалось, вирішує місце — край чи середина. Створення
 * виділенням натомість починається з порожнього місця, тож воно окремо.
 *
 * Тека `pro/` імпортує з `core/` і `vue/`; назад — ніколи (див. README).
 */
import { addDays, diffDays, toEpoch, toIso } from "../core/date";
import { makeGhost, trackPointer } from "./gesture";
import type { Target } from "./gesture";
import type { IsoDate, Item, PlacedItem, Plugin, PluginContext, Resource } from "../core/types";

export type DragEdge = "start" | "end";

/** Ширина зони краю під палець; для миші вистачає значно вужчої. */
const TOUCH_EDGE = 12;

export interface DragMove<R = unknown, I = unknown> {
    item: Item<I>;
    /** Ресурс, з якого забрали, і ресурс, у який поклали. */
    from: Resource<R>;
    to: Resource<R>;
    /** Нові межі елемента; `end` ексклюзивний, як і всюди в контракті. */
    start: IsoDate;
    end: IsoDate;
    /** Зсув у днях; від'ємний — уліво. */
    days: number;
}

export interface DragResize<R = unknown, I = unknown> {
    item: Item<I>;
    resource: Resource<R>;
    /** Який край тягнули; протилежний лишається на місці. */
    edge: DragEdge;
    start: IsoDate;
    end: IsoDate;
}

export interface DragOptions<R = unknown, I = unknown> {
    /**
     * Викликаються на відпусканні, якщо щось справді змінилось. Прийняти чи
     * відхилити — справа застосунку: він володіє даними, ми лише рахуємо.
     * Жест без обробника не починається взагалі: інакше користувач тягав би
     * бар, який нікуди не переїде.
     */
    onMove?: (move: DragMove<R, I>) => void;
    onResize?: (resize: DragResize<R, I>) => void;
    /**
     * Чи дозволено таку ціль. Питається на кожному русі, тож заборонене місце
     * видно ще під час жесту — і відпускання на ньому нічого не робить.
     * Правила знає застосунок: перетин із чужою подією, чужий рядок, минуле.
     */
    canMove?: (move: DragMove<R, I>) => boolean;
    canResize?: (resize: DragResize<R, I>) => boolean;
    /** Клас на привида — щоб застосунок оформив його по-своєму. */
    className?: string;
    /** Скільки пікселів треба провезти, перш ніж це вважатиметься жестом. */
    threshold?: number;
    /** Скільки тримати палець, щоб жест почався на дотик; типово 400 мс. */
    longPress?: number;
    /** Ширина зони захвату краю. */
    edgeSize?: number;
}

interface Grab<R, I> {
    placed: PlacedItem<I>;
    resource: Resource<R>;
    resourceIndex: number;
    /** Край, якщо тягнуть край; null — переїзд цілком. */
    edge: DragEdge | null;
    /** За скільки днів від початку бара його схопили. */
    grabOffset: number;
}

export function drag<R = unknown, I = unknown>(options: DragOptions<R, I> = {}): Plugin<R, I> {
    return {
        name: "drag",
        setup(ctx: PluginContext<R, I>) {
            const rootEl = ctx.getRoot();
            const overlayEl = ctx.getOverlay();
            if (rootEl === null || overlayEl === null) return;

            // Окремі імена після перевірки: звуження типу не переживає
            // оголошення функцій — вони підняті, тож із погляду компілятора
            // можуть виконатись і до неї.
            const root: HTMLElement = rootEl;
            const overlay: HTMLElement = overlayEl;
            const edgeSize = options.edgeSize ?? 6;

            let hovered: HTMLElement | null = null;

            function findBar(id: string): Grab<R, I> | undefined {
                const rows = ctx.getLayout().rows;
                for (let index = 0; index < rows.length; index++) {
                    const placed = rows[index].bars.find((candidate) => candidate.item.id === id);
                    if (placed !== undefined) {
                        return {
                            placed,
                            resource: rows[index].resource,
                            resourceIndex: index,
                            edge: null,
                            grabOffset: 0,
                        };
                    }
                }
                return undefined;
            }

            /**
             * Край під курсором. Зона не більша за третину бара: на дні в 30
             * пікселів дві шестипіксельні смуги ще лишають середину, з якої
             * бар можна взяти цілком.
             *
             * Пальцю шість пікселів не дати: він накриває десяток, і в край
             * потрапляв би навмання — то розтягнув, то переїхав. Тому на дотик
             * зона ширша; третина лишається стелею, тож середина є завжди.
             */
            function edgeAt(bar: HTMLElement, x: number, touch = false): DragEdge | null {
                if (options.onResize === undefined) return null;

                const rect = bar.getBoundingClientRect();
                const zone = Math.min(touch ? Math.max(edgeSize, TOUCH_EDGE) : edgeSize, rect.width / 3);
                if (x - rect.left <= zone) return "start";
                if (rect.right - x <= zone) return "end";
                return null;
            }

            /** Курсор біля краю — інакше про розтягування ніхто не здогадається. */
            function onHover(event: MouseEvent) {
                const bar = (event.target as HTMLElement).closest<HTMLElement>(".rt__bar");
                if (hovered !== null && hovered !== bar) {
                    hovered.style.cursor = "";
                    hovered = null;
                }
                if (bar === null) return;

                bar.style.cursor = edgeAt(bar, event.clientX) === null ? "" : "ew-resize";
                hovered = bar;
            }

            /**
             * Скільки днів між двома колонками осі. Рахуємо саме так, а не
             * різницею дат елемента: бар міг бути обрізаний краєм діапазону, і
             * тоді видимий початок — не початок елемента.
             */
            function shiftBetween(fromIndex: number, toIndex: number): number {
                const slots = ctx.getLayout().slots;
                return diffDays(toEpoch(slots[fromIndex].start), toEpoch(slots[toIndex].start));
            }

            function shiftIso(date: IsoDate, days: number): IsoDate {
                return toIso(addDays(toEpoch(date), days));
            }

            /**
             * Що вийде з цієї цілі. Чисті функції, бо потрібні двічі: спершу
             * щоб спитати дозволу під час руху, потім щоб віддати результат.
             * Порахувати двома різними шляхами означало б рано чи пізно
             * дозволити одне, а застосувати інше.
             */
            function moveOf(grab: Grab<R, I>, target: Target): DragMove<R, I> | null {
                const to = ctx.getLayout().rows[target.resourceIndex]?.resource;
                if (to === undefined) return null;

                const item = grab.placed.item;
                const days = shiftBetween(grab.placed.slotIndex, target.slotIndex);

                return {
                    item,
                    from: grab.resource,
                    to,
                    start: shiftIso(item.start, days),
                    end: shiftIso(item.end, days),
                    days,
                };
            }

            function resizeOf(grab: Grab<R, I>, target: Target): DragResize<R, I> | null {
                if (grab.edge === null) return null;

                const item = grab.placed.item;
                const start = grab.placed.slotIndex;
                const end = start + grab.placed.slotSpan;

                if (grab.edge === "start") {
                    const days = shiftBetween(start, target.slotIndex);
                    return {
                        item,
                        resource: grab.resource,
                        edge: "start",
                        start: shiftIso(item.start, days),
                        end: item.end,
                    };
                }

                // Ексклюзивний кінець зсуваємо за останнім укритим днем: сама
                // колонка кінця може лежати вже за межами осі.
                const days = shiftBetween(end - 1, target.slotIndex + target.slotSpan - 1);
                return {
                    item,
                    resource: grab.resource,
                    edge: "end",
                    start: item.start,
                    end: shiftIso(item.end, days),
                };
            }

            /** Чи ціль узагалі відрізняється від того, що вже є. */
            function changed(grab: Grab<R, I>, target: Target): boolean {
                return (
                    target.slotIndex !== grab.placed.slotIndex ||
                    target.slotSpan !== grab.placed.slotSpan ||
                    target.resourceIndex !== grab.resourceIndex
                );
            }

            const ghost = makeGhost(overlay, options.className);
            const untrack = trackPointer<Grab<R, I>>(
                {
                    root,
                    threshold: options.threshold ?? 4,
                    longPress: options.longPress,

                    press(event) {
                        const bar = (event.target as HTMLElement).closest<HTMLElement>(".rt__bar");
                        const id = bar?.dataset.item;
                        if (bar === null || bar === undefined || id === undefined) return null;

                        const grab = findBar(id);
                        const hit = ctx.hitTest({ x: event.clientX, y: event.clientY });
                        if (grab === undefined || hit === null) return null;

                        const edge = edgeAt(bar, event.clientX, event.pointerType === "touch");
                        // Жест без обробника не починається: тягнути бар, який
                        // нікуди не поїде, гірше, ніж не тягнути його зовсім.
                        if (edge === null && options.onMove === undefined) return null;

                        grab.edge = edge;
                        grab.grabOffset = hit.slot.index - grab.placed.slotIndex;
                        return grab;
                    },

                    track(grab, event) {
                        const hit = ctx.hitTest({ x: event.clientX, y: event.clientY });
                        if (hit === null) return null;

                        const slots = ctx.getLayout().slots.length;
                        const start = grab.placed.slotIndex;
                        const end = start + grab.placed.slotSpan;

                        if (grab.edge === "start") {
                            // День мінімум: край не може перескочити протилежний
                            const next = Math.min(Math.max(hit.slot.index, 0), end - 1);
                            return { slotIndex: next, slotSpan: end - next, resourceIndex: grab.resourceIndex };
                        }

                        if (grab.edge === "end") {
                            const next = Math.min(Math.max(hit.slot.index + 1, start + 1), slots);
                            return { slotIndex: start, slotSpan: next - start, resourceIndex: grab.resourceIndex };
                        }

                        // Переїзд: бар, вивезений за край осі, не коротшає —
                        // він просто впирається.
                        const span = grab.placed.slotSpan;
                        const next = Math.min(Math.max(hit.slot.index - grab.grabOffset, 0), slots - span);
                        return { slotIndex: next, slotSpan: span, resourceIndex: hit.resourceIndex };
                    },

                    validate(grab, target) {
                        // Повернення на своє місце забороняти нема за що:
                        // жест просто нічого не зробить.
                        if (!changed(grab, target)) return true;

                        if (grab.edge === null) {
                            const move = moveOf(grab, target);
                            return move === null ? false : (options.canMove?.(move) ?? true);
                        }

                        const resize = resizeOf(grab, target);
                        return resize === null ? false : (options.canResize?.(resize) ?? true);
                    },

                    commit(grab, target) {
                        if (!changed(grab, target)) return;

                        if (grab.edge === null) {
                            const move = moveOf(grab, target);
                            if (move !== null) options.onMove?.(move);
                            return;
                        }

                        const resize = resizeOf(grab, target);
                        if (resize !== null) options.onResize?.(resize);
                    },
                },
                ghost,
                () => ctx.getGeometry(),
            );

            root.addEventListener("pointermove", onHover);

            return () => {
                root.removeEventListener("pointermove", onHover);
                untrack();
            };
        },
    };
}
