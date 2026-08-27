/**
 * Створення виділенням: провести по порожньому місцю рядка й дістати діапазон.
 * Окремий плагін від перетягування, бо починається з іншого — з порожнього
 * місця, а не з бара. Тож вони не б'ються за один захват, і застосунок може
 * дозволити створювати, не дозволяючи тягати.
 *
 * Плагін нічого не створює сам: він рахує діапазон і віддає його застосунку.
 * Той сам вирішує, чи відкривати форму, чи одразу писати в базу.
 *
 * Тека `pro/` імпортує з `core/` і `vue/`; назад — ніколи (див. README).
 */
import { makeGhost, trackPointer } from "./gesture";
import type { IsoDate, Plugin, PluginContext, Resource } from "../core/types";

export interface DragCreate<R = unknown> {
    resource: Resource<R>;
    /** Межі виділеного; `end` ексклюзивний, як і всюди в контракті. */
    start: IsoDate;
    end: IsoDate;
    /** Скільки днів укрито. */
    days: number;
}

export interface CreateOptions<R = unknown> {
    onCreate: (created: DragCreate<R>) => void;
    /** Клас на привида — щоб застосунок оформив його по-своєму. */
    className?: string;
    /** Скільки пікселів треба провезти, перш ніж це вважатиметься жестом. */
    threshold?: number;
}

/** Звідки почали тягнути. Рядок фіксується на старті й далі не змінюється. */
interface Anchor {
    slotIndex: number;
    resourceIndex: number;
}

export function create<R = unknown, I = unknown>(options: CreateOptions<R>): Plugin<R, I> {
    return {
        name: "create",
        setup(ctx: PluginContext<R, I>) {
            const rootEl = ctx.getRoot();
            const overlayEl = ctx.getOverlay();
            if (rootEl === null || overlayEl === null) return;

            const root: HTMLElement = rootEl;
            const overlay: HTMLElement = overlayEl;

            const ghost = makeGhost(overlay, options.className);

            return trackPointer<Anchor>(
                {
                    root,
                    threshold: options.threshold ?? 4,

                    press(event) {
                        // По бару створювати не можна: там уже щось лежить, і
                        // цей захват належить перетягуванню.
                        if ((event.target as HTMLElement).closest(".rt__bar") !== null) return null;

                        const hit = ctx.hitTest({ x: event.clientX, y: event.clientY });
                        if (hit === null) return null;

                        return { slotIndex: hit.slot.index, resourceIndex: hit.resourceIndex };
                    },

                    track(anchor, event) {
                        const hit = ctx.hitTest({ x: event.clientX, y: event.clientY });
                        if (hit === null) return null;

                        // Рядок беремо з початку жесту: подія належить одному
                        // ресурсу, і вести виділення по діагоналі — значить
                        // питати, що ж воно тоді покриває.
                        const from = Math.min(anchor.slotIndex, hit.slot.index);
                        const to = Math.max(anchor.slotIndex, hit.slot.index);

                        return { slotIndex: from, slotSpan: to - from + 1, resourceIndex: anchor.resourceIndex };
                    },

                    commit(anchor, target) {
                        const layout = ctx.getLayout();
                        const resource = layout.rows[anchor.resourceIndex]?.resource;
                        if (resource === undefined) return;

                        // Межі беруться прямо з осі, а не зсувом у днях:
                        // виділення й народилось із колонок, обрізати його
                        // краєм діапазону нема чому.
                        const first = layout.slots[target.slotIndex];
                        const last = layout.slots[target.slotIndex + target.slotSpan - 1];
                        if (first === undefined || last === undefined) return;

                        options.onCreate({
                            resource,
                            start: first.start,
                            end: last.end,
                            days: target.slotSpan,
                        });
                    },
                },
                ghost,
                () => ctx.getGeometry(),
            );
        },
    };
}
