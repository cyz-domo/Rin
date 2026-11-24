import type { AppContext } from "../core/hono-types";

// Public by design: search engines must be able to fetch this key file.
const INDEXNOW_KEY = "3406bbe9c3eb02d3b72e75e6fdaaeae8";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

function resolveOrigin(c: AppContext) {
    const configured = c.env.FRONTEND_URL?.trim().replace(/\/+$/, "");
    return configured || new URL(c.req.url).origin;
}

async function submit(origin: string, paths: string[]) {
    const url = new URL(origin);
    // Local dev and tests serve plain http; never ping IndexNow from them.
    if (url.protocol !== "https:" || paths.length === 0) {
        return;
    }
    const payload = {
        host: url.host,
        key: INDEXNOW_KEY,
        keyLocation: `${url.origin}/${INDEXNOW_KEY}.txt`,
        urlList: paths.map((path) => `${url.origin}${path}`),
    };
    await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
    });
}

export function notifyIndexNow(c: AppContext, paths: string[]) {
    const task = submit(resolveOrigin(c), paths).catch((error) => {
        console.warn("[IndexNow] submit failed:", error);
    });
    let executionCtx: { waitUntil(promise: Promise<unknown>): void } | undefined;
    try {
        // Hono throws when the runtime never provided an ExecutionContext.
        executionCtx = c.executionCtx;
    } catch {
        executionCtx = undefined;
    }
    if (executionCtx?.waitUntil) {
        executionCtx.waitUntil(task);
    }
}
