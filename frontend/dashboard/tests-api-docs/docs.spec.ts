import {test,expect,type Page} from "@playwright/test";

let endpointCount:number, chamberCount:number;
test.beforeAll(async ({request}) => {
  const schema=await (await request.get("/openapi.json")).json();
  const operations=Object.values(schema.paths).flatMap(item => Object.entries(item as Record<string,{tags?:string[]}>).filter(([method]) => ["get","post","patch","delete","put"].includes(method)).map(([,op]) => op));
  endpointCount=operations.length;
  chamberCount=operations.filter(op => op.tags?.includes("devices")).length;
});

async function mockChecks(page:Page) {
  await page.route("**/api/v1/health",route => route.fulfill({json:{status:"ok",service:"sproutsync-api"}}));
  await page.route("**/api/v1/ready",route => route.fulfill({json:{status:"ready",checks:{database:{status:"ok"},schema:{status:"ok"}}}}));
}

test("API workspace searches endpoints by meaning and method, and keeps tag navigation functional",async ({page}) => {
  await mockChecks(page);
  const errors:string[]=[];
  page.on("pageerror",error => errors.push(error.message));
  await page.goto("/docs");
  await expect(page.getByRole("heading",{level:1})).toContainText("connected system");
  await expect(page.locator("#ready-state")).toHaveText("Ready");
  await expect(page.locator("#swagger-ui .opblock")).toHaveCount(endpointCount);
  await page.keyboard.press("Control+k");
  const search=page.getByRole("searchbox",{name:"Search endpoints"});
  await expect(search).toBeFocused();
  await search.fill("telemetry");
  await expect(page.locator("#swagger-ui .opblock:visible")).not.toHaveCount(endpointCount);
  await expect(page.locator("#swagger-ui .opblock:visible")).not.toHaveCount(0);
  await page.getByLabel("Filter by HTTP method").selectOption("get");
  for (const method of await page.locator("#swagger-ui .opblock:visible .opblock-summary-method").allTextContents()) expect(method).toBe("GET");
  await page.locator('#swagger-ui .opblock-tag[data-tag="devices"]').getByRole("button",{name:"Collapse operation",exact:true}).click();
  await search.fill("/devices/live");
  await expect(page.locator("#swagger-ui .opblock:visible")).toHaveCount(1);
  await search.fill("no-such-endpoint-xyz");
  await expect(page.getByRole("heading",{name:"No matching endpoints"})).toBeVisible();
  await page.getByRole("button",{name:"Show all endpoints"}).click();
  await expect(page.locator("#swagger-ui .opblock:visible")).toHaveCount(endpointCount);
  await page.getByRole("button",{name:/Chambers & telemetry/}).click();
  await expect(page.locator("#swagger-ui .opblock:visible")).toHaveCount(chamberCount);
  await expect(page.getByRole("button",{name:/Chambers & telemetry/})).toHaveAttribute("aria-pressed","true");
  expect(errors).toEqual([]);
  await page.screenshot({path:"../../.tools/docs-reference-desktop.png",fullPage:true});
});

test("guided links open real Swagger controls and execute only the chosen request",async ({page}) => {
  await mockChecks(page);
  await page.goto("/docs");
  await expect(page.locator("#swagger-ui .opblock")).toHaveCount(endpointCount);
  await page.getByRole("button",{name:"View health endpoint"}).click();
  const endpoint=page.locator("#swagger-ui .opblock.is-open");
  await expect(endpoint).toHaveCount(1);
  await expect(endpoint).toContainText("/api/v1/health");
  await endpoint.getByRole("button",{name:"Try it out",exact:true}).click();
  await endpoint.getByRole("button",{name:"Execute",exact:true}).click();
  await expect(endpoint.locator(".live-responses-table")).toContainText("200");
  await page.getByRole("tab",{name:"JavaScript",exact:true}).click();
  await expect(page.getByRole("tabpanel",{name:"JavaScript",exact:true})).toContainText("await fetch");
  await expect(page.getByRole("tabpanel",{name:"JavaScript",exact:true})).toContainText("YOUR_SESSION_TOKEN");
  await page.getByRole("tab",{name:"JavaScript",exact:true}).press("ArrowRight");
  await expect(page.getByRole("tab",{name:"Python",exact:true})).toBeFocused();
  await expect(page.getByRole("tabpanel",{name:"Python",exact:true})).toContainText("urllib.request");
});

