/**
 * Привид перетягування — найдешевша перевірка того, чи витримує плагінний API
 * редагування. Він нічого не змінює: ловить вказівник, рахує ціль і малює
 * прямокутник у шарі накладок. Якщо цього досить без жодної правки ядра —
 * значить, на цих гачках можна повісити й справжнє перетягування.
 *
 * Тека `pro/` імпортує з `core/` і `vue/`; назад — ніколи. Перевірка та сама,
 * що й для доменних слів: грепом на кожному коміті (див. README).
 */
import type { PlacedItem, Plugin, PluginContext } from "../core/types";

export interface DragPreviewOptions {
    /** Клас на привида — щоб застосунок оформив його по-своєму. */
    className?: string;
    /**
     * Скільки пікселів треба провезти, перш ніж це вважатиметься тягненням.
     * Без порога кожен клік по бару починав би перетягування, і клік зникав би.
     */
    threshold?: number;
}

interface Dragged<I> {
    placed: PlacedItem<I>;
    /** За скільки днів від початку бара його схопили. */
    grabOffset: number;
    origin: { x: number; y: number };
    active: boolean;
}

export function dragPreview<R = unknown, I = unknown>(options: DragPreviewOptions = {}): Plugin<R, I> {
    const threshold = options.threshold ?? 4;

    return {
        name: "drag-preview",
        setup(ctx: PluginContext<R, I>) {
            const rootEl = ctx.getRoot();
            const overlayEl = ctx.getOverlay();
            if (rootEl === null || overlayEl === null) return;

            // Окремі імена після перевірки: звуження типу не переживає
            // оголошення функцій — вони підняті, тож із погляду компілятора
            // можуть виконатись і до неї.
            const root: HTMLElement = rootEl;
            const overlay: HTMLElement = overlayEl;

            let dragged: Dragged<I> | null = null;
            let ghost: HTMLElement | null = null;

            function findPlaced(id: string): PlacedItem<I> | undefined {
                for (const row of ctx.getLayout().rows) {
                    const placed = row.bars.find((candidate) => candidate.item.id === id);
                    if (placed !== undefined) return placed;
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
                const height = rowOffsets[resourceIndex + 1] - top;
                ghost.style.left = `${slotIndex * slotWidth}px`;
                ghost.style.width = `${dragged.placed.slotSpan * slotWidth}px`;
                ghost.style.top = `${top}px`;
                ghost.style.height = `${height}px`;
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

                const placed = findPlaced(id);
                const hit = ctx.hitTest({ x: event.clientX, y: event.clientY });
                if (placed === undefined || hit === null) return;

                dragged = {
                    placed,
                    grabOffset: hit.slot.index - placed.slotIndex,
                    origin: { x: event.clientX, y: event.clientY },
                    active: false,
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
                const target = Math.min(Math.max(hit.slot.index - dragged.grabOffset, 0), slots - span);

                showGhost(target, hit.resourceIndex);
            }

            function onPointerUp() {
                stop();
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
