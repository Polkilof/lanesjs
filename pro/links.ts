/**
 * Зв'язки між барами: стрілка від кінця одного до початку іншого. Перший
 * плагін, який малює постійно, а не під час жесту, — і тому саме він
 * скористався подією `layout`, яка досі оголошувалась, але не надходила.
 *
 * Геометрію бере з контракту, а не з DOM: рядки віртуалізовані, тож бара, до
 * якого веде стрілка, у розмітці може й не бути. Порахувати його місце можна
 * завжди, а знайти — ні.
 *
 * Тека `pro/` імпортує з `core/` і `vue/`; назад — ніколи (див. README).
 */
import type { Geometry, Layout, Plugin, PluginContext } from "../core/types";

/** Пара ідентифікаторів подій; напрямок від `from` до `to`. */
export interface Link {
    from: string;
    to: string;
}

export interface LinksOptions {
    /** Читається на кожну перемальовку, тож список може змінюватись. */
    links: () => Link[];
    /** Колір лінії; за замовчуванням — колір тексту таблиці. */
    color?: string;
    className?: string;
}

/** Де закінчується й де починається бар — у пікселях тіла сітки. */
interface Anchor {
    left: number;
    right: number;
    middle: number;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function links<R = unknown, I = unknown>(options: LinksOptions): Plugin<R, I> {
    return {
        name: "links",
        setup(ctx: PluginContext<R, I>) {
            const overlay = ctx.getOverlay();
            if (overlay === null) return;

            const svg = document.createElementNS(SVG_NS, "svg");
            svg.setAttribute("class", ["rt__links", options.className].filter(Boolean).join(" "));
            svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;overflow:visible";
            overlay.appendChild(svg);

            function anchorOf(layout: Layout<R, I>, geometry: Geometry, id: string): Anchor | null {
                for (let row = 0; row < layout.rows.length; row++) {
                    const placed = layout.rows[row].bars.find((candidate) => candidate.item.id === id);
                    if (placed === undefined) continue;

                    const top = geometry.rowOffsets[row];
                    const lane = geometry.barGap + placed.lane * (geometry.barHeight + geometry.barGap);

                    return {
                        left: placed.slotIndex * geometry.slotWidth,
                        right: (placed.slotIndex + placed.slotSpan) * geometry.slotWidth,
                        middle: top + lane + geometry.barHeight / 2,
                    };
                }
                return null;
            }

            /**
             * Ортогональний з'єднувач: трохи вправо, потім по вертикалі, потім
             * до цілі. Пряма лінія перетинала б чужі бари під довільним кутом
             * і читалася б гірше, ніж кут.
             */
            function pathOf(from: Anchor, to: Anchor): string {
                const stub = 10;
                const x1 = from.right;
                const x2 = to.left;
                const turn = x2 - stub > x1 + stub ? x2 - stub : x1 + stub;

                return `M ${x1} ${from.middle} H ${turn} V ${to.middle} H ${x2}`;
            }

            function draw() {
                const layout = ctx.getLayout();
                const geometry = ctx.getGeometry();

                svg.replaceChildren();

                for (const link of options.links()) {
                    const from = anchorOf(layout, geometry, link.from);
                    const to = anchorOf(layout, geometry, link.to);
                    if (from === null || to === null) continue;

                    const path = document.createElementNS(SVG_NS, "path");
                    path.setAttribute("d", pathOf(from, to));
                    path.setAttribute("fill", "none");
                    path.setAttribute("stroke", options.color ?? "currentColor");
                    path.setAttribute("stroke-width", "1.5");
                    svg.appendChild(path);

                    // Вістря малюємо самі, а не маркером: маркер вимагає
                    // унікального id у defs, а таблиць на сторінці може бути
                    // кілька, і ці id зіткнулись би.
                    const head = document.createElementNS(SVG_NS, "path");
                    head.setAttribute("d", `M ${to.left} ${to.middle} l -5 -3.5 v 7 z`);
                    head.setAttribute("fill", options.color ?? "currentColor");
                    svg.appendChild(head);
                }
            }

            const unsubscribe = ctx.on("layout", draw);
            draw();

            return () => {
                unsubscribe();
                svg.remove();
            };
        },
    };
}
