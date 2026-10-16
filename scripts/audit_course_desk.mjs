// SPDX-License-Identifier: AGPL-3.0-or-later
/** Capture the shipped React UI with isolated fake services, never an existing host. */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (!process.argv.includes("--fake-data"))
  throw new Error("Nur mit --fake-data ausführen");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontend = path.join(root, "frontend");
const require = createRequire(path.join(frontend, "package.json"));
const { default: puppeteer } = await import(
  pathToFileURL(require.resolve("puppeteer-core")).href
);
const { snapshot } = await import(
  pathToFileURL(require.resolve("lighthouse")).href
);
const output = path.join(root, "docs/qa/course-desk-20261016");
const raw = path.join(root, "outputs/course-concepts-20261016/lighthouse");
const api = "http://127.0.0.1:8199";
const preview = "http://127.0.0.1:4199";
const processes = [];
const reports = [];
let browser;

async function start(command, args, cwd, env, health) {
  let occupied = false;
  try {
    await fetch(health, { signal: AbortSignal.timeout(1000) });
    occupied = true;
  } catch {
    /* Unused local port. */
  }
  if (occupied) throw new Error(`Fake-Port bereits belegt: ${health}`);
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: "ignore",
  });
  processes.push(child);
  let error;
  child.on("error", (cause) => {
    error = cause;
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (error) throw error;
    if (child.exitCode !== null)
      throw new Error("Eigener Fake-Dienst konnte nicht starten");
    try {
      if ((await fetch(health, { signal: AbortSignal.timeout(1000) })).ok)
        return;
    } catch {
      /* Starting our process. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Eigener Fake-Dienst antwortet nicht");
}

async function capture(page, state, theme, width) {
  await page.setViewport({ width, height: width === 390 ? 844 : 960 });
  await page.evaluate(() => document.fonts.ready);
  const name = `${state}-${theme}-${width}`;
  await page.screenshot({
    path: path.join(output, `${name}.png`),
    fullPage: state === "course",
  });
  const { lhr } = await snapshot(page, {
    config: {
      extends: "lighthouse:default",
      settings: {
        onlyCategories: ["accessibility"],
        formFactor: width === 390 ? "mobile" : "desktop",
        screenEmulation: { disabled: true },
      },
    },
  });
  await writeFile(path.join(raw, `${name}.json`), JSON.stringify(lhr));
  const report = {
    state,
    theme,
    width,
    accessibility: Math.round(lhr.categories.accessibility.score * 100),
    runtimeError: lhr.runtimeError ?? null,
    findings: Object.values(lhr.audits)
      .filter((audit) => typeof audit.score === "number" && audit.score < 1)
      .map((audit) => ({ id: audit.id, title: audit.title })),
  };
  reports.push(report);
  console.log(`${name}: ${report.accessibility}`);
}

try {
  await mkdir(output, { recursive: true });
  await mkdir(raw, { recursive: true });
  const python = path.join(
    root,
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  await start(
    python,
    [
      "-m",
      "uvicorn",
      "tests.fake_servers.phase1_app:app",
      "--host",
      "127.0.0.1",
      "--port",
      "8199",
    ],
    root,
    { LIBREOFFICE_BIN: "/missing/soffice" },
    `${api}/health`,
  );
  await start(
    process.execPath,
    [
      path.join(frontend, "node_modules/vite/bin/vite.js"),
      "preview",
      "--configLoader",
      "native",
      "--host",
      "127.0.0.1",
      "--port",
      "4199",
      "--strictPort",
    ],
    frontend,
    { UNIOS_API_TARGET: api },
    preview,
  );
  const materialResponse = await fetch(`${api}/api/material/1`);
  if (!materialResponse.ok) throw new Error("Synthetische PDF fehlt");
  const material = await materialResponse.json();
  const body =
    "## Die Grundidee\n\nEine Schleife wiederholt denselben Schritt für mehrere Werte. Ich beschreibe einmal, was passieren soll.\n\n> for: für jeden Wert einer Folge.\n> while: solange eine Bedingung gilt.\n\n## Mein Beispiel\n\nAus den Werten 0, 1 und 2 werden mit +1 die Ausgaben 1, 2 und 3.\n\n## Offene Frage\n\nWas passiert, wenn sich die Bedingung einer while-Schleife nie ändert?";
  const response = await fetch(`${api}/api/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      course_id: material.course_id,
      resource_id: material.resource_id,
      title: "Schleifen verstehen",
      body,
    }),
  });
  if (!response.ok)
    throw new Error("Synthetische Mitschrift konnte nicht angelegt werden");
  const note = (await response.json()).note;
  const executablePath =
    process.env.CHROME_PATH ||
    (process.platform === "win32"
      ? path.join(
          process.env.PROGRAMFILES || "C:/Program Files",
          "Google/Chrome/Application/chrome.exe",
        )
      : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  browser = await puppeteer.launch({ executablePath, headless: true });
  for (const theme of ["light", "dark"])
    for (const width of [1440, 390]) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport({ width, height: width === 390 ? 844 : 960 });
      await page.evaluateOnNewDocument(
        (theme) => localStorage.setItem("unios-theme", theme),
        theme,
      );
      await page.goto(`${preview}/courses/${material.course_id}`, {
        waitUntil: "networkidle0",
      });
      await page.waitForSelector(".course-desk");
      await capture(page, "course", theme, width);
      await page.goto(`${preview}/material/1?workspace=1`, {
        waitUntil: "networkidle0",
      });
      if (width === 390) {
        const button = await page.$(".reader-layout-modes button:last-child");
        await button.click();
      }
      await page.waitForSelector(".reader-note-draft textarea", {
        visible: true,
      });
      await page.focus(".reader-note-draft textarea");
      const modifier = process.platform === "darwin" ? "Meta" : "Control";
      await page.keyboard.down(modifier);
      await page.keyboard.press("A");
      await page.keyboard.up(modifier);
      await page.keyboard.type(
        "Eine Schleife spart Wiederholungen.\n\nHier ist Platz für meine eigene Erklärung.",
      );
      await capture(page, "draft", theme, width);
      if (width === 390) {
        await page.click(".material-side-drawer .material-side-header button");
      }
      await page.goto(`${preview}/material/1?workspace=1&note=${note.id}`, {
        waitUntil: "networkidle0",
      });
      if (width === 390) {
        const button = await page.$(".reader-layout-modes button:last-child");
        await button.click();
      }
      await page.waitForSelector(".reader-continuous-note .studio-document", {
        visible: true,
      });
      await capture(page, "saved-note", theme, width);
      await context.close();
    }
  await writeFile(
    path.join(output, "lighthouse-summary.json"),
    JSON.stringify(
      {
        syntheticFixturesOnly: true,
        method:
          "Lighthouse snapshot of the rendered React course and note workspace",
        frontendIndexSha256: createHash("sha256")
          .update(await readFile(path.join(frontend, "dist/index.html")))
          .digest("hex"),
        reports,
      },
      null,
      2,
    ) + "\n",
  );
  if (
    reports.some((report) => report.runtimeError || report.accessibility < 90)
  )
    throw new Error("Accessibility-Abnahme nicht bestanden");
} finally {
  if (browser) await browser.close();
  for (const process of processes.reverse())
    if (process.exitCode === null) process.kill("SIGTERM");
}
