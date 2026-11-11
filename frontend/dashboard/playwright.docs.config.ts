import {defineConfig} from "@playwright/test";
import path from "node:path";
import {existsSync} from "node:fs";
import {fileURLToPath} from "node:url";

const apiRoot = fileURLToPath(new URL("../../backend/api",import.meta.url));
const virtualPython = path.join(apiRoot,".venv",process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const python = process.env.SPROUTSYNC_PYTHON || (existsSync(virtualPython) ? virtualPython : "python");

export default defineConfig({
  testDir:"./tests-api-docs",
  outputDir:"../../.tools/docs-browser-results",
  workers:1,
  use:{baseURL:"http://127.0.0.1:8011",browserName:"chromium",channel:process.platform === "win32" ? "msedge" : undefined,trace:"retain-on-failure"},
  webServer:{
    command:`"${python}" -m uvicorn app.main:app --host 127.0.0.1 --port 8011 --workers 1`,
    cwd:apiRoot,
    url:"http://127.0.0.1:8011/docs",
    env:{MQTT_ENABLED:"false",DATABASE_URL:"sqlite+pysqlite:///:memory:"},
    timeout:30000,
    reuseExistingServer:false,
  },
});
