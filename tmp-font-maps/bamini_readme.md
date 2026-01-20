# 🅱️ Tamil Unicode to Bamini Converter (Background)

> ⚡ Instantly convert selected Tamil Unicode text to **Bamini font** from anywhere on your system using a simple keyboard shortcut!

---

## 🌟 Features

- 🖥️ **Background Tray App** – quietly runs in the system tray.
- 🔠 **Text Conversion** – converts Tamil Unicode to **Bamini** using precise character mappings.
- ⌨️ **Keyboard Shortcut** – convert selected text with **Ctrl + Alt + B**.
- 🪄 **In-place Replacement** – replaces the selected text directly (not from clipboard).
- 🧠 **Smart Mapping** – based on custom Unicode ➔ Bamini character set logic.
- 🛠️ **Windows Executable** – built with `electron-packager`.
- 🌐 **Cross-platform Ready** – designed to migrate to `nut.js` in future versions for Linux/macOS.

---

## 📁 Project Structure

```
tamil-bamini-converter/
│
├── index.js            # Background Electron logic (tray, shortcut, selection)
├── converter.js        # Tamil Unicode to Bamini conversion logic
├── assets/
│   ├── icon.ico        # App tray & executable icon
│   └── screenshot.png  # Optional screenshot for documentation
├── package.json        # Project metadata and build configuration
└── README.md           # You're here!
```

---

## 🚀 Getting Started

### 🔧 Prerequisites

> ⛑️ These are required for `robotjs` to compile correctly

- ✅ **Node.js** v18.x (recommended)
- ✅ **Python** v3.x (for node-gyp)
- ✅ **Visual Studio Build Tools**
  Install [Build Tools for Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **“Desktop Development with C++”** workload.

---

## 🛠️ Installation

```bash
git clone https://github.com/Pakeetharan/unicode-bamini-converter.git
cd unicode-bamini-converter

# Install dependencies
npm install
```

---

## ▶️ Development: Run Locally

```bash
npm start
```

This launches the app to the tray and listens for keyboard input. Try selecting some Tamil Unicode text and press:

```
Ctrl + Alt + B
```

A system notification will confirm the conversion. The selected text will be replaced **in-place** with its Bamini equivalent.

---

## 💻 Build the Windows Executable

Build using [`electron-packager`](https://github.com/electron/electron-packager):

```bash
npm run package
```

This will generate an executable in the `dist/` folder:

```
dist/
└── TamilBaminiConverter-win32-x64/
    └── TamilBaminiConverter.exe
```

To run the executable:
```bash
cd dist/TamilBaminiConverter-win32-x64
./TamilBaminiConverter.exe
```

---

## 🔣 Unicode ➔ Bamini Logic

The converter is based on a custom replacement engine written in JavaScript (`converter.js`). The function maps combinations like:

```js
text = text.replace(/கி/g, "fp");  // Tamil 'கி' => Bamini 'fp'
text = text.replace(/த/g, "j");    // Tamil 'த' => Bamini 'j'
```

It covers all major Tamil character combinations used in typing.

---

## ⚠️ Known Limitations

- This version only works on **Windows**.
- Only text selections (not clipboard contents) are converted.
- `robotjs` may not support Unicode properly on non-English layouts.

---

## 💻 Tech Stack

| Purpose             | Tool                                                               |
| ------------------- | ------------------------------------------------------------------ |
| Desktop Runtime     | [Electron.js](https://www.electronjs.org/)                         |
| Native Key Handling | [robotjs](https://github.com/octalmage/robotjs)                    |
| Bundler             | [electron-packager](https://github.com/electron/electron-packager) |
| Icon/Tray           | `.ico` assets                                                      |

---

## 📝 License

MIT License © 2025 [Pakeetharan Balasubramaniam](https://github.com/Pakeetharan)

---

## 🤝 Contributions Welcome!

Feel free to fork, contribute, or suggest improvements:

- ✅ macOS/Linux support via `nut.js`
- 🌐 Auto-launch on boot
- 🖕 Bamini to Unicode (reverse) converter

---

## 🌟 Star this repo if it helped you!

```
⭐ Unicode to Bamini, made effortless. ⭐
```

