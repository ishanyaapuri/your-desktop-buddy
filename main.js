const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let petWindow = null;
let settingsWindow = null;
let tray = null;
let visitTimer = null;
let snoozeUntil = null;
let isPetRendererReady = false;
let hasDoneInitialVisit = false;
let shouldShowDailyGreeting = false;

const configFile = path.join(app.getPath("userData"), "companion-config.json");

const defaultSettings = {
  enabled: true,
  focusMode: false,
  visitIntervalMinutes: 10,
  waterIntervalMinutes: 30,
  petSize: "medium",
  alwaysOnTop: true,
  launchAtStartup: false,
  quietHoursEnabled: false,
  quietStart: "22:00",
  quietEnd: "08:00",
  petPosition: null,
  daysTogether: 1,
  lastDateSeen: "",
  customPetPath: null
};

function loadSettings() {
  try {
    if (fs.existsSync(configFile)) {
      return { ...defaultSettings, ...JSON.parse(fs.readFileSync(configFile, "utf8")) };
    }
  } catch (err) {
    console.error("Failed to load settings:", err);
  }
  return { ...defaultSettings };
}

let settings = loadSettings();

function updateDailyStreak() {
  const todayStr = new Date().toISOString().split("T")[0];
  if (settings.lastDateSeen !== todayStr) {
    if (settings.lastDateSeen) {
      settings.daysTogether = (settings.daysTogether || 1) + 1;
    } else {
      settings.daysTogether = 1;
    }
    settings.lastDateSeen = todayStr;
    shouldShowDailyGreeting = true;
    saveSettings({ daysTogether: settings.daysTogether, lastDateSeen: settings.lastDateSeen });
  }
}

function saveSettings(patch) {
  settings = { ...settings, ...patch };
  try {
    fs.writeFileSync(configFile, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error("Failed to save settings:", err);
  }
}

function getSafePetPosition(width, height) {
  const area = screen.getPrimaryDisplay().workArea;
  const defaultX = area.x + area.width - width - 15;
  const defaultY = area.y + area.height - height;

  if (!settings.petPosition || typeof settings.petPosition.x !== "number" || typeof settings.petPosition.y !== "number") {
    return { x: defaultX, y: defaultY };
  }

  if (settings.petPosition.y < area.y + area.height * 0.5) {
    return { x: defaultX, y: defaultY };
  }

  const clampedX = Math.max(area.x, Math.min(area.x + area.width - width, settings.petPosition.x));
  const clampedY = Math.max(area.y, Math.min(area.y + area.height - height, settings.petPosition.y));

  return { x: clampedX, y: clampedY };
}

function getPetImagePath() {
  if (settings.customPetPath && fs.existsSync(settings.customPetPath)) {
    return settings.customPetPath;
  }
  return path.join(__dirname, "assets", "pet", "character.png");
}

function applySettings() {
  app.setLoginItemSettings({
    openAtLogin: Boolean(settings.launchAtStartup)
  });

  if (petWindow && !petWindow.isDestroyed() && isPetRendererReady) {
    petWindow.setAlwaysOnTop(Boolean(settings.alwaysOnTop), "screen-saver");
    petWindow.webContents.send("pet-command", "apply-size", { size: settings.petSize });
  }

  scheduleVisits();
  updateTrayUI();
}

function createPetWindow() {
  const width = 380;
  const height = 260;
  const pos = getSafePetPosition(width, height);

  isPetRendererReady = false;

  petWindow = new BrowserWindow({
    width,
    height,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    movable: true,
    alwaysOnTop: Boolean(settings.alwaysOnTop),
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  petWindow.setAlwaysOnTop(Boolean(settings.alwaysOnTop), "screen-saver");
  petWindow.loadFile(path.join(__dirname, "pet.html"));

  petWindow.on("moved", () => {
    if (!petWindow || petWindow.isDestroyed() || !petWindow.isVisible()) return;
    const [x, y] = petWindow.getPosition();
    saveSettings({ petPosition: { x, y } });
  });

  petWindow.on("closed", () => {
    petWindow = null;
    isPetRendererReady = false;
  });
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 460,
    height: 680,
    title: "Desktop Buddy Settings",
    resizable: false,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    backgroundColor: "#faf6f0",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, "settings.html"));

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function createTray() {
  updateTrayIcon();
  updateTrayUI();

  tray.on("click", () => {
    tray.popUpContextMenu();
  });
}

function updateTrayIcon() {
  const iconPath = getPetImagePath();
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  if (!tray) {
    tray = new Tray(trayIcon);
  } else {
    tray.setImage(trayIcon);
  }
}

function turnOn() {
  settings.enabled = true;
  snoozeUntil = null;
  saveSettings({ enabled: true });
  updateTrayUI();
  triggerVisit(true);
}

function turnOff() {
  settings.enabled = false;
  snoozeUntil = null;
  saveSettings({ enabled: false });
  updateTrayUI();
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send("pet-command", "leave-now");
  }
}

function toggleFocusMode() {
  settings.focusMode = !settings.focusMode;
  saveSettings({ focusMode: settings.focusMode });
  updateTrayUI();
  triggerVisit(true);
}

function snoozeFor(minutes) {
  snoozeUntil = Date.now() + minutes * 60 * 1000;
  updateTrayUI();
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send("pet-command", "leave-now");
  }
}

