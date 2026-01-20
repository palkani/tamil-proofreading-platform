const { app, Tray, Menu, globalShortcut, Notification } = require("electron");
const path = require("path");
const { exec } = require("child_process");
const robot = require("robotjs");
const { clipboard } = require("electron");
const { getSelectedText } = require("node-get-selected-text");
const unicodeToBamini = require("./convert");

// Handle Squirrel.Windows events for desktop shortcut
if (require("electron-squirrel-startup")) {
  app.quit();
  return;
}

// Track autostart state
let isAutoStartEnabled = true;

// Set initial autostart state
if (process.platform === "win32") {
  app.setLoginItemSettings({
    openAtLogin: isAutoStartEnabled,
    path: process.execPath,
    args: [],
  });
}

// Create desktop shortcut on install or update
if (process.platform === "win32") {
  const squirrelEvent = process.argv[1];
  if (
    squirrelEvent === "--squirrel-install" ||
    squirrelEvent === "--squirrel-updated"
  ) {
    const shortcutPath = path.join(
      process.env.USERPROFILE,
      "Desktop",
      "TamilBaminiConverter.lnk"
    );
    const exePath = process.execPath;
    exec(
      `powershell -Command "$ws = (New-Object -ComObject WScript.Shell); $s = $ws.CreateShortcut('${shortcutPath}'); $s.TargetPath = '${exePath}'; $s.Save()"`,
      (err) => {
        if (err) console.error("Failed to create desktop shortcut:", err);
      }
    );
  }
}

let tray = null;

app.whenReady().then(() => {
  app.setName("TamilBaminiConverter");
  tray = new Tray(path.join(__dirname, "assets/icon.ico"));

  // Build tray menu with autostart toggle
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Start on Login",
      type: "checkbox",
      checked: isAutoStartEnabled,
      click: () => {
        isAutoStartEnabled = !isAutoStartEnabled;
        app.setLoginItemSettings({
          openAtLogin: isAutoStartEnabled,
          path: process.execPath,
          args: [],
        });
        // Update menu to reflect new state
        tray.setContextMenu(
          Menu.buildFromTemplate([
            {
              label: "Start on Login",
              type: "checkbox",
              checked: isAutoStartEnabled,
              click: arguments[0].click, // Reuse the same click handler
            },
            { label: "Quit", role: "quit" },
          ])
        );
      },
    },
    { label: "Quit", role: "quit" },
  ]);

  tray.setToolTip("Tamil Unicode to Bamini");
  tray.setContextMenu(contextMenu);

  globalShortcut.register("Shift+Alt+V", () => {
    try {
      // Step 1: Copy selected text
      robot.keyTap("c", ["control"]);
      setTimeout(() => {
        const selectedText = getSelectedText().trim();
        if (!selectedText) {
          new Notification({
            title: "No Text Selected",
            body: "Select some Tamil text to convert.",
          }).show();
          return;
        }

        // Step 2: Convert
        const converted = unicodeToBamini(selectedText);

        // Step 3: Write to clipboard as RTF with Bamini font
        const rtfContent = toRTF(converted);
        clipboard.write({ text: converted, rtf: rtfContent });

        // Step 4: Paste
        robot.keyTap("v", ["control"]);

        new Notification({
          title: "Converted",
          body: "Text converted and pasted!",
        }).show();
      }, 300); // Allow time for copy buffer to populate
    } catch (error) {
      new Notification({ title: "Error", body: error.message }).show();
      console.error(error);
    }
  });
});

function toRTF(text, fontName = "Bamini") {
  const toUnicodeRTF = (str) =>
    str
      .split("")
      .map((char) => {
        const code = char.charCodeAt(0);
        if (code === 10 || code === 13) return "\\par "; // Handle newlines
        if (code === 32) return " "; // space
        if (code === 0) return ""; // null character
        return `\\u${code}?`;
      })
      .join("");

  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fnil\\fcharset0 ${fontName};}}\\f0\\fs24 ${toUnicodeRTF(
    text
  )}}`;
}

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
