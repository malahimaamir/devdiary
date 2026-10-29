# DevDiary Publish Karne Ka Tareeqa (Step-by-Step)

Yeh guide batati hai ke DevDiary ko **VS Code Marketplace** aur **Open VSX** (VSCodium, Cursor, Windsurf, Gitpod waghera ke liye) par free mein kaise publish karna hai.

---

## 0. Pehle se zaroori cheezein

- Node.js aur npm installed hon.
- Project folder mein `npm install` chal chuka ho.
- Ek Microsoft account (Outlook/Hotmail/Live) aur ek GitHub account.
- Check kar lein ke sab theek build hota hai:

```bash
npm run typecheck
npm test
npm run vsix      # ek .vsix file banegi, isay VS Code mein "Install from VSIX..." se test kar sakte hain
```

---

## 1. Azure DevOps Personal Access Token (PAT) banana

VS Code Marketplace par publish karne ke liye Azure DevOps ka token chahiye.

1. <https://dev.azure.com> par jayen aur apne Microsoft account se sign in karein.
   Agar organization nahi hai to ek nayi organization bana lein (naam kuch bhi ho sakta hai).
2. Upar right corner mein **User settings** (person wala icon) → **Personal access tokens** par click karein.
3. **+ New Token** dabayein aur yeh fill karein:
   - **Name:** `vsce-devdiary`
   - **Organization:** **All accessible organizations** (yeh bohat zaroori hai, warna publish fail hoga)
   - **Expiration:** apni marzi se (maximum 1 saal)
   - **Scopes:** **Custom defined** → **Show all scopes** → **Marketplace** → **Manage** tick karein
4. **Create** dabayein aur token **foran copy** karke kisi mehfooz jagah save kar lein — yeh dobara nazar nahi aayega.

---

## 2. Marketplace Publisher banana

1. <https://marketplace.visualstudio.com/manage> par jayen (wohi Microsoft account).
2. **Create publisher** par click karein.
3. **ID** likhein, maslan `malahim-dev` — yahi aapka **publisher ID** hai. Yeh baad mein change nahi hota, soch samajh kar rakhein.
4. **Name** (display name) likhein aur **Create** dabayein.

---

## 3. `your-publisher-id` ko replace karna

Project mein abhi placeholder `your-publisher-id` laga hua hai. Isay apne asli publisher ID se badlein:

1. `package.json` kholein aur yeh line badlein:

   ```json
   "publisher": "your-publisher-id",
   ```

   ko

   ```json
   "publisher": "malahim-dev",
   ```

2. `package.json` mein `repository`, `bugs` aur `homepage` ke URLs mein `your-github-user` ko apne GitHub username se badal dein (pehle GitHub par `devdiary` naam ki repository bana lein aur code push kar dein).
3. Poore project mein search karein (`Ctrl+Shift+F`) `your-publisher-id` — agar kahin aur bhi likha ho to wahan bhi badal dein.

> Note: Extension ka code publisher ID khud `ctx.extension.id` se nikalta hai, is liye source code mein kuch badalna nahi parta.

---

## 4. VS Code Marketplace par publish karna (`vsce`)

```bash
# Login (publisher ID likhein, phir PAT paste karein)
npx vsce login malahim-dev

# Publish
npx vsce publish
```

- `vsce publish` khud `npm run package` (production build) chalata hai, `.vsix` banata hai aur upload kar deta hai.
- Agli dafa naya version publish karna ho to version khud barha sakte hain:

  ```bash
  npx vsce publish patch   # 0.1.0 -> 0.1.1
  npx vsce publish minor   # 0.1.0 -> 0.2.0
  ```

- Publish ke 5–10 minute baad extension yahan nazar aayega:
  `https://marketplace.visualstudio.com/items?itemName=malahim-dev.devdiary`

---

## 5. Open VSX par publish karna (`ovsx`)

Open VSX VSCodium, Cursor, Windsurf, Gitpod jaise editors use karte hain.

1. <https://open-vsx.org> par jayen aur **GitHub se login** karein.
2. Apne profile mein jaa kar **Eclipse Foundation account** link karein aur **Publisher Agreement** sign karein (yeh ek dafa ka kaam hai).
3. Profile → **Access Tokens** → **Generate New Token** → token copy kar lein.
4. Namespace banayein (yeh publisher ID ke barabar hona chahiye):

   ```bash
   npx ovsx create-namespace malahim-dev -p <OPEN_VSX_TOKEN>
   ```

5. Publish karein:

   ```bash
   npx ovsx publish -p <OPEN_VSX_TOKEN>
   ```

   Ya agar `.vsix` pehle se bani hui hai:

   ```bash
   npx ovsx publish devdiary-0.1.0.vsix -p <OPEN_VSX_TOKEN>
   ```

---

## 6. GitHub Actions se automatic publish (optional)

Project mein `.github/workflows/publish.yml` already mojood hai. Yeh har `v*` tag push hone par dono jagah publish kar deta hai.

1. GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
   - `VSCE_PAT` = Azure DevOps wala token (Step 1)
   - `OVSX_PAT` = Open VSX wala token (Step 5)
2. Naya version release karne ke liye:

   ```bash
   npm version patch          # package.json ka version barhata hai aur git tag banata hai (maslan v0.1.1)
   git push --follow-tags
   ```

3. GitHub ke **Actions** tab mein progress dekh sakte hain.

> `CHANGELOG.md` mein har naye version ki tabdeeliyan likhna na bhoolein — yeh Marketplace par "Changelog" tab mein dikhti hain.

---

## Aam Masail (Troubleshooting)

| Masla | Hal |
| --- | --- |
| `401 Unauthorized` / `Access Denied` | PAT banate waqt **All accessible organizations** aur **Marketplace → Manage** select kiya tha? Naya token bana kar `vsce login` dobara karein. |
| `Missing publisher name` | `package.json` mein `publisher` field check karein. |
| `Make sure to edit the README.md file` | README mein placeholder text na ho. |
| `The extension 'x' already exists` | Extension ka `name` kisi aur ne le liya hai; `package.json` mein `name` badal dein. |
| Open VSX: `Unknown publisher` / namespace error | Pehle `ovsx create-namespace` chalayein aur Publisher Agreement sign karein. |
| Icon nazar nahi aa raha | `media/icon.png` kam az kam 128x128 PNG honi chahiye (SVG allowed nahi). |
