import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dev: false,
  adminPassword: undefined as string | undefined,
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

describe("admin layout auth gate", () => {
  beforeEach(() => {
    mocks.dev = false;
    mocks.adminPassword = undefined;
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
