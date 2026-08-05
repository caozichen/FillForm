# FormPilot Nova WXT

This project wraps the original `extension_v2` FormPilot Nova Chrome extension in a WXT project shell.

The runtime files under `public/` are intentionally close to the original extension:

- `public/options.html`, `public/options.css`, `public/options.js`
- `public/popup.html`, `public/popup.css`, `public/popup.js`
- `public/background.js`
- `public/content/`
- `public/core/`
- `public/templates/`
- `public/template-center.*`
- `public/ui/overlay.css`

## Run

This project is configured with `.npmrc`, so npm cache is stored in `D:\Node\npm-cache`.

```powershell
cd D:\chromecode\FillForm
$env:Path = "D:\Node;" + $env:Path
D:\Node\npm.cmd install
D:\Node\npm.cmd run dev
```

For a production build:

```powershell
$env:Path = "D:\Node;" + $env:Path
D:\Node\npm.cmd run build
```

Then load `.output\chrome-mv3` from `chrome://extensions`.
