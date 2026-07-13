# Publishing Tasky for VS Code

## Prerequisites

1. [Azure DevOps](https://dev.azure.com) / Microsoft account  
2. Create a [Personal Access Token](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token) with **Marketplace → Manage**  
3. Create a publisher (if needed): https://marketplace.visualstudio.com/manage  
   - This extension uses publisher id: **`prashantvc`**  
   - Change `publisher` in `package.json` if you use a different id  

## Local package (no publish)

```bash
npm install
npm run unit
npm run package
# → tasky-0.4.0.vsix
```

Install locally:

```bash
code --install-extension tasky-0.4.0.vsix
```

## Publish to Marketplace

```bash
# one-time login (stores token)
npx @vscode/vsce login prashantvc

# publish current version
npm run publish
# or:
npx @vscode/vsce publish --no-dependencies --no-yarn
```

Bump version in `package.json` before each release (semver). Update `CHANGELOG.md`.

## Open VSX (optional, for VSCodium etc.)

```bash
npx ovsx publish tasky-0.4.0.vsix -p <OPEN_VSX_TOKEN>
```

## Checklist before publish

- [ ] `npm run unit` passes  
- [ ] `npm run package` succeeds  
- [ ] Install `.vsix` and smoke-test: open `.taskpaper` / `.tasks`, sidebar, toggle done, archive, search  
- [ ] `README.md` / `CHANGELOG.md` / `LICENSE` present  
- [ ] `publisher` matches your Marketplace publisher id  
- [ ] Version bumped  

## Notes

- `vendor/birchoutline.js` is large (~1.4 MB uncompressed; ~310 KB in the VSIX).  
- This extension is **unofficial** and not affiliated with Hog Bay Software.  
