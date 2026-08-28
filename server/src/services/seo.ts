import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppContext, DB } from "../core/hono-types";
import { feeds } from "../db/schema";

function robotsTxt(origin: string) {
  return `User-agent: *\nAllow: /\n\nDisallow: /admin/\nDisallow: /login\nDisallow: /profile\nDisallow: /search/\nDisallow: /writing/\nDisallow: /callback\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}

async function renderArticle(markdown: string) {
  const [{ unified }, remarkParse, remarkGfm, remarkRehype, rehypeStringify] = await Promise.all([
    import("unified"), import("remark-parse"), import("remark-gfm"), import("remark-rehype"), import("rehype-stringify"),
  ]);
  const file = await unified().use(remarkParse.default).use(remarkGfm.default).use(remarkRehype.default).use(rehypeStringify.default).process(markdown);
  return String(file);
}

function jsonLd(value: Record<string, unknown>) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function SEOService(): Hono {
  const app = new Hono();
  app.get("/robots.txt", (c: AppContext) =>
    c.text(robotsTxt(new URL(c.req.url).origin), 200, { "Content-Type": "text/plain; charset=UTF-8", "Cache-Control": "public, max-age=3600" }),
  );
  app.get("/sitemap.xml", async (c: AppContext) => {
    const db = c.get("db") as DB;
    const origin = new URL(c.req.url).origin;
    const entries = await db.query.feeds.findMany({
      where: and(eq(feeds.draft, 0), eq(feeds.listed, 1)),
      columns: { id: true, updatedAt: true, createdAt: true },
      orderBy: [desc(feeds.updatedAt), desc(feeds.createdAt)],
    });
    const urls = entries.map((feed) => {
      const lastmod = feed.updatedAt || feed.createdAt;
      return `<url><loc>${origin}/feed/${feed.id}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>` : ""}</url>`;
    }).join("");
    const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url>${urls}</urlset>`;
    return c.body(body, 200, { "Content-Type": "application/xml; charset=UTF-8", "Cache-Control": "public, max-age=3600" });
  });
  app.get("/seo/article/:id", async (c: AppContext) => {
    const db = c.get("db") as DB;
    const id = c.req.param("id") || "";
    const numericId = Number.parseInt(id, 10);
    const where = Number.isNaN(numericId) ? eq(feeds.alias, id) : eq(feeds.id, numericId);
    const feed = await db.query.feeds.findFirst({
      where: and(where, and(eq(feeds.draft, 0), eq(feeds.listed, 1))),
      with: { user: { columns: { username: true } } },
    });
    if (!feed) return c.text("Not found", 404);
    const origin = new URL(c.req.url).origin;
    const canonical = `${origin}/feed/${feed.id}`;
    const title = feed.title || "Untitled article";
    const trimmedSummary = (feed.summary || "").trim();
    const trimmedAiSummary = (feed.ai_summary || "").trim();
    const fallback = (feed.content || "").replace(/[#*_`>\[\]!]/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/!\[\]/g, "").replace(/\s+/g, " ").trim();
    const description = (trimmedSummary || trimmedAiSummary || fallback).slice(0, 160);
    const modified = feed.updatedAt || feed.createdAt;
    const content = await renderArticle(feed.content || "");
    const body = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="index,follow"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><script type="application/ld+json">${jsonLd({ "@context": "https://schema.org", "@type": "Article", headline: title, description, author: { "@type": "Person", name: feed.user?.username || "" }, dateModified: modified ? new Date(modified).toISOString() : undefined, mainEntityOfPage: canonical })}</script></head><body><main><article><h1>${escapeHtml(title)}</h1>${modified ? `<time datetime="${new Date(modified).toISOString()}">${new Date(modified).toLocaleDateString("zh-CN")}</time>` : ""}<div>${content}</div></article></main></body></html>`;
    return c.body(body, 200, { "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "public, max-age=300, s-maxage=3600" });
  });
  return app;
}
