import { env } from "$env/dynamic/private";
import { dev } from "$app/environment";
import type { Handle } from "@sveltejs/kit";
import { timingSafeEqual } from "node:crypto";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export const handle: Handle = async ({ event, resolve }) => {
  const pathname = event.url.pathname;
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAdminRoute && !dev) {
    const adminPassword = env.ADMIN_PASSWORD;
    if (!adminPassword) {
      return new Response("Not Found", { status: 404 });
    }

    const authHeader = event.request.headers.get("authorization") ?? "";
    const expectedAuth = `Basic ${Buffer.from(`admin:${adminPassword}`).toString("base64")}`;

    if (!safeCompare(authHeader, expectedAuth)) {
      return new Response("Authentication required", {
        status: 401,
        headers: {
          "www-authenticate": 'Basic realm="admin", charset="UTF-8"',
        },
      });
    }
  }

  return resolve(event);
};
