import { afterEach, describe, expect, it } from "bun:test";
import { notifyIndexNow } from "../indexnow";

const INDEXNOW_KEY = "3406bbe9c3eb02d3b72e75e6fdaaeae8";
const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

function createContext(url: string, env: Partial<Env> = {}) {
    const pending: Promise<unknown>[] = [];
    return {
        c: {
            env,
            req: { url },
            executionCtx: { waitUntil: (task: Promise<unknown>) => pending.push(task) },
        } as any,
        pending,
    };
}

describe("notifyIndexNow", () => {
    it("does not call IndexNow for plain http origins", async () => {
        let called = false;
        globalThis.fetch = (async () => {
            called = true;
            return new Response();
        }) as any;

        const { c, pending } = createContext("http://localhost:11498/feed");
        notifyIndexNow(c, ["/feed/1"]);
        await Promise.all(pending);

        expect(called).toBe(false);
    });

    it("submits canonical article urls with the hosted key file", async () => {
        let endpoint = "";
        let payload: any;
        globalThis.fetch = (async (input: any, init: any) => {
            endpoint = String(input);
            payload = JSON.parse(init.body);
            return new Response();
        }) as any;

        const { c, pending } = createContext("https://rin.example/feed", { FRONTEND_URL: "https://blog.example/" } as Env);
        notifyIndexNow(c, ["/feed/7"]);
        await Promise.all(pending);

        expect(endpoint).toBe("https://api.indexnow.org/indexnow");
        expect(payload).toEqual({
            host: "blog.example",
            key: INDEXNOW_KEY,
            keyLocation: `https://blog.example/${INDEXNOW_KEY}.txt`,
            urlList: ["https://blog.example/feed/7"],
        });
    });
});