function isInQuietHours() {
  if (!settings.quietHoursEnabled) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = (settings.quietStart || "22:00").split(":").map(Number);
  const [endH, endM] = (settings.quietEnd || "08:00").split(":").map(Number);

  const startTotal = startH * 60 + startM;
  const endTotal = endH * 60 + endM;

  if (startTotal <= endTotal) {
    return currentMinutes >= startTotal && currentMinutes <= endTotal;
  } else {
    return currentMinutes >= startTotal || currentMinutes <= endTotal;
  }
}

function updateTrayUI() {
  if (!tray) return;
  const isSnoozed = snoozeUntil && snoozeUntil > Date.now();
  const inQuiet = isInQuietHours();

  let modeBadge = settings.focusMode ? "🎯 Focus Mode" : "🛋️ Chill Mode";
  let statusText = `Your Desktop Buddy - ${modeBadge} | Day ${settings.daysTogether || 1}`;

  if (!settings.enabled) {
    statusText = "Your Desktop Buddy (Sleeping)";
  } else if (isSnoozed) {
    const minsLeft = Math.ceil((snoozeUntil - Date.now()) / (60 * 1000));
    statusText = `Snoozed (${minsLeft}m left)`;
  } else if (inQuiet) {
    statusText = "Quiet Hours (Sleeping)";
  }

  tray.setToolTip(`${statusText}\n(Click for menu)`);

  const menu = Menu.buildFromTemplate([
    {
      label: "✨ Visit Me Now",
      click: () => {
        if (!settings.enabled) turnOn();
        else triggerVisit(true);
      }
    },
    { type: "separator" },
    {
      label: "🎯 Study / Focus Mode",
      type: "checkbox",
      checked: Boolean(settings.focusMode),
      click: () => toggleFocusMode()
    },
    {
      label: "⚙️ Settings",
      click: () => createSettingsWindow()
    },
    { type: "separator" },
    {
      label: "🟢 Turn ON",
      enabled: !settings.enabled || Boolean(isSnoozed),
      click: () => turnOn()
    },
    {
      label: "🔴 Turn OFF (Sleep until turned ON)",
      enabled: settings.enabled && !isSnoozed,
      click: () => turnOff()
    },
    {
      label: "Snooze",
      submenu: [
        {
          label: "Snooze for 30 minutes",
          click: () => snoozeFor(30)
        },
        {
          label: "Snooze for 1 hour",
          click: () => snoozeFor(60)
        },
        {
          label: "Resume Now",
          enabled: Boolean(isSnoozed) || !settings.enabled,
          click: () => turnOn()
        }
      ]
    },
    { type: "separator" },
    {
      label: "Reset Position to Bottom-Right",
      click: () => resetPetPosition()
    },
    {
      label: "Quit Desktop Buddy",
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(menu);
}

function resetPetPosition() {
  const area = screen.getPrimaryDisplay().workArea;
  const width = 380;
  const height = 260;
  const x = area.x + area.width - width - 15;
  const y = area.y + area.height - height;

  saveSettings({ petPosition: { x, y } });
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.setPosition(x, y);
    triggerVisit(true);
  }
}

let lastWaterTime = Date.now();

function triggerVisit(force = false) {
  // 📅 Checks the calendar date every visit so it updates even if laptop is left on overnight!
  updateDailyStreak(); 

  const isSnoozed = snoozeUntil && snoozeUntil > Date.now();
  const inQuiet = isInQuietHours();
  // ... rest stays identical

  if (!force && (!settings.enabled || isSnoozed || inQuiet)) return;

  if (!petWindow || petWindow.isDestroyed()) {
    createPetWindow();
    return;
  }

  if (!isPetRendererReady) return;

  const width = 380;
  const height = 260;
  const pos = getSafePetPosition(width, height);
  petWindow.setPosition(pos.x, pos.y);

  const now = Date.now();
  const waterIntervalMs = settings.waterIntervalMinutes * 60 * 1000;
  let reminderType = "checkin";

  if (now - lastWaterTime >= waterIntervalMs) {
    reminderType = "water";
    lastWaterTime = now;
  }

  let dailyDayNumber = null;
  if (shouldShowDailyGreeting) {
    dailyDayNumber = settings.daysTogether;
    shouldShowDailyGreeting = false;
  }

  petWindow.showInactive();
  petWindow.setAlwaysOnTop(Boolean(settings.alwaysOnTop), "screen-saver");
  petWindow.webContents.send("pet-command", "visit", { 
    reminderType,
    focusMode: Boolean(settings.focusMode),
    dailyDayNumber,
    imagePath: getPetImagePath()
  });
}

function scheduleVisits() {
  if (visitTimer) clearInterval(visitTimer);
  const intervalMs = settings.visitIntervalMinutes * 60 * 1000;

  visitTimer = setInterval(() => {
    triggerVisit(false);
  }, intervalMs);
}

// IPC Handlers
ipcMain.on("pet-ready", () => {
  isPetRendererReady = true;
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send("pet-command", "apply-size", { size: settings.petSize });
    petWindow.webContents.send("pet-command", "set-avatar", { path: getPetImagePath() });
  }

  if (!hasDoneInitialVisit) {
    hasDoneInitialVisit = true;
    if (settings.enabled && !isInQuietHours()) {
      setTimeout(() => triggerVisit(true), 400);
    }
  }
});

ipcMain.on("hide-pet", () => {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.hide();
  }
});