test("mobile navigation, themes, disclosures and keyboard access fit a narrow screen",async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:"reduce",colorScheme:"light"});
  await mockChecks(page);
  await page.goto("/docs");
  await expect(page.locator("#swagger-ui .opblock")).toHaveCount(endpointCount);
  await page.getByRole("button",{name:"Switch to dark theme"}).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
  await page.getByRole("button",{name:"Open documentation navigation"}).click();
  await page.getByRole("button",{name:/Chambers & telemetry/}).click();
  await expect(page.getByRole("button",{name:"Open documentation navigation"})).toHaveAttribute("aria-expanded","false");
  await expect(page.locator("#swagger-ui .opblock:visible")).toHaveCount(chamberCount);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:"../../.tools/docs-reference-mobile-dark.png",fullPage:true});
  await page.getByRole("button",{name:"Switch to light theme"}).click();
  await page.locator(".reading-guide summary").click();
  await expect(page.getByText("Keep live values and history distinct",{exact:true})).toBeVisible();
});

test("schema and readiness failures have an honest retry path",async ({page}) => {
  const schema=await (await page.request.get("/openapi.json")).json();
  let fail=true;
  await page.route("**/openapi.json",route => fail ? route.fulfill({status:503,json:{detail:"Unavailable"}}) : route.fulfill({json:schema}));
  await page.route("**/api/v1/health",route => route.fulfill({json:{status:"ok",service:"sproutsync-api"}}));
  await page.route("**/api/v1/ready",route => fail ? route.fulfill({status:503,json:{status:"not_ready"}}) : route.fulfill({json:{status:"ready"}}));
  await page.goto("/docs");
  await expect(page.getByRole("heading",{name:"The API reference couldn't load."})).toBeVisible();
  await expect(page.locator("#ready-state")).toHaveText("Needs attention");
  fail=false;
  await page.getByRole("button",{name:"Retry loading"}).click();
  await expect(page.locator("#swagger-ui .opblock")).toHaveCount(endpointCount);
  await page.getByRole("button",{name:"Check API",exact:true}).click();
  await expect(page.locator("#ready-state")).toHaveText("Ready");
});

test("Swagger authorization stays in memory and its dialog supports keyboard recovery",async ({page}) => {
  await mockChecks(page);
  await page.goto("/docs");
  await expect(page.locator("#swagger-ui .opblock")).toHaveCount(endpointCount);
  await page.getByRole("button",{name:"Authorize",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Authorize your Supabase session"});
  const token=dialog.getByLabel("Supabase session access token");
  await expect(token).toBeFocused();
  await expect(token).toHaveAttribute("type","password");
  await token.fill("synthetic-documentation-test-token");
  await dialog.getByRole("button",{name:"Apply credentials",exact:true}).click();
  await expect(dialog.getByRole("button",{name:"Remove authorization",exact:true})).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage).includes("synthetic-documentation-test-token"))).toBe(false);
  expect(await page.evaluate(() => JSON.stringify(sessionStorage).includes("synthetic-documentation-test-token"))).toBe(false);
  await dialog.getByRole("button",{name:"Close authorization"}).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button",{name:"Close",exact:true})).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button",{name:"Authorize",exact:true})).toBeFocused();
  let authorizedRequest=false;
  await page.route("**/api/v1/auth/me",route => {
    authorizedRequest=route.request().headers().authorization === "Bearer synthetic-documentation-test-token";
    return route.fulfill({json:{id:1,role:"operator"}});
  });
  await page.getByRole("searchbox",{name:"Search endpoints"}).fill("/api/v1/auth/me");
  const operation=page.locator("#swagger-ui .opblock:visible");
  await operation.locator(".opblock-summary-control").click();
  await operation.getByRole("button",{name:"Try it out",exact:true}).click();
  await operation.getByRole("button",{name:"Execute",exact:true}).click();
  await expect.poll(() => authorizedRequest).toBe(true);
  await page.reload();
  await page.getByRole("button",{name:"Authorize",exact:true}).click();
  await expect(page.getByRole("dialog").getByRole("button",{name:"Remove authorization",exact:true})).toHaveCount(0);
});
