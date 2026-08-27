/**
 * Перетягування барів і розтягування країв — платна поведінка на безкоштовних
 * гачках. Плагін нічого не мутує: він рахує, що змінилось, і віддає це
 * застосунку. Дані лишаються там, де й були — компонент керований, і плагін не
 * має права заводити власне сховище (рішення 04).
 *
 * Обидва жести живуть в одному плагіні, бо починаються з того самого
 * pointerdown: два плагіни билися б за нього, і виграв би той, кого підключили
 * першим. Що саме почалось, вирішує місце захвату — край чи середина.
 *
 * Тека `pro/` імпортує з `core/` і `vue/`; назад — ніколи (див. README).
 */
import { addDays, diffDays, toEpoch, toIso } from "../core/date";
import type { IsoDate, Item, PlacedItem, Plugin, PluginContext, Resource, Row } from "../core/types";

export type DragEdge = "start" | "end";

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
    /** Клас на привида — щоб застосунок оформив його по-своєму. */
    className?: string;
    /**
     * Скільки пікселів треба провезти, перш ніж це вважатиметься тягненням.
     * Без порога кожен клік по бару починав би перетягування, і клік зникав би.
     */
    threshold?: number;
    /** Ширина зони захвату краю. */
    edgeSize?: number;
}

/** Прямокутник, який показує привид; обидва жести зводяться до нього. */
interface Target {
    slotIndex: number;
    slotSpan: number;
    resourceIndex: number;
}

interface Gesture<R, I> {
    placed: PlacedItem<I>;
    resource: Resource<R>;
    resourceIndex: number;
    /** Край, якщо тягнуть край; null — переїзд цілком. */
    edge: DragEdge | null;
    /** За скільки днів від початку бара його схопили. */
    grabOffset: number;
    origin: { x: number; y: number };
    active: boolean;
    target: Target | null;
}

