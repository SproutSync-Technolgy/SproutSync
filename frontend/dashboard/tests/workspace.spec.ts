import { test, expect, type Page } from "@playwright/test";
import { loadEnv } from "vite";
const env = loadEnv("test", "../..", "VITE_");
const authHost = new URL(env.VITE_SUPABASE_URL).hostname;
const key = `sb-${authHost.split(".")[0]}-auth-token`;
const uid = "00000000-0000-4000-a000-000000000001";
const user = {
  id: uid,
  aud: "authenticated",
  role: "authenticated",
  email: "test@example.invalid",
  email_confirmed_at: "2026-10-26T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: "2026-10-26T00:00:00Z",
};
const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: uid, role: "authenticated", exp: 4102444800 })).toString("base64url")}.test`;
const session = {
  access_token: token,
  refresh_token: "test-refresh",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 4102444800,
  user,
};
async function mock(
  page: Page,
  role = "operator",
  signedIn = true,
  googleNew = false,
) {
  let profile = {
    id: 1,
    email: user.email,
    role,
    display_name: "Test Grower",
    first_name: "Test",
    last_name: "Grower",
    organization: "",
    phone: "",
    avatar_url: null,
    profile_complete: signedIn && !googleNew,
    registration_provider: googleNew ? "google" : "email",
    onboarding_email_verified_at: googleNew ? null : "2026-10-26T00:00:00Z",
  };
  const batches: Record<string, unknown>[] = [
    {
      id: 1,
      owner_id: 1,
      code: "MB-001",
      seed_type: "Mung beans",
      stage: "growing",
      status: "active",
      started_at: "2026-10-26T00:00:00Z",
      target_harvest_at: null,
      notes: "Verified record",
    },
  ];
  if (signedIn)
    await page.addInitScript(
      ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
      { key, session },
    );
  await page.route(`https://${authHost}/**`, async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const path = url.pathname;
    let body: unknown = [];
    if (path.endsWith("/signup"))
      body = { user: { ...user, identities: [{ id: uid }] }, session: null };
    else if (path.endsWith("/verify") || path.endsWith("/token")) {
      if (googleNew && request.postDataJSON()?.type === "email")
        profile.onboarding_email_verified_at = "2026-10-26T00:00:00Z";
      body = session;
    } else if (path.endsWith("/user")) body = user;
    else if (path.endsWith("/ensure_profile")) body = profile;
    else if (path.endsWith("/save_profile")) {
      const v = request.postDataJSON();
      profile = {
        ...profile,
        first_name: v.given_name,
        last_name: v.family_name,
        display_name: `${v.given_name} ${v.family_name}`,
        profile_complete: true,
      };
      body = profile;
    } else if (path.endsWith("/notification_preferences")) body = null;
    else if (path.endsWith("/batches")) {
      if (request.method() === "POST") {
        const next = {
          id: 2,
          ...request.postDataJSON(),
          stage: "soaking",
          status: "active",
        };
        batches.unshift(next);
        body = next;
      } else body = batches;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}
test("signup verifies a code, collects details and opens dashboard", async ({
  page,
}) => {
  await mock(page, "evaluator", false);
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("New accounts start")).toHaveCount(0);
  await dialog.getByLabel("Email address").fill(user.email);
  await dialog.getByLabel("Password", { exact: true }).fill("testing-password");
  await dialog.getByLabel("Confirm password").fill("testing-password");
  await dialog
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await dialog.getByLabel("Verification code").fill("123456");
  await dialog
    .getByRole("button", { name: "Verify email", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Let’s get to know you" }),
  ).toBeVisible();
  await page.getByLabel("First name").fill("Pat");
  await page.getByLabel("Last name").fill("Green");
  await page.getByRole("button", { name: "Open dashboard" }).click();
  await expect(page.getByText("Welcome back, Pat.")).toBeVisible();
  await expect(page).toHaveURL(/dashboard/);
});
test("evaluator cannot enter operator route or see operational controls", async ({
  page,
}) => {
  await mock(page, "evaluator");
  await page.goto("/operator");
  await expect(
    page.getByRole("heading", { name: "Operator access required" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open my dashboard" }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Batches", exact: true })
    .click();
  await expect(page.getByText("MB-001", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New batch", exact: true }),
  ).toHaveCount(0);
});
test("operator redirect, real batch form and minimal signout", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/admin");
  await expect(page).toHaveURL(/operator/);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Batches", exact: true })
    .click();
  await page.getByRole("button", { name: "New batch", exact: true }).click();
  await page.getByLabel("Batch code").fill("MB-002");
  await page.getByLabel("Start date").fill("2026-10-26T10:00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("MB-002", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Are you sure you want to sign out?" }),
  ).toBeVisible();
  await expect(dialog.getByText("You will return")).toHaveCount(0);
  await dialog.getByRole("button", { name: "No", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.screenshot({
    path: "test-results/operator-desktop.png",
    fullPage: true,
  });
});
test("mobile bottom navigation and records fit 390px without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, "evaluator");
  await page.goto("/mobile");
  const mobile = page.getByRole("navigation", { name: "Mobile navigation" });
  await mobile.getByRole("button", { name: "Batches", exact: true }).click();
  await expect(page.getByText("MB-001", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await mobile.getByRole("button", { name: "More", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.screenshot({
    path: "test-results/mobile-batches.png",
    fullPage: true,
  });
});

test("new Google account verifies inbox, reviews prefilled details and can correct them", async ({
  page,
}) => {
  await mock(page, "evaluator", true, true);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Verify your email", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Verification code").fill("123456");
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Is this information correct?" }),
  ).toBeVisible();
  await expect(page.getByText("Grower", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit information" }).click();
  await page.getByLabel("First name").fill("Pat");
  await page.getByRole("button", { name: "Confirm & continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Your account is ready" }),
  ).toBeVisible();
  await expect(page.getByText("Welcome back, Pat.")).toBeVisible();
});
test("avatar menu restores profile, settings and help outside the sidebar", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/operator");
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByText("Profile & settings"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  const menu = page.getByRole("menu");
  await expect(
    menu.getByRole("menuitem", { name: "Profile", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await menu.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Personal details", exact: true }),
  ).toBeVisible();
});
test("landing download opens an APK download instead of the mobile simulator", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, "evaluator", false);
  await page.route("**/downloads/mobile-release.json", (r) =>
    r.fulfill({
      json: {
        available: true,
        version: "0.1.0",
        url: "/downloads/sproutsync-preview.apk",
        size_bytes: 1024,
        sha256: "abc",
        channel: "Development preview",
      },
    }),
  );
  await page.route("**/downloads/sproutsync-preview.apk", (route) =>
    route.fulfill({
      contentType: "application/vnd.android.package-archive",
      body: Buffer.from("APK test fixture"),
    }),
  );
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByText("System ready", { exact: true })).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download mobile app", exact: true })
    .first()
    .click();
  expect((await download).suggestedFilename()).toBe("sproutsync-preview.apk");
  await expect(page).toHaveURL(/download/);
  await expect(
    page.getByRole("link", { name: "Download Android APK", exact: true }),
  ).toHaveAttribute("href", "/downloads/sproutsync-preview.apk");
});
