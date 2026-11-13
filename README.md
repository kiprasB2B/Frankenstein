# ADAM

**ADAM** – susietų Markdown užrašų laboratorija naršyklėje. Ji panaši į Obsidian, bet turi savo „duomenų laboratorijos“ vizualinę identitetą: grynai juodą foną, plonas šviesiai pilkas linijas ir melsvai žydras švytinčias detales.

🔗 **Gyva versija:** https://kiprasb2b.github.io/Frankenstein/

## Galimybės

- **Vault** – atidarykite tikrą kompiuterio aplanką (File System Access API: Chrome, Edge, Opera). Jei naršyklė jo nepalaiko, užrašai saugomi naršyklės IndexedDB. Užrašai visada yra paprasti `.md` failai.
- **Failų medis** – užrašų, aplankų ir paveikslėlių kūrimas, pervadinimas (F2), trynimas (Delete), perkėlimas tempiant (drag & drop) arba per meniu **„Perkelti į…“**, kuris veikia ir telefone.
- **Redaktorius** (CodeMirror 6) su trimis režimais:
  - **Gyva** (numatytasis) – kaip Obsidian: Markdown simboliai (`#`, `**`, `` ` ``, `>`, `[[ ]]`) slepiami tiesiai redaktoriuje, išskyrus eilutę su žymekliu. Varnelės, punktai, linijos ir paveikslėliai rodomi kaip valdikliai.
  - **Šaltinis** – matomas visas Markdown.
  - **Skaitymas** – tik peržiūra (markdown-it).

  `Ctrl+E` perjungia gyvą peržiūrą ir šaltinį, o visi trys režimai pasiekiami ir mygtukais antraštėje.
- **[[Wiki nuorodos]]** su automatiniu pasiūlymu rašant `[[`. Palaikomos formos `[[Užrašas|tekstas]]` ir `[[Užrašas#antraštė]]`. Paspaudus nuorodą atsidaro užrašas, o jei jo nėra – jis sukuriamas. Pervadinus užrašą, nuorodos kituose užrašuose atnaujinamos.
- **Atgalinės ir išeinančios nuorodos** dešiniajame skydelyje.
- **Interaktyvus 2D ir 3D grafas**: mazgus galima tempti, priartinti, paspaudus atidaromas užrašas, užvedus paryškinami kaimynai. Yra filtras, „vietinio grafo“ ir neegzistuojančių užrašų jungikliai.
  - **3D režime** fono tempimas suka grafą, `Shift` + tempimas jį stumia, o neliečiamas grafas lėtai sukasi pats.
  - Toliau esantys mazgai blanksta kaip rūke.
- **Paieška**: greitas perjungiklis (`Ctrl+O`) ir pilno teksto paieška (`Ctrl+Shift+F`), kuri nekreipia dėmesio į diakritiką.
- **Komandų paletė** (`Ctrl+P`).
- **#žymos** su žymų debesiu ir filtravimu (Shift – kelios žymos). Galimos ir hierarchinės žymos: `#projektai/adam`.
- **Dienos užrašas** vienu paspaudimu (`Alt+D`), pavadinimas – šiandienos data (`YYYY-MM-DD`). Šablone galima naudoti kintamuosius `{{data}}`, `{{diena}}` ir `{{laikas}}`.
- **Skirtukai** ir **ekrano padalijimas** į dvi dalis (`Ctrl+\`).
- **Varnelės** `- [ ]` pažymimos paspaudus gyvoje peržiūroje arba skaitymo režime, o pakeitimas įrašomas į failą.
- **Paveikslėliai** – `![[foto.png]]` (pločiui – `![[foto.png|300]]`) ir `![aprašas](kelias/foto.png)`.
  - Rodomi failų medyje ir atsidaro atskirame skirtuke.
  - Įklijuoti (`Ctrl+V`) arba įtempti paveikslėliai išsaugomi aplanke „Priedai“ ir įterpiami automatiškai.
- **Nustatymai** (`Ctrl+,`) – numatytasis režimas, šrifto dydis, išsaugojimo delsa, dienos užrašų aplankas ir šablonas, priedų aplankas, grafo režimas.
- **Eksportas ir importas** – visas vault kaip `.zip`.
- **Automatinis išsaugojimas** (taip pat `Ctrl+S`, perjungiant skirtukus ir uždarant langą).
- **Pradžios ekranas** su gyvu pavyzdinių užrašų grafu. Jis rodomas, kai vault tuščias.
- **Responsive** – telefone skydeliai tampa ištraukiamais stalčiais.

### Kur saugomi duomenys

| Kas | Kur |
|---|---|
| Užrašai | `*.md` failai vault aplanke |
| Nustatymai | `.frankenstein/settings.json` |
| Darbo vietos būsena (skirtukai, padalijimas, skydeliai) | `.frankenstein/workspace.json` |
| Užrašų indeksas (nuorodos, žymos) | `.frankenstein/index.json` |

`settings.json` pavyzdys:

```json
{
  "defaultMode": "live",
  "dailyFolder": "Dienos užrašai",
  "dailyTemplate": "_{{diena}}_\n\n## Užduotys\n- [ ] \n",
  "attachmentFolder": "Priedai",
  "autosaveDelay": 400,
  "fontSize": 15,
  "graphMode": "2d"
}
```

Visus šiuos nustatymus patogiau keisti nustatymų lange (`Ctrl+,`).

## Paleidimas lokaliai

Reikia [Node.js](https://nodejs.org/) 20 ar naujesnės versijos.

```bash
npm install
```

```bash
npm run dev
```

Atidarykite adresą, kurį parodys Vite (pvz. http://localhost:5173/Frankenstein/).

Produkcinė versija surenkama į aplanką `dist/`:

```bash
npm run build
```

Surinktą versiją galima peržiūrėti lokaliai:

```bash
npm run preview
```

## Deploy į GitHub Pages

1. Repo nustatymuose atidarykite **Settings → Pages → Build and deployment → Source** ir pasirinkite **GitHub Actions** (tai reikia padaryti vieną kartą).
2. Padarykite push į `main` šaką. Workflow `.github/workflows/deploy.yml` surinks projektą (`npm ci && npm run build`) ir paskelbs aplanką `dist/`.
3. Eigą matysite skiltyje **Actions**. Po kelių minučių svetainė bus pasiekiama adresu https://kiprasb2b.github.io/Frankenstein/.

`vite.config.ts` nustatytas `base: '/Frankenstein/'`, todėl visi resursai kraunami teisingu keliu. Jei repo pervadinsite, šią reikšmę reikia pakeisti.

## Klavišų kombinacijos

| Veiksmas | Klavišai |
|---|---|
| Komandų paletė | `Ctrl+P` |
| Greitas perjungiklis (atidaryti / sukurti užrašą) | `Ctrl+O` |
| Paieška visuose užrašuose | `Ctrl+Shift+F` |
| Gyva peržiūra / šaltinis | `Ctrl+E` |
| Nustatymai | `Ctrl+,` |
| Grafo vaizdas | `Ctrl+G` |
| Naujas užrašas | `Alt+N` |
| Dienos užrašas | `Alt+D` |
| Naujas skirtukas | `Alt+T` |
| Uždaryti skirtuką | `Alt+W` arba vidurinis pelės mygtukas |
| Kitas / ankstesnis skirtukas | `Ctrl+Tab` / `Ctrl+Shift+Tab` |
| Padalinti ekraną / uždaryti padalijimą | `Ctrl+\` |
| Atgal / pirmyn | `Alt+←` / `Alt+→` |
| Išsaugoti dabar | `Ctrl+S` |
| Atidaryti nuorodą | paspaudimas (gyvoje peržiūroje), `Ctrl` + paspaudimas (šaltinyje) |
| Įterpti paveikslėlį | `Ctrl+V` arba įtempti failą į redaktorių |
| Atidaryti naujame skirtuke | `Ctrl` + paspaudimas (medyje, paieškoje, peržiūroje) |
| Pervadinti / ištrinti failų medyje | `F2` / `Delete` |
| Ieškoti užraše | `Ctrl+F` (redaktoriuje) |
| Grafe: palikti mazgą prisegtą | `Shift` paleidžiant tempiamą mazgą |
| 3D grafe: sukti / stumti | tempti foną / `Shift` + tempti |

macOS sistemoje vietoje `Ctrl` naudokite `Cmd`.

## Projekto struktūra

```
src/
  app.ts                 programos valdiklis: vault, skydeliai, komandos, klavišai
  core/                  vault, keliai, užrašų indeksas, fuzzy paieška, zip
  storage/               File System Access API ir IndexedDB adapteriai
  editor/                CodeMirror nustatymai, tema, wiki nuorodos, markdown-it
  workspace/             ekrano dalys (pane), skirtukai, užrašo vaizdas
  graph/                 grafas: types (sąsajos), forceLayout2d/3d, canvasRenderer2d/3d, graphView
  ui/                    failų medis, paieška, žymos, nuorodos, dialogai, pradžios ekranai
  styles/main.css        visa paletė :root kintamuosiuose
```

**Paletę** pakeisite vienoje vietoje – `src/styles/main.css` faile, `:root` bloke (`--c-bg`, `--c-fg`, `--c-accent`, `--c-glow` ir jų `--rgb-*` atitikmenys). Tuos pačius kintamuosius naudoja ir grafo bei dalelių piešiniai.

**2D / 3D grafas**: grafo kodas padalytas į `Layout` (pozicijų skaičiavimą: `ForceLayout2D` su d3-force, `ForceLayout3D` su d3-force-3d) ir `Renderer` (piešimą: `CanvasRenderer2D`, `CanvasRenderer3D` su perspektyva) sąsajas (`src/graph/types.ts`). Režimas parenkamas `createEngine()` funkcijoje. Norint pereiti prie WebGL (pvz. three.js), užtenka naujo `Renderer` įgyvendinimo.

## Ką galima patobulinti

Kur reikalavimai buvo neaiškūs, pasirinktas paprastesnis sprendimas:

- **Gyva peržiūra** atidengia visą eilutę, kurioje yra žymeklis (Obsidian atidengia tik konkretų elementą). Lentelės ir kodo blokai rodomi kaip šaltinis.
- **Išoriniai failų pakeitimai** aplanke automatiškai nestebimi. Pakeitus failus kita programa, reikia paleisti komandą „Perskaityti vault iš naujo“.
- **Skirtukų** negalima perkelti iš vienos ekrano dalies į kitą, o padalijimas yra tik į dvi dalis.
- **Nuorodų atnaujinimas** pervadinus užrašą veikia pagal pavadinimą. Pervadinus aplanką, nuorodos su pilnu keliu (`[[aplankas/užrašas]]`) neatnaujinamos.
- **Kiti failai** (PDF, garsas, vaizdo įrašai) medyje nerodomi, o eksportuojami ir importuojami jie išsaugomi. Ištrynus užrašą, jo paveikslėliai lieka priedų aplanke.
- **Indeksas** laikomas atmintyje ir kuriamas iš naujo atidarius vault. Labai dideliems vault (tūkstančiams užrašų) verta krauti `index.json` talpyklą ir skaityti failus tingiai.
- **IndexedDB vault** yra vienas vienai naršyklei. Galima pridėti kelių naršyklės vault palaikymą.
- **Žymos** iš YAML frontmatter (`tags:`) dar neskaitomos.
- **Pagrindinis JS paketas** (~760 kB, gzip ~270 kB) daugiausia yra CodeMirror ir markdown-it. Grafas, d3-force ir zip jau kraunami tingiai.
- **3D grafas** piešiamas Canvas 2D su perspektyva. Labai dideliems grafams (>2000 mazgų) būtų greitesnis WebGL piešėjas.
- **Grafo** mazgų pozicijos ir pasirinktas 2D/3D režimas tarp seansų neišsaugomi (numatytasis režimas – nustatymuose).
