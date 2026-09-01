/**
 * The licence key. Decision 08: the code ships together, works without a key,
 * and is bought out of conviction - so the check here disables nothing and
 * breaks nothing. It only says out loud what is being used: once in the console
 * and with a small badge in the corner.
 *
 * The key is signed rather than checked against a table: only the public key
 * ships in the package, so no keygen exists even for someone holding all our
 * code. The check is offline - nothing is sent to us; whoever bought the
 * component did not buy surveillance.
 *
 * What the key limits is the update window, not the work. The end date is
 * compared against the build date of the package rather than against a clock:
 * the version you bought works forever, while one released after the window
 * closed asks you to renew. The client's clock is no judge here - clocks get
 * changed, in both directions.
 */

/**
 * The package's public key (SPKI, base64url). The private one lives outside the
 * repository; keys are issued by scripts/lanes-license.mjs.
 */
const PUBLIC_KEY =
    "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEsoP0L5MEn0YDDwX6QCaqRiPdgqftDdW-HlbbwlRoFSaaKtJu1832nmd5J-DwTuMECjuBeQ8cs1x-LC7BOMUcOw";

// Substituted by the library build. When Lanes is fed from sources - which is
// how we live ourselves - they are absent, and the update window is not checked:
// your own build is not licensed.
declare const __LANES_VERSION__: string;
declare const __LANES_BUILT__: string;

const VERSION = typeof __LANES_VERSION__ === "string" ? __LANES_VERSION__ : "";
const BUILT = typeof __LANES_BUILT__ === "string" ? __LANES_BUILT__ : "";

export type LicenseStatus =
    /** No key was given. */
    | "unlicensed"
    /** The key is ours and covers this build. */
    | "licensed"
    /** The key is ours, but its update window ended before this build. */
    | "outdated"
    /** The key is not ours, or is corrupted. */
    | "invalid"
    /** Nothing to verify with (an insecure context) - and we keep quiet. */
    | "unverifiable";

export interface License {
    id: string;
    licensee: string;
    edition: string;
    /** How long updates are covered for, YYYY-MM-DD. */
    updatesUntil: string;
}

export interface LicenseCheck {
    status: LicenseStatus;
    license: License | null;
}

function fromBase64Url(value: string): Uint8Array {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

function looksLikeLicense(value: unknown): value is License {
    const license = value as License;
    return (
        typeof license?.id === "string" &&
        typeof license.licensee === "string" &&
        typeof license.edition === "string" &&
        typeof license.updatesUntil === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(license.updatesUntil)
    );
}

/**
 * Verifying a key. Pulled out and parameterized deliberately: otherwise the
 * only way to test it would be with a real key, and a real key in the tests
 * would mean a real private key in the repository.
 */
export async function verifyLicense(
    key: string,
    options: { publicKey?: string; builtAt?: string } = {},
): Promise<LicenseCheck> {
    const publicKey = options.publicKey ?? PUBLIC_KEY;
    const builtAt = options.builtAt ?? BUILT;

    const parts = key.trim().split(".");
    if (parts.length !== 3 || parts[0] !== "LANES") return { status: "invalid", license: null };

    // An insecure context (plain http) does not give crypto.subtle. That is no
    // reason to accuse someone who paid: with no check, we simply keep quiet.
    const subtle = globalThis.crypto?.subtle;
    if (subtle === undefined) return { status: "unverifiable", license: null };

    let license: unknown;
    try {
        license = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1])));
    } catch {
        return { status: "invalid", license: null };
    }
    if (!looksLikeLicense(license)) return { status: "invalid", license: null };

    let signed = false;
    try {
        const imported = await subtle.importKey(
            "spki",
            fromBase64Url(publicKey),
            { name: "ECDSA", namedCurve: "P-256" },
            false,
            ["verify"],
        );
        signed = await subtle.verify(
            { name: "ECDSA", hash: "SHA-256" },
            imported,
            fromBase64Url(parts[2]),
            new TextEncoder().encode(parts[1]),
        );
    } catch {
        signed = false;
    }

    if (!signed) return { status: "invalid", license: null };

    // ISO dates compare as strings - that is what the format is for.
    if (builtAt !== "" && license.updatesUntil < builtAt) return { status: "outdated", license };

    return { status: "licensed", license };
}

let checking: Promise<LicenseCheck> = Promise.resolve({ status: "unlicensed", license: null });

