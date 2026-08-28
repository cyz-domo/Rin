import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppContext, DB } from "../core/hono-types";
import { feeds } from "../db/schema";

const ROBOTS = `User-agent: *\nAllow: /\n\nDisallow: /admin/\nDisallow: /login\nDisallow: /profile\nDisallow: /search/\nDisallow: /writing/\nDisallow: /callback\nDisallow: /api/\n\nSitemap: /sitemap.xml\n`;

export function SEOService(): Hono {
  const app = new Hono();
  app.get("/robots.txt", (c: AppContext) =>
    c.text(ROBOTS, 200, { "Content-Type": "text/plain; charset=UTF-8", "Cache-Control": "public, max-age=3600" }),
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
  return app;
}
