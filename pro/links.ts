/**
 * Links between bars: an arrow from the end of one to the start of another. The
 * first plugin that draws all the time rather than during a gesture - which is
 * why it was the one to make use of the `layout` event, declared until then but
 * never actually delivered.
 *
 * It takes geometry from the contract, not from the DOM: rows are virtualized,
 * so the bar an arrow leads to may not be in the markup at all. Its place can
 * always be computed; it cannot always be found.
 *
 * The `pro/` folder imports from `core/` and `vue/`; never the other way round.
 */
import { guard } from "./license";
import type { Geometry, Layout, Plugin, PluginContext } from "../core/types";

/** A pair of event ids; the direction runs from `from` to `to`. */
export interface Link {
    from: string;
    to: string;
}

export interface LinksOptions {
    /** Read on every repaint, so the list is free to change. */
    links: () => Link[];
    /** The colour of the line; defaults to the table's text colour. */
    color?: string;
    className?: string;
}

/** Where a bar ends and where it begins - in pixels of the grid body. */
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

            /**
             * Every bar's anchor, by event id, built once per repaint.
             *
             * Looking each one up by scanning the rows is the obvious way to
             * write this and the wrong one: a link needs two anchors, so the
             * drawing costs links times rows. At two thousand rows that was a
             * second of scanning for twenty-nine milliseconds of drawing.
             *
             * The first bar carrying an id wins, as the scan gave the first row
             * that held it. Ids are unique, so this only decides a case that is
             * already broken.
             */
            function anchorsOf(layout: Layout<R, I>, geometry: Geometry): Map<string, Anchor> {
                const anchors = new Map<string, Anchor>();

                for (let row = 0; row < layout.rows.length; row++) {
                    const top = geometry.rowOffsets[row];

                    for (const placed of layout.rows[row].bars) {
                        if (anchors.has(placed.item.id)) continue;

                        const lane = geometry.barGap + placed.lane * (geometry.barHeight + geometry.barGap);

                        anchors.set(placed.item.id, {
                            left: placed.slotIndex * geometry.slotWidth,
                            right: (placed.slotIndex + placed.slotSpan) * geometry.slotWidth,
                            middle: top + lane + geometry.barHeight / 2,
                        });
                    }
                }

                return anchors;
            }

            /**
             * An orthogonal connector: a little to the right, then vertically,
             * then to the target. A straight line would cross other people's
             * bars at an arbitrary angle and read worse than a corner does.
             */
            function pathOf(from: Anchor, to: Anchor): string {
                const stub = 10;
                const x1 = from.right;
                const x2 = to.left;
                const turn = x2 - stub > x1 + stub ? x2 - stub : x1 + stub;

                return `M ${x1} ${from.middle} H ${turn} V ${to.middle} H ${x2}`;
            }

            function draw() {
                const links = options.links();
                if (links.length === 0) {
                    svg.replaceChildren();
                    return;
                }

                const anchors = anchorsOf(ctx.getLayout(), ctx.getGeometry());

                svg.replaceChildren();

                for (const link of links) {
                    const from = anchors.get(link.from);
                    const to = anchors.get(link.to);
                    if (from === undefined || to === undefined) continue;

                    const path = document.createElementNS(SVG_NS, "path");
                    path.setAttribute("d", pathOf(from, to));
                    path.setAttribute("fill", "none");
                    path.setAttribute("stroke", options.color ?? "currentColor");
                    path.setAttribute("stroke-width", "1.5");
                    svg.appendChild(path);

                    // The arrowhead is drawn by hand rather than with a marker:
                    // a marker needs a unique id in defs, and a page may hold
                    // several tables, whose ids would then collide.
                    const head = document.createElementNS(SVG_NS, "path");
                    head.setAttribute("d", `M ${to.left} ${to.middle} l -5 -3.5 v 7 z`);
                    head.setAttribute("fill", options.color ?? "currentColor");
                    svg.appendChild(head);
                }
            }

            const unsubscribe = ctx.on("layout", draw);
            const unguard = guard(ctx.getRoot());
            draw();

            return () => {
                unsubscribe();
                unguard();
                svg.remove();
            };
        },
    };
}
