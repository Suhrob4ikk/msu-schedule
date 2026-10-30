// Виджет расписания: маленькое окно поверх всех окон + значок у часов.
// Данные — с того же API, что у сайта (через прокси на Vercel: Megafon режет Render).
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen } = require("electron");
const fs = require("fs");
const path = require("path");

const API = "https://frontend-ten-nu-80.vercel.app/backend/schedule";
const DEFAULT_GROUP = 1438458920; // ПМиИ 3 курс
const REFRESH_MS = 10 * 60 * 1000;
const WIDTH = 300;
const HEIGHT = 132;

let win = null;
let tray = null;
let groups = [];
let lessons = [];
let fetchedAt = null;
let offline = false;

const userFile = (name) => path.join(app.getPath("userData"), name);

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(userFile(name), "utf8"));
  } catch {
    return fallback;
  }
}
function writeJson(name, value) {
  try {
    fs.writeFileSync(userFile(name), JSON.stringify(value));
  } catch {}
}

let settings = { groupId: DEFAULT_GROUP, onTop: true, ...readJson("settings.json", {}) };
const saveSettings = () => writeJson("settings.json", settings);

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(40000) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

function shortGroupName(name) {
  const n = (name || "").toUpperCase();
  if (n.includes("МАТЕМАТИК") && n.includes("ИНФОРМАТИК")) return "ПМиИ";
  if (n.includes("ХИМИЯ") && (n.includes("ФИЗИКА") || n.includes("МЕХАНИКА"))) return "ХФММ";
  if (n.includes("ГЕОЛОГИЯ")) return "Геология";
  if (n.includes("МУНИЦИПАЛЬН") || (n.includes("ГОСУДАРСТВЕНН") && n.includes("УПРАВЛЕНИ"))) return "ГМУ";
  if (n.includes("МЕЖДУНАРОДН") && n.includes("ОТНОШЕНИ")) return "МО";
  if (n.includes("ЛИНГВИСТИК")) return "Лингвистика";
  return name;
}

function groupLabel() {
  const g = groups.find((x) => x.id === settings.groupId);
  return g ? `${shortGroupName(g.name)} ${g.year}` : "";
}

function push() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("data", { lessons, fetchedAt, offline, group: groupLabel() });
}

async function refresh() {
  try {
    if (!groups.length) groups = readJson("groups.json", []);
    const fresh = await getJson(`${API}/groups`).catch(() => null);
    if (fresh && fresh.length) {
      groups = fresh;
      writeJson("groups.json", groups);
    }
    lessons = await getJson(`${API}/group/${settings.groupId}`);
    fetchedAt = Date.now();
    offline = false;
    writeJson("cache.json", { groupId: settings.groupId, lessons, fetchedAt });
  } catch {
    // Сети нет — показываем сохранённое, как сайт в офлайне.
    offline = true;
    const cache = readJson("cache.json", null);
    if (cache && cache.groupId === settings.groupId) {
      lessons = cache.lessons;
      fetchedAt = cache.fetchedAt;
    }
  }
  push();
  buildMenu();
}

function buildMenu() {
  const byYear = {};
  for (const g of groups) (byYear[g.year] = byYear[g.year] || []).push(g);
  const groupItems = Object.keys(byYear)
    .sort()
    .map((year) => ({
      label: `${year} курс`,
      submenu: byYear[year].map((g) => ({
        label: shortGroupName(g.name),
        type: "radio",
        checked: g.id === settings.groupId,
        click: () => {
          settings.groupId = g.id;
          saveSettings();
          lessons = [];
          refresh();
        },
      })),
    }));

  const template = [
    { label: `Группа: ${groupLabel() || "—"}`, submenu: groupItems, enabled: groupItems.length > 0 },
    { label: "Обновить сейчас", click: refresh },
    { type: "separator" },
    {
      label: "Поверх всех окон",
      type: "checkbox",
      checked: settings.onTop,
      click: (item) => {
        settings.onTop = item.checked;
        saveSettings();
        applyOnTop();
      },
    },
    {
      label: "Запускать вместе с Windows",
      type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: "separator" },
    { label: "Показать / скрыть", click: toggle },
    { label: "Выход", click: () => app.quit() },
  ];
  const menu = Menu.buildFromTemplate(template);
  if (tray) tray.setContextMenu(menu);
  return menu;
}

function applyOnTop() {
  if (win) win.setAlwaysOnTop(settings.onTop, "floating");
}

function toggle() {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else win.show();
}

function startPosition() {
  const saved = settings.pos;
  const displays = screen.getAllDisplays();
  if (saved && displays.some((d) => {
    const b = d.workArea;
    return saved.x >= b.x && saved.y >= b.y && saved.x + WIDTH <= b.x + b.width && saved.y + HEIGHT <= b.y + b.height;
  })) return saved;
  const b = screen.getPrimaryDisplay().workArea;
  return { x: b.x + b.width - WIDTH - 16, y: b.y + 16 };
}

function createWindow() {
  const pos = startPosition();
  win = new BrowserWindow({
    ...pos,
    width: WIDTH,
    height: HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });
  applyOnTop();
  win.loadFile("widget.html");
  win.once("ready-to-show", () => win.show());
  win.on("moved", () => {
    const [x, y] = win.getPosition();
    settings.pos = { x, y };
    saveSettings();
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "icon.png"));
  tray = new Tray(icon);
  tray.setToolTip("Расписание МГУ");
  tray.on("click", toggle);
  buildMenu();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => win && win.show());
  app.whenReady().then(() => {
    createWindow();
    createTray();
    ipcMain.on("ready", push);
    ipcMain.on("menu", () => buildMenu().popup({ window: win }));
    refresh();
    setInterval(refresh, REFRESH_MS);
    // После сна компьютера данные могли устареть — обновляем сразу.
    require("electron").powerMonitor.on("resume", () => setTimeout(refresh, 3000));
  });
  app.on("window-all-closed", () => {});
}
