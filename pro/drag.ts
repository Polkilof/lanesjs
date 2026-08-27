/**
 * Перетягування барів між датами й ресурсами — платна поведінка на
 * безкоштовних гачках. Плагін нічого не мутує: він рахує, куди елемент
 * переїхав, і віддає це застосунку. Дані лишаються там, де й були — компонент
 * керований, і плагін не має права заводити власне сховище (рішення 04).
 *
 * Тека `pro/` імпортує з `core/` і `vue/`; назад — ніколи (див. README).
 */
import { addDays, diffDays, toEpoch, toIso } from "../core/date";
import type { IsoDate, Item, PlacedItem, Plugin, PluginContext, Resource, Row } from "../core/types";

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

export interface DragOptions<R = unknown, I = unknown> {
    /**
     * Викликається на відпусканні, якщо елемент справді переїхав. Прийняти чи
     * відхилити — справа застосунку: він володіє даними, ми лише рахуємо.
     */
    onMove?: (move: DragMove<R, I>) => void;
    /** Клас на привида — щоб застосунок оформив його по-своєму. */
    className?: string;
    /**
     * Скільки пікселів треба провезти, перш ніж це вважатиметься тягненням.
     * Без порога кожен клік по бару починав би перетягування, і клік зникав би.
     */
    threshold?: number;
}

interface Dragged<R, I> {
    placed: PlacedItem<I>;
    from: Resource<R>;
    /** За скільки днів від початку бара його схопили. */
    grabOffset: number;
    origin: { x: number; y: number };
    active: boolean;
    /** Остання ціль, яку показав привид; вона ж поїде в onMove. */
    target: { slotIndex: number; resourceIndex: number } | null;
}

export function drag<R = unknown, I = unknown>(options: DragOptions<R, I> = {}): Plugin<R, I> {
    const threshold = options.threshold ?? 4;

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

            let dragged: Dragged<R, I> | null = null;
            let ghost: HTMLElement | null = null;

            function findBar(id: string): { placed: PlacedItem<I>; row: Row<R, I> } | undefined {
                for (const row of ctx.getLayout().rows) {
                    const placed = row.bars.find((candidate) => candidate.item.id === id);
                    if (placed !== undefined) return { placed, row };
                }
                return undefined;
            }

            function showGhost(slotIndex: number, resourceIndex: number) {
                if (dragged === null) return;

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

                const top = rowOffsets[resourceIndex];
                ghost.style.left = `${slotIndex * slotWidth}px`;
                ghost.style.width = `${dragged.placed.slotSpan * slotWidth}px`;
                ghost.style.top = `${top}px`;
                ghost.style.height = `${rowOffsets[resourceIndex + 1] - top}px`;
            }

            function stop() {
                ghost?.remove();
                ghost = null;
                dragged = null;
                root.style.userSelect = "";
            }

            function onPointerDown(event: PointerEvent) {
                if (event.button !== 0) return;

                const bar = (event.target as HTMLElement).closest<HTMLElement>(".rt__bar");
                const id = bar?.dataset.item;
                if (id === undefined) return;

                const found = findBar(id);
                const hit = ctx.hitTest({ x: event.clientX, y: event.clientY });
                if (found === undefined || hit === null) return;

                dragged = {
                    placed: found.placed,
                    from: found.row.resource,
                    grabOffset: hit.slot.index - found.placed.slotIndex,
                    origin: { x: event.clientX, y: event.clientY },
                    active: false,
                    target: null,
                };
            }

            function onPointerMove(event: PointerEvent) {
                if (dragged === null) return;

                if (!dragged.active) {
                    const moved =
                        Math.abs(event.clientX - dragged.origin.x) + Math.abs(event.clientY - dragged.origin.y);
                    if (moved < threshold) return;

                    dragged.active = true;
                    // Інакше тягнення виділяє підписи барів і рядків
                    root.style.userSelect = "none";
                }

                const hit = ctx.hitTest({ x: event.clientX, y: event.clientY });
                if (hit === null) return;

                const slots = ctx.getLayout().slots.length;
                const span = dragged.placed.slotSpan;
                // Ціль тримається в межах осі: бар, вивезений за край, не має
                // ставати коротшим — він просто впирається.
                const slotIndex = Math.min(Math.max(hit.slot.index - dragged.grabOffset, 0), slots - span);

                dragged.target = { slotIndex, resourceIndex: hit.resourceIndex };
                showGhost(slotIndex, hit.resourceIndex);
            }

            /** Що саме переїхало, або null, якщо нічого не змінилось. */
            function pendingMove(): DragMove<R, I> | null {
                if (dragged === null || dragged.target === null || options.onMove === undefined) return null;

                const layout = ctx.getLayout();
                const to = layout.rows[dragged.target.resourceIndex]?.resource;
                if (to === undefined) return null;

                const sameSlot = dragged.target.slotIndex === dragged.placed.slotIndex;
                if (sameSlot && to.id === dragged.from.id) return null;

                // Рахуємо зсув у днях, а не нові межі з осі: бар міг бути
                // обрізаний краєм діапазону, і тоді видимий початок — не
                // початок елемента. Зсув же однаковий для обох країв.
                const item = dragged.placed.item;
                const days = diffDays(
                    toEpoch(layout.slots[dragged.placed.slotIndex].start),
                    toEpoch(layout.slots[dragged.target.slotIndex].start),
                );

                return {
                    item,
                    from: dragged.from,
                    to,
                    start: toIso(addDays(toEpoch(item.start), days)),
                    end: toIso(addDays(toEpoch(item.end), days)),
                    days,
                };
            }

            function onPointerUp() {
                const move = pendingMove();
                stop();
                if (move !== null) options.onMove?.(move);
            }

            root.addEventListener("pointerdown", onPointerDown);
            window.addEventListener("pointermove", onPointerMove);
            window.addEventListener("pointerup", onPointerUp);
            window.addEventListener("pointercancel", onPointerUp);

            return () => {
                root.removeEventListener("pointerdown", onPointerDown);
                window.removeEventListener("pointermove", onPointerMove);
                window.removeEventListener("pointerup", onPointerUp);
                window.removeEventListener("pointercancel", onPointerUp);
                stop();
            };
        },
    };
}
