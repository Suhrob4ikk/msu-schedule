// Виджет расписания: маленькое окно поверх всех окон + значок у часов.
// Данные — с того же API, что у сайта (через прокси на Vercel: Megafon режет Render).
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, nativeTheme, screen } = require("electron");
const fs = require("fs");
const path = require("path");
const { ACCENT_PRESETS, themeVars } = require("./theme");

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

// background: system | light | dark | black; accent — id пресета с сайта; font: regular | condensed
let settings = {
  groupId: DEFAULT_GROUP, onTop: true, background: "system", accent: "blue", font: "regular", cardBg: "soft",
  ...readJson("settings.json", {}),
};
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

function currentMode() {
  if (["light", "dark", "black"].includes(settings.background)) return settings.background;
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

function push() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("data", {
    lessons, fetchedAt, offline, group: groupLabel(),
    theme: { vars: themeVars(currentMode(), settings.accent), font: settings.font, cardBg: settings.cardBg },
  });
}

function setSetting(key, value) {
  settings[key] = value;
  saveSettings();
  push();
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
    { label: "Открыть полное расписание", click: openApp },
    { type: "separator" },
    { label: `Группа: ${groupLabel() || "—"}`, submenu: groupItems, enabled: groupItems.length > 0 },
    { label: "Обновить сейчас", click: refresh },
    {
      label: "Размер по умолчанию",
      click: () => { settings.width = applySize(WIDTH); saveSettings(); },
    },
    { type: "separator" },
    {
      label: "Тема",
      submenu: [
        ["system", "Как в системе"], ["light", "Светлая"], ["dark", "Тёмная"], ["black", "Чёрная"],
      ].map(([id, label]) => ({
        label, type: "radio", checked: settings.background === id,
        click: () => setSetting("background", id),
      })),
    },
    {
      label: "Цвет",
      submenu: ACCENT_PRESETS.map((p) => ({
        label: p.name, type: "radio", checked: settings.accent === p.id,
        click: () => setSetting("accent", p.id),
      })),
    },
    {
      label: "Фон окна",
      submenu: [
        ["surface", "Как у темы"], ["soft", "Лёгкий оттенок цвета"], ["fill", "Залит цветом"],
      ].map(([id, label]) => ({
        label, type: "radio", checked: settings.cardBg === id,
        click: () => setSetting("cardBg", id),
      })),
    },
    {
      label: "Шрифт",
      submenu: [["regular", "Обычный"], ["condensed", "Узкий"]].map(([id, label]) => ({
        label, type: "radio", checked: settings.font === id,
        click: () => setSetting("font", id),
      })),
    },
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

// Полное расписание — сам сайт в обычном окне. Грузится с Vercel, поэтому всегда
// свежий, а офлайн работает по собственному кэшу сайта.
const SITE_URL = "https://frontend-ten-nu-80.vercel.app/";
let appWin = null;

function openApp() {
  if (appWin && !appWin.isDestroyed()) {
    if (appWin.isMinimized()) appWin.restore();
    appWin.show();
    appWin.focus();
    return;
  }
  appWin = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 380,
    title: "Расписание МГУ",
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, partition: "persist:site" },
  });
  appWin.setMenu(null);
  appWin.loadURL(SITE_URL);
  // Ссылки на чужие сайты — в обычный браузер, не в это окно.
  appWin.webContents.setWindowOpenHandler(({ url }) => {
    require("electron").shell.openExternal(url);
    return { action: "deny" };
  });
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

const MIN_WIDTH = 220;
const MAX_WIDTH = 720;
const heightFor = (w) => Math.round((w * HEIGHT) / WIDTH);

// Размер меняется пропорционально: окно и всё содержимое (через масштаб страницы)
// растут вместе. Прозрачные окна в Windows не умеют тянуться за край сами,
// поэтому ручки по краю окна шлют сюда смещение мыши.
function applySize(width) {
  width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));
  if (!win || win.isDestroyed()) return width;
  const height = heightFor(width);
  let [x, y] = win.getPosition();
  // Окно у края экрана при росте сдвигается внутрь, а не уходит за экран.
  const area = screen.getDisplayMatching({ x, y, width, height }).workArea;
  x = Math.max(area.x, Math.min(x, area.x + area.width - width));
  y = Math.max(area.y, Math.min(y, area.y + area.height - height));
  win.setBounds({ x, y, width, height });
  win.webContents.setZoomFactor(width / WIDTH);
  return width;
}

let resizeFrom = WIDTH;
let resizeTimer = null;

function createWindow() {
  const pos = startPosition();
  const startWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, settings.width || WIDTH));
  win = new BrowserWindow({
    ...pos,
    width: startWidth,
    height: heightFor(startWidth),
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
  win.webContents.on("did-finish-load", () => win.webContents.setZoomFactor(startWidth / WIDTH));
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
    nativeTheme.on("updated", push); // «Как в системе» — следим за переключением темы Windows
    // Положение мыши читаем здесь, а не в странице: при масштабе страницы
    // координаты в ней считаются в других единицах.
    ipcMain.on("resize-start", (_e, edge) => {
      resizeFrom = win.getSize()[0];
      const from = screen.getCursorScreenPoint();
      clearInterval(resizeTimer);
      resizeTimer = setInterval(() => {
        const p = screen.getCursorScreenPoint();
        const dx = p.x - from.x;
        const dy = ((p.y - from.y) * WIDTH) / HEIGHT; // смещение по высоте — в ширину
        applySize(resizeFrom + (edge === "right" ? dx : edge === "bottom" ? dy : (dx + dy) / 2));
      }, 16);
    });
    ipcMain.on("resize-end", () => {
      clearInterval(resizeTimer);
      settings.width = win.getSize()[0];
      saveSettings();
    });
    ipcMain.on("open-app", openApp);
    ipcMain.on("menu", () => buildMenu().popup({ window: win }));
    refresh();
    setInterval(refresh, REFRESH_MS);
    // После сна компьютера данные могли устареть — обновляем сразу.
    require("electron").powerMonitor.on("resume", () => setTimeout(refresh, 3000));
  });
  app.on("window-all-closed", () => {});
}
