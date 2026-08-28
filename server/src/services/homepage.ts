import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppContext } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { userLinks } from "../db/schema";

export function HomepageService(): Hono {
    const app = new Hono();

    // GET /homepage — list all public links
    app.get('/', async (c: AppContext) => {
        const admin = c.get('admin');
        const db = c.get('db');

        const links = await profileAsync(c, 'homepage_list_db', () =>
            db.query.userLinks.findMany({
                with: {
                    user: {
                        columns: {
                            username: true,
                            avatar: true,
                        },
                    },
                },
                orderBy: (userLinks, { asc, desc }) => [
                    desc(userLinks.sort_order),
                    asc(userLinks.createdAt),
                ],
            })
        );

        return c.json(links.map(link => ({
            id: link.id,
            title: link.title,
            url: link.url,
            description: link.description,
            sort_order: link.sort_order,
            userId: link.uid,
            username: link.user?.username,
            avatar: link.user?.avatar,
            createdAt: link.createdAt,
            updatedAt: link.updatedAt,
        })));
    });

    // GET /homepage/mine — get current user's links
    app.get('/mine', async (c: AppContext) => {
        const uid = c.get('uid');
        const db = c.get('db');

        if (!uid) {
            return c.json([]);
        }

        const links = await profileAsync(c, 'homepage_mine_db', () =>
            db.query.userLinks.findMany({
                where: eq(userLinks.uid, uid),
                orderBy: (userLinks, { asc, desc }) => [
                    desc(userLinks.sort_order),
                    asc(userLinks.createdAt),
                ],
            })
        );

        return c.json(links.map(link => ({
            id: link.id,
            title: link.title,
            url: link.url,
            description: link.description,
            sort_order: link.sort_order,
            userId: link.uid,
            createdAt: link.createdAt,
            updatedAt: link.updatedAt,
        })));
    });

    // POST /homepage — create a new link
    app.post('/', async (c: AppContext) => {
        const uid = c.get('uid');
        const db = c.get('db');

        if (!uid) {
            return c.text('Unauthorized', 401);
        }

        const body = await profileAsync(c, 'homepage_create_parse', () => c.req.json());
        const { title, url, description, sort_order } = body as {
            title: string;
            url: string;
            description?: string;
            sort_order?: number;
        };

        if (!title || !url) {
            return c.text('Title and URL are required', 400);
        }

        if (title.length > 100 || url.length > 500) {
            return c.text('Invalid input', 400);
        }

        const result = await profileAsync(c, 'homepage_create_insert', () =>
            db.insert(userLinks).values({
                title,
                url,
                description: description || '',
                sort_order: sort_order || 0,
                uid,
            }).returning({ insertedId: userLinks.id })
        );

        if (!result || result.length === 0) {
            return c.text('Failed to create link', 500);
        }

        return c.json({ success: true, id: result[0].insertedId });
    });

    // PUT /homepage/:id — update a link
    app.put('/:id', async (c: AppContext) => {
        const admin = c.get('admin');
        const uid = c.get('uid');
        const db = c.get('db');
        const id = parseInt(c.req.param('id'));

        if (!uid) {
            return c.text('Unauthorized', 401);
        }

        const existing = await profileAsync(c, 'homepage_update_lookup', () =>
            db.query.userLinks.findFirst({ where: eq(userLinks.id, id) })
        );

        if (!existing) {
            return c.text('Not found', 404);
        }

        if (!admin && existing.uid !== uid) {
            return c.text('Permission denied', 403);
        }

        const body = await profileAsync(c, 'homepage_update_parse', () => c.req.json());
        const { title, url, description, sort_order } = body as {
            title?: string;
            url?: string;
            description?: string;
            sort_order?: number;
        };

        const updateData: Record<string, unknown> = {};
        if (title !== undefined) updateData.title = title;
        if (url !== undefined) updateData.url = url;
        if (description !== undefined) updateData.description = description;
        if (sort_order !== undefined) updateData.sort_order = sort_order;

        if (Object.keys(updateData).length === 0) {
            return c.text('No fields to update', 400);
        }

        await profileAsync(c, 'homepage_update_db', () =>
            db.update(userLinks).set(updateData).where(eq(userLinks.id, id))
        );

        return c.json({ success: true });
    });

    // DELETE /homepage/:id — delete a link
    app.delete('/:id', async (c: AppContext) => {
        const admin = c.get('admin');
        const uid = c.get('uid');
        const db = c.get('db');
        const id = parseInt(c.req.param('id'));

        if (!uid) {
            return c.text('Unauthorized', 401);
        }

        const existing = await profileAsync(c, 'homepage_delete_lookup', () =>
            db.query.userLinks.findFirst({ where: eq(userLinks.id, id) })
        );

        if (!existing) {
            return c.text('Not found', 404);
        }

        if (!admin && existing.uid !== uid) {
            return c.text('Permission denied', 403);
        }

        await profileAsync(c, 'homepage_delete_db', () =>
            db.delete(userLinks).where(eq(userLinks.id, id))
        );

        return c.json({ success: true });
    });

    return app;
}