export function drag<R = unknown, I = unknown>(options: DragOptions<R, I> = {}): Plugin<R, I> {
    const threshold = options.threshold ?? 4;
    const edgeSize = options.edgeSize ?? 6;

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

            let gesture: Gesture<R, I> | null = null;
            let ghost: HTMLElement | null = null;
            let hovered: HTMLElement | null = null;

            function findBar(id: string): { placed: PlacedItem<I>; row: Row<R, I>; index: number } | undefined {
                const rows = ctx.getLayout().rows;
                for (let index = 0; index < rows.length; index++) {
                    const placed = rows[index].bars.find((candidate) => candidate.item.id === id);
                    if (placed !== undefined) return { placed, row: rows[index], index };
                }
                return undefined;
            }

            /**
             * Край під курсором. Зона не більша за третину бара: на дні в 30
             * пікселів дві шестипіксельні смуги ще лишають середину, з якої
             * бар можна взяти цілком.
             */
            function edgeAt(bar: HTMLElement, x: number): DragEdge | null {
                if (options.onResize === undefined) return null;

                const rect = bar.getBoundingClientRect();
                const zone = Math.min(edgeSize, rect.width / 3);
                if (x - rect.left <= zone) return "start";
                if (rect.right - x <= zone) return "end";
                return null;
            }

            function showGhost(target: Target) {
                const { slotWidth, rowOffsets } = ctx.getGeometry();
                if (ghost === null) {
                    ghost = document.createElement("div");
                    ghost.className = ["rt__ghost", options.className].filter(Boolean).join(" ");
                    // Базовий вигляд інлайном: привид має бути видимий і тоді,
                    // коли застосунок про нього ще нічого не знає.
                    ghost.style.cssText =
                        "position:absolute;border:1px dashed currentColor;border-radius:var(--rt-radius);" +
                        "background:rgba(127,127,127,0.12);pointer-events:none";
                    overlay.appendChild(ghost);
                }

                const top = rowOffsets[target.resourceIndex];
                ghost.style.left = `${target.slotIndex * slotWidth}px`;
                ghost.style.width = `${target.slotSpan * slotWidth}px`;
                ghost.style.top = `${top}px`;
                ghost.style.height = `${rowOffsets[target.resourceIndex + 1] - top}px`;
            }

            function stop() {
                ghost?.remove();
                ghost = null;
                gesture = null;
                root.style.userSelect = "";
            }

            /** Курсор біля краю — інакше про розтягування ніхто не здогадається. */
            function onHover(event: MouseEvent) {
                if (gesture !== null) return;

                const bar = (event.target as HTMLElement).closest<HTMLElement>(".rt__bar");
                if (hovered !== null && hovered !== bar) {
                    hovered.style.cursor = "";
                    hovered = null;
                }
                if (bar === null) return;

                bar.style.cursor = edgeAt(bar, event.clientX) === null ? "" : "ew-resize";
                hovered = bar;
            }

            function onPointerDown(event: MouseEvent) {
                if (event.button !== 0) return;

                const bar = (event.target as HTMLElement).closest<HTMLElement>(".rt__bar");
                const id = bar?.dataset.item;
                if (bar === undefined || bar === null || id === undefined) return;

                const found = findBar(id);
                const hit = ctx.hitTest({ x: event.clientX, y: event.clientY });
                if (found === undefined || hit === null) return;

                const edge = edgeAt(bar, event.clientX);
                // Жест без обробника не починається: тягнути бар, який нікуди
                // не поїде, гірше, ніж не тягнути його зовсім.
                if (edge === null && options.onMove === undefined) return;

                gesture = {
                    placed: found.placed,
                    resource: found.row.resource,
                    resourceIndex: found.index,
                    edge,
                    grabOffset: hit.slot.index - found.placed.slotIndex,
                    origin: { x: event.clientX, y: event.clientY },
                    active: false,
                    target: null,
                };
            }

            /** Куди веде жест при поточному положенні вказівника. */
            function targetOf(current: Gesture<R, I>, hitIndex: number, hitRow: number): Target {
                const slots = ctx.getLayout().slots.length;
                const start = current.placed.slotIndex;
                const end = start + current.placed.slotSpan;

                if (current.edge === "start") {
                    // День мінімум: край не може перескочити протилежний
                    const next = Math.min(Math.max(hitIndex, 0), end - 1);
                    return { slotIndex: next, slotSpan: end - next, resourceIndex: current.resourceIndex };
                }

                if (current.edge === "end") {
                    const next = Math.min(Math.max(hitIndex + 1, start + 1), slots);
                    return { slotIndex: start, slotSpan: next - start, resourceIndex: current.resourceIndex };
                }

                // Переїзд: бар, вивезений за край осі, не коротшає — впирається
                const span = current.placed.slotSpan;
                const next = Math.min(Math.max(hitIndex - current.grabOffset, 0), slots - span);
                return { slotIndex: next, slotSpan: span, resourceIndex: hitRow };
            }

            function onPointerMove(event: MouseEvent) {
                if (gesture === null) return;

                if (!gesture.active) {
                    const moved =
                        Math.abs(event.clientX - gesture.origin.x) + Math.abs(event.clientY - gesture.origin.y);
                    if (moved < threshold) return;

                    gesture.active = true;
                    // Інакше тягнення виділяє підписи барів і рядків
                    root.style.userSelect = "none";
                }

                const hit = ctx.hitTest({ x: event.clientX, y: event.clientY });
                if (hit === null) return;

                gesture.target = targetOf(gesture, hit.slot.index, hit.resourceIndex);
                showGhost(gesture.target);
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

            function commit() {
                if (gesture === null || gesture.target === null) return;

                const { placed, target } = gesture;
                const unchanged = target.slotIndex === placed.slotIndex && target.slotSpan === placed.slotSpan;

                if (gesture.edge !== null) {
                    if (unchanged) return;
                    commitResize(gesture, target);
                    return;
                }

                if (unchanged && target.resourceIndex === gesture.resourceIndex) return;
                commitMove(gesture, target);
            }

            function commitMove(current: Gesture<R, I>, target: Target) {
                const to = ctx.getLayout().rows[target.resourceIndex]?.resource;
                if (to === undefined || options.onMove === undefined) return;

                const item = current.placed.item;
                const days = shiftBetween(current.placed.slotIndex, target.slotIndex);

                options.onMove({
                    item,
                    from: current.resource,
                    to,
                    start: shiftIso(item.start, days),
                    end: shiftIso(item.end, days),
                    days,
                });
            }

            function commitResize(current: Gesture<R, I>, target: Target) {
                if (options.onResize === undefined || current.edge === null) return;

                const item = current.placed.item;
                const start = current.placed.slotIndex;
                const end = start + current.placed.slotSpan;

                if (current.edge === "start") {
                    const days = shiftBetween(start, target.slotIndex);
                    options.onResize({
                        item,
                        resource: current.resource,
                        edge: "start",
                        start: shiftIso(item.start, days),
                        end: item.end,
                    });
                    return;
                }

                // Ексклюзивний кінець зсуваємо за останнім укритим днем: сама
                // колонка кінця може лежати вже за межами осі.
                const days = shiftBetween(end - 1, target.slotIndex + target.slotSpan - 1);
                options.onResize({
                    item,
                    resource: current.resource,
                    edge: "end",
                    start: item.start,
                    end: shiftIso(item.end, days),
                });
            }

            function onPointerUp() {
                commit();
                stop();
            }

            root.addEventListener("pointerdown", onPointerDown);
            root.addEventListener("pointermove", onHover);
            window.addEventListener("pointermove", onPointerMove);
            window.addEventListener("pointerup", onPointerUp);
            window.addEventListener("pointercancel", onPointerUp);

            return () => {
                root.removeEventListener("pointerdown", onPointerDown);
                root.removeEventListener("pointermove", onHover);
                window.removeEventListener("pointermove", onPointerMove);
                window.removeEventListener("pointerup", onPointerUp);
                window.removeEventListener("pointercancel", onPointerUp);
                stop();
            };
        },
    };
}