ipcMain.handle("get-settings", () => ({
  ...settings,
  currentImagePath: getPetImagePath()
}));

ipcMain.on("save-settings", (_event, newSettings) => {
  saveSettings(newSettings);
  applySettings();
});

ipcMain.on("close-settings", () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
  }
});

// 🎨 File Picker for Custom Pet
ipcMain.handle("select-custom-pet", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "webp", "jpg", "jpeg"] }]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const sourcePath = result.filePaths[0];
    const userFolder = app.getPath("userData");
    const destPath = path.join(userFolder, "custom-pet" + path.extname(sourcePath));
    fs.copyFileSync(sourcePath, destPath);

    saveSettings({ customPetPath: destPath });

    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send("pet-command", "set-avatar", { path: destPath });
    }
    updateTrayIcon();
    return destPath;
  }
  return null;
});

ipcMain.handle("reset-custom-pet", () => {
  saveSettings({ customPetPath: null });
  const defaultPath = path.join(__dirname, "assets", "pet", "character.png");
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send("pet-command", "set-avatar", { path: defaultPath });
  }
  updateTrayIcon();
  return defaultPath;
});

app.on("second-instance", () => {
  triggerVisit(true);
});

app.whenReady().then(() => {
  updateDailyStreak();
  createPetWindow();
  createTray();
  scheduleVisits();
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});