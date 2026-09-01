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
import { clamp, dayAxis, dayUnder } from "./days";
import { guard } from "./license";
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
    /**
     * Межі елемента в днях осі; кінець ексклюзивний. Від'ємний початок означає
     * бар, обрізаний лівим краєм діапазону, — і саме тому вони тут, а не
     * виводяться з видимого прямокутника: у нього обрізане не влазить.
     */
    startDay: number;
    endDay: number;
    /** День осі, за який узяли бар. */
    grabDay: number;
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
                const layout = ctx.getLayout();
                const axis = dayAxis(layout);
                const rows = layout.rows;

                for (let index = 0; index < rows.length; index++) {
                    const placed = rows[index].bars.find((candidate) => candidate.item.id === id);
                    if (placed !== undefined) {
                        return {
                            placed,
                            resource: rows[index].resource,
                            resourceIndex: index,
                            edge: null,
                            startDay: axis.dayOf(placed.item.start),
                            endDay: axis.dayOf(placed.item.end),
                            grabDay: 0,
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
             * Видимий прямокутник бара в днях. Обрізане краєм діапазону сюди
             * не входить — привид малює лише те, що видно, — але дати
             * рахуються не з нього, а з самого елемента.
             */
            function visible(grab: Grab<R, I>): { from: number; to: number } {
                const axis = dayAxis(ctx.getLayout());
                return { from: Math.max(grab.startDay, 0), to: Math.min(grab.endDay, axis.length) };
            }

            /** Прямокутник для привида. Колонки дробові: він рахує пікселі. */
            function rect(from: number, to: number, resourceIndex: number): Target {
                const axis = dayAxis(ctx.getLayout());
                return {
                    slotIndex: axis.slotOf(from),
                    slotSpan: axis.slotOf(to - from),
                    resourceIndex,
                };
            }

            /**
             * Що вийде з цієї цілі. Чисті функції, бо потрібні двічі: спершу
             * щоб спитати дозволу під час руху, потім щоб віддати результат.
             * Порахувати двома різними шляхами означало б рано чи пізно
             * дозволити одне, а застосувати інше.
             */
            function moveOf(grab: Grab<R, I>, target: Target): DragMove<R, I> | null {
                const layout = ctx.getLayout();
                const to = layout.rows[target.resourceIndex]?.resource;
                if (to === undefined) return null;

                const axis = dayAxis(layout);
                const item = grab.placed.item;
                const days = axis.dayOfSlot(target.slotIndex) - visible(grab).from;

                return {
                    item,
                    from: grab.resource,
                    to,
                    start: axis.dateAt(grab.startDay + days),
                    end: axis.dateAt(grab.endDay + days),
                    days,
                };
            }

            /**
             * Розтягування рахується в днях і від меж самого елемента, а не
             * від видимих колонок. Інакше при кроці "week" край не мав куди
             * зрушити всередині тижня, а перестрибнувши його — вивертав подію
             * навиворіт: кінець опинявся раніше за початок.
             *
             * Мінімум — один день, і це не порада, а межа контракту: `end`
             * ексклюзивний, тож подія, коротша за день, не існує.
             */
            function resizeOf(grab: Grab<R, I>, target: Target): DragResize<R, I> | null {
                if (grab.edge === null) return null;

                const axis = dayAxis(ctx.getLayout());
                const item = grab.placed.item;

                if (grab.edge === "start") {
                    const day = Math.min(axis.dayOfSlot(target.slotIndex), grab.endDay - 1);
                    return {
                        item,
                        resource: grab.resource,
                        edge: "start",
                        start: axis.dateAt(day),
                        end: item.end,
                    };
                }

                const day = Math.max(axis.dayOfSlot(target.slotIndex + target.slotSpan), grab.startDay + 1);
                return {
                    item,
                    resource: grab.resource,
                    edge: "end",
                    start: item.start,
                    end: axis.dateAt(day),
                };
            }

            /** Чи ціль узагалі відрізняється від того, що вже є. */
            function changed(grab: Grab<R, I>, target: Target): boolean {
                const axis = dayAxis(ctx.getLayout());
                const box = visible(grab);

                return (
                    axis.dayOfSlot(target.slotIndex) !== box.from ||
                    axis.dayOfSlot(target.slotIndex + target.slotSpan) !== box.to ||
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

                        const axis = dayAxis(ctx.getLayout());
                        grab.edge = edge;
                        grab.grabDay = dayUnder(
                            event.clientX,
                            overlay,
                            ctx.getGeometry().slotWidth,
                            axis.perSlot,
                        );

                        // Привид знає, чиє він відображення: висоту й місце в
                        // рядку бере з бара, який тягнуть.
                        ghost.fit(bar);
                        return grab;
                    },

                    track(grab, event) {
                        const hit = ctx.hitTest({ x: event.clientX, y: event.clientY });
                        if (hit === null) return null;

                        const axis = dayAxis(ctx.getLayout());
                        const day = dayUnder(event.clientX, overlay, ctx.getGeometry().slotWidth, axis.perSlot);
                        const box = visible(grab);

                        if (grab.edge === "start") {
                            // День мінімум: край не може перескочити протилежний.
                            const next = clamp(day, 0, grab.endDay - 1);
                            return rect(next, box.to, grab.resourceIndex);
                        }

                        if (grab.edge === "end") {
                            // Кінець ексклюзивний, тож день під вказівником
                            // ще входить у подію — звідси +1.
                            const next = clamp(day + 1, grab.startDay + 1, axis.length);
                            return rect(box.from, next, grab.resourceIndex);
                        }

                        // Переїзд: бар, вивезений за край осі, не коротшає —
                        // він просто впирається.
                        const span = box.to - box.from;
                        const next = clamp(day - (grab.grabDay - box.from), 0, axis.length - span);
                        return rect(next, next + span, hit.resourceIndex);
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

            /**
             * Те саме, що жест, але з клавіатури. Без цього все, що вміє миша,
             * для клавіатури просто не існує — а це вже не незручність, а
             * недоступність: користувач бачить бар, чує його ім'я й не може
             * зробити з ним нічого.
             *
             * Shift — увесь бар, Alt — його край: та сама пара, що середина й
             * край під вказівником. Голі стрілки не наші, ними ходить фокус.
             */
            function onKeydown(event: KeyboardEvent) {
                if (!event.shiftKey && !event.altKey) return;

                const bar = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(".rt__bar");
                const id = bar?.dataset.item;
                if (id === undefined) return;

                const days = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                const rows = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
                if (days === 0 && rows === 0) return;

                const grab = findBar(id);
                if (grab === undefined) return;

                const layout = ctx.getLayout();
                const axis = dayAxis(layout);
                const box = visible(grab);

                if (event.altKey) {
                    if (options.onResize === undefined || days === 0) return;

                    // День — мінімум, край осі — межа: ті самі правила, що й у
                    // жесті, і так само в днях, а не в колонках.
                    const next = box.to + days;
                    if (next <= grab.startDay || next > axis.length) return;

                    grab.edge = "end";
                    const resize = resizeOf(grab, rect(box.from, next, grab.resourceIndex));
                    if (resize === null || !(options.canResize?.(resize) ?? true)) return;

                    event.preventDefault();
                    options.onResize(resize);
                    return;
                }

                if (options.onMove === undefined) return;

                const span = box.to - box.from;
                const from = clamp(box.from + days, 0, axis.length - span);
                const target = {
                    ...rect(from, from + span, 0),
                    resourceIndex: Math.min(Math.max(grab.resourceIndex + rows, 0), layout.rows.length - 1),
                };
                if (!changed(grab, target)) return;

                const move = moveOf(grab, target);
                if (move === null || !(options.canMove?.(move) ?? true)) return;

                event.preventDefault();
                options.onMove(move);
            }

            root.addEventListener("pointermove", onHover);
            root.addEventListener("keydown", onKeydown);
            const unguard = guard(root);

            return () => {
                root.removeEventListener("pointermove", onHover);
                root.removeEventListener("keydown", onKeydown);
                untrack();
                unguard();
            };
        },
    };
}