/**
 * Hand the key to the library. Call it before the first timeline with paid
 * plugins appears; being a second late is harmless - a second is exactly what
 * it is given.
 */
export function setLicense(key: string): void {
    checking = verifyLicense(key);
}

/** How it turned out. Needed by us and by the tests, hardly by anyone else. */
export function licenseStatus(): Promise<LicenseCheck> {
    return checking;
}

/** How long to wait for a key before deciding there will not be one. */
const GRACE = 1000;

/**
 * Where to go for a key. The only address in the library - and even that one
 * lives in text alone.
 *
 * The project page rather than the repository: the page is what sells. It can
 * be replaced with a domain of our own later without breaking already published
 * versions - GitHub Pages redirects the old address to the new domain itself.
 */
const HOME = "https://polkilof.github.io/lanesjs/";

const NOTICE: Record<string, string> = {
    unlicensed:
        "Lanes Pro is running without a licence key. Nothing is disabled — the paid plugins work either way. " +
        `If this is a commercial project, please buy a licence at ${HOME} and set it with setLicense(key).`,
    invalid:
        "Lanes Pro does not recognise this licence key. Nothing is disabled, but the key is either mistyped " +
        `or not ours. Keys are issued at ${HOME}`,
    outdated:
        "This Lanes Pro licence covers updates released earlier than this build. Nothing is disabled — " +
        `renew the licence at ${HOME} to keep the notice away.`,
};

const BADGE: Record<string, string> = {
    unlicensed: "Lanes Pro — unlicensed",
    invalid: "Lanes Pro — licence not recognised",
    outdated: "Lanes Pro — updates expired",
};

let announced = false;

interface Watch {
    /** How many paid plugins are installed on this timeline. */
    count: number;
    timer: ReturnType<typeof setTimeout> | null;
    badge: HTMLElement | null;
}

const watched = new Map<HTMLElement, Watch>();

/**
 * The badge is drawn by the paid layer and only by it: the free half knows
 * nothing about the licence - otherwise it could not be built separately.
 */
function mark(root: HTMLElement, status: LicenseStatus): HTMLElement {
    const badge = document.createElement("div");
    badge.className = "rt__license";
    badge.textContent = BADGE[status] ?? BADGE.unlicensed;
    badge.style.cssText = [
        "position:absolute",
        "right:4px",
        "bottom:4px",
        "z-index:5",
        "padding:2px 6px",
        "border-radius:4px",
        "font:11px/1.4 system-ui,sans-serif",
        "color:#fff",
        "background:rgba(0,0,0,.55)",
        "pointer-events:none",
        "user-select:none",
    ].join(";");

    root.appendChild(badge);
    return badge;
}

/**
 * Turn the check on for one timeline; returns the teardown. Every paid plugin
 * calls it, while the badge and the message are one per timeline: four plugins
 * on one screen are no reason to shout four times.
 */
export function guard(root: HTMLElement | null): () => void {
    if (root === null || typeof document === "undefined") return () => {};

    const watch: Watch = watched.get(root) ?? { count: 0, timer: null, badge: null };
    watch.count += 1;
    watched.set(root, watch);

    // The key often arrives after mounting - the application may have been
    // fetching it from config. A second of silence costs less than a false
    // accusation.
    if (watch.timer === null && watch.badge === null) {
        watch.timer = setTimeout(() => void settle(root), GRACE);
    }

    return () => {
        watch.count -= 1;
        if (watch.count > 0) return;

        if (watch.timer !== null) clearTimeout(watch.timer);
        watch.badge?.remove();
        watched.delete(root);
    };
}

async function settle(root: HTMLElement): Promise<void> {
    const { status, license } = await checking;

    const watch = watched.get(root);
    // The timeline may have been unmounted while we were checking.
    if (watch === undefined) return;
    watch.timer = null;

    if (status === "licensed" || status === "unverifiable") return;

    if (!announced) {
        announced = true;
        const build = VERSION === "" ? "" : ` (build ${VERSION}${BUILT === "" ? "" : `, ${BUILT}`})`;
        const covered = license === null ? "" : ` Licence ${license.id} covers updates until ${license.updatesUntil}.`;
        console.warn(`${NOTICE[status] ?? NOTICE.unlicensed}${covered}${build}`);
    }

    watch.badge = mark(root, status);
}
