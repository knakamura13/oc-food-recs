import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dev: false,
  adminPassword: undefined as string | undefined,
  adminMutationCalled: false,
}));

vi.mock("$app/environment", () => ({
  get dev() {
    return mocks.dev;
  },
}));

vi.mock("$env/dynamic/private", () => ({
  env: new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "ADMIN_PASSWORD") return mocks.adminPassword;
        return undefined;
      },
    },
  ),
}));

vi.mock("$lib/server/restaurants/admin", () => ({
  excludeRestaurant: () => {
    mocks.adminMutationCalled = true;
  },
}));

describe("admin layout auth gate", () => {
  beforeEach(() => {
    mocks.dev = false;
    mocks.adminPassword = undefined;
    mocks.adminMutationCalled = false;
    vi.resetModules();
  });

  it("allows access in dev without credentials", async () => {
    mocks.dev = true;
    const { load } = await import("../../../routes/admin/+layout.server");
    await expect(
      load({ request: new Request("http://localhost/admin") } as never),
    ).resolves.toEqual({});
  });

  it("returns 404 when ADMIN_PASSWORD is unset in production", async () => {
    const { load } = await import("../../../routes/admin/+layout.server");
    await expect(
      load({ request: new Request("http://localhost/admin") } as never),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("returns 401 when credentials are missing in production", async () => {
    mocks.adminPassword = "secret";
    const { load } = await import("../../../routes/admin/+layout.server");
    await expect(
      load({ request: new Request("http://localhost/admin") } as never),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("allows access with valid Basic Auth in production", async () => {
    mocks.adminPassword = "secret";
    const { load } = await import("../../../routes/admin/+layout.server");
    const auth = `Basic ${btoa("admin:secret")}`;
    await expect(
      load({
        request: new Request("http://localhost/admin", {
          headers: { authorization: auth },
        }),
      } as never),
    ).resolves.toEqual({});
  });
});

describe("admin handle hook auth gate", () => {
  beforeEach(() => {
    mocks.dev = false;
    mocks.adminPassword = undefined;
    mocks.adminMutationCalled = false;
    vi.resetModules();
  });

  it("allows non-admin routes through without auth check", async () => {
    const { handle } = await import("../../../hooks.server");
    const resolve = vi.fn().mockResolvedValue(new Response("OK"));
    const event = {
      url: new URL("http://localhost/"),
      request: new Request("http://localhost/"),
    };

    const res = await handle({ event, resolve } as never);
    expect(res.status).toBe(200);
    expect(resolve).toHaveBeenCalled();
  });

  it("allows admin routes in dev mode", async () => {
    mocks.dev = true;
    const { handle } = await import("../../../hooks.server");
    const resolve = vi.fn().mockResolvedValue(new Response("OK"));
    const event = {
      url: new URL("http://localhost/admin"),
      request: new Request("http://localhost/admin"),
    };

    const res = await handle({ event, resolve } as never);
    expect(res.status).toBe(200);
    expect(resolve).toHaveBeenCalled();
  });

  it("rejects POST to /admin with 404 when ADMIN_PASSWORD is unset", async () => {
    const { handle } = await import("../../../hooks.server");
    const resolve = vi.fn();
    const event = {
      url: new URL("http://localhost/admin/exclusions"),
      request: new Request("http://localhost/admin/exclusions", {
        method: "POST",
        headers: { Accept: "application/json" },
      }),
    };

    const res = await handle({ event, resolve } as never);
    expect(res.status).toBe(404);
    expect(resolve).not.toHaveBeenCalled();
    expect(mocks.adminMutationCalled).toBe(false);
  });

  it("rejects unauthenticated POST to /admin with 401 when ADMIN_PASSWORD is set", async () => {
    mocks.adminPassword = "secret";
    const { handle } = await import("../../../hooks.server");
    const resolve = vi.fn();
    const event = {
      url: new URL("http://localhost/admin/exclusions"),
      request: new Request("http://localhost/admin/exclusions", {
        method: "POST",
        headers: { Accept: "application/json" },
      }),
    };

    const res = await handle({ event, resolve } as never);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain('Basic realm="admin"');
    expect(resolve).not.toHaveBeenCalled();
    expect(mocks.adminMutationCalled).toBe(false);
  });

  it("allows POST to /admin with valid Basic Auth when ADMIN_PASSWORD is set", async () => {
    mocks.adminPassword = "secret";
    const { handle } = await import("../../../hooks.server");
    const resolve = vi.fn().mockResolvedValue(new Response("Action Response"));
    const auth = `Basic ${Buffer.from("admin:secret").toString("base64")}`;
    const event = {
      url: new URL("http://localhost/admin/exclusions"),
      request: new Request("http://localhost/admin/exclusions", {
        method: "POST",
        headers: {
          Accept: "application/json",
          authorization: auth,
        },
      }),
    };

    const res = await handle({ event, resolve } as never);
    expect(res.status).toBe(200);
    expect(resolve).toHaveBeenCalled();
  });
});
