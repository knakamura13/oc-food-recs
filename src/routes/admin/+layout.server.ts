import { env } from "$env/dynamic/private";
import { error } from "@sveltejs/kit";
import { dev } from "$app/environment";
import type { LayoutServerLoad } from "./$types";

// /admin is dynamic — auth gate at request time. The root layout prerenders the
// public site (true only under SITES_BUILD); override it to false here so /admin
// is never statically built and always runs server-side.
export const prerender = false;
export const ssr = true;

export const load: LayoutServerLoad = async ({ request }) => {
  // Local dev: always open
  if (dev) return {};

  // Production: if no admin password configured, the admin section doesn't exist
  const adminPassword = env.ADMIN_PASSWORD;
  if (!adminPassword) error(404);

  // Production: simple Basic Auth check
  const auth = request.headers.get("authorization");
  if (auth !== `Basic ${btoa(`admin:${adminPassword}`)}`) {
    throw new Response("Authentication required", {
      status: 401,
      headers: { "www-authenticate": 'Basic realm="admin"' },
    });
  }
  return {};
};
