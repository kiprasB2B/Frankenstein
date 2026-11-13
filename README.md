# ADAM

**ADAM** – susietų Markdown užrašų laboratorija naršyklėje. Ji panaši į Obsidian, bet turi savo „duomenų laboratorijos“ vizualinę identitetą: grynai juodą foną, plonas šviesiai pilkas linijas ir melsvai žydras švytinčias detales.

🔗 **Gyva versija:** https://kiprasb2b.github.io/Frankenstein/

## Galimybės

- **Vault** – atidarykite tikrą kompiuterio aplanką (File System Access API: Chrome, Edge, Opera). Jei naršyklė jo nepalaiko, užrašai saugomi naršyklės IndexedDB. Užrašai visada yra paprasti `.md` failai.
- **Failų medis** – užrašų ir aplankų kūrimas, pervadinimas (F2), trynimas (Delete), perkėlimas tempiant (drag & drop), kontekstinis meniu.
- **Redaktorius** (CodeMirror 6) su dviem režimais: **šaltinis** ir **gyva peržiūra** (markdown-it). Jie perjungiami mygtuku arba `Ctrl+E`.
- **[[Wiki nuorodos]]** su automatiniu pasiūlymu rašant `[[`. Palaikomos formos `[[Užrašas|tekstas]]` ir `[[Užrašas#antraštė]]`. Paspaudus nuorodą atsidaro užrašas, o jei jo nėra – jis sukuriamas. Pervadinus užrašą, nuorodos kituose užrašuose atnaujinamos.
- **Atgalinės ir išeinančios nuorodos** dešiniajame skydelyje.
- **Interaktyvus 2D grafas**: mazgus galima tempti, priartinti, paspaudus atidaromas užrašas, užvedus paryškinami kaimynai. Yra filtras, „vietinio grafo“ ir neegzistuojančių užrašų jungikliai.
- **Paieška**: greitas perjungiklis (`Ctrl+O`) ir pilno teksto paieška (`Ctrl+Shift+F`), kuri nekreipia dėmesio į diakritiką.
- **Komandų paletė** (`Ctrl+P`).
- **#žymos** su žymų debesiu ir filtravimu (Shift – kelios žymos). Galimos ir hierarchinės žymos: `#projektai/adam`.
- **Dienos užrašas** vienu paspaudimu (`Alt+D`), pavadinimas – šiandienos data (`YYYY-MM-DD`).
- **Skirtukai** ir **ekrano padalijimas** į dvi dalis (`Ctrl+\`).
- **Varnelės** `- [ ]` pažymimos paspaudus peržiūroje, o pakeitimas įrašomas į failą.
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
  "defaultMode": "source",
  "dailyFolder": "Dienos užrašai",
  "autosaveDelay": 400
}
```

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
| Šaltinis / peržiūra | `Ctrl+E` |
| Grafo vaizdas | `Ctrl+G` |
| Naujas užrašas | `Alt+N` |
| Dienos užrašas | `Alt+D` |
| Naujas skirtukas | `Alt+T` |
| Uždaryti skirtuką | `Alt+W` arba vidurinis pelės mygtukas |
| Kitas / ankstesnis skirtukas | `Ctrl+Tab` / `Ctrl+Shift+Tab` |
| Padalinti ekraną / uždaryti padalijimą | `Ctrl+\` |
| Atgal / pirmyn | `Alt+←` / `Alt+→` |
| Išsaugoti dabar | `Ctrl+S` |
| Atidaryti nuorodą šaltinio režime | `Ctrl` + paspaudimas |
| Atidaryti naujame skirtuke | `Ctrl` + paspaudimas (medyje, paieškoje, peržiūroje) |
| Pervadinti / ištrinti failų medyje | `F2` / `Delete` |
| Ieškoti užraše | `Ctrl+F` (redaktoriuje) |
| Grafe: palikti mazgą prisegtą | `Shift` paleidžiant tempiamą mazgą |

macOS sistemoje vietoje `Ctrl` naudokite `Cmd`.

## Projekto struktūra

```
src/
  app.ts                 programos valdiklis: vault, skydeliai, komandos, klavišai
  core/                  vault, keliai, užrašų indeksas, fuzzy paieška, zip
  storage/               File System Access API ir IndexedDB adapteriai
  editor/                CodeMirror nustatymai, tema, wiki nuorodos, markdown-it
  workspace/             ekrano dalys (pane), skirtukai, užrašo vaizdas
  graph/                 grafas: types (sąsajos), forceLayout2d, canvasRenderer2d, graphView
  ui/                    failų medis, paieška, žymos, nuorodos, dialogai, pradžios ekranai
  styles/main.css        visa paletė :root kintamuosiuose
```

**Paletę** pakeisite vienoje vietoje – `src/styles/main.css` faile, `:root` bloke (`--c-bg`, `--c-fg`, `--c-accent`, `--c-glow` ir jų `--rgb-*` atitikmenys). Tuos pačius kintamuosius naudoja ir grafo bei dalelių piešiniai.

**3D grafas**: grafo kodas padalytas į `Layout` (pozicijų skaičiavimą) ir `Renderer` (piešimą) sąsajas (`src/graph/types.ts`). Norint pridėti 3D, užtenka sukurti `ForceLayout3D` (pvz. su `d3-force-3d`) ir `WebGLRenderer3D` (pvz. su three.js), tada papildyti `createEngine()` funkciją `src/graph/graphView.ts` faile. Sąveikos logika ir duomenų modelis lieka tie patys.

## Ką galima patobulinti

Kur reikalavimai buvo neaiškūs, pasirinktas paprastesnis sprendimas:

- **Gyva peržiūra** atvaizduojama atskirai per markdown-it (Ctrl+E perjungia). Obsidian tipo „inline“ peržiūra, kai sintaksė slepiama tiesiai redaktoriuje, būtų kitas žingsnis (CodeMirror dekoracijos).
- **Išoriniai failų pakeitimai** aplanke automatiškai nestebimi. Pakeitus failus kita programa, reikia paleisti komandą „Perskaityti vault iš naujo“.
- **Drag & drop** failų medyje naudoja HTML5 DnD, todėl jutikliniuose ekranuose failus perkelti galima tik per meniu (pervadinant). Galima pridėti „perkelti į…“ dialogą.
- **Skirtukų** negalima perkelti iš vienos ekrano dalies į kitą, o padalijimas yra tik į dvi dalis.
- **Nuorodų atnaujinimas** pervadinus užrašą veikia pagal pavadinimą. Pervadinus aplanką, nuorodos su pilnu keliu (`[[aplankas/užrašas]]`) neatnaujinamos.
- **Dienos užrašų** aplankas (`Dienos užrašai`) ir šablonas keičiami tik per `settings.json`. Nėra nustatymų lango ir kalendoriaus.
- **Paveikslėliai** ir kiti ne `.md` failai medyje nerodomi (eksportuojami / importuojami jie išsaugomi).
- **Indeksas** laikomas atmintyje ir kuriamas iš naujo atidarius vault. Labai dideliems vault (tūkstančiams užrašų) verta krauti `index.json` talpyklą ir skaityti failus tingiai.
- **IndexedDB vault** yra vienas vienai naršyklei. Galima pridėti kelių naršyklės vault palaikymą.
- **Žymos** iš YAML frontmatter (`tags:`) dar neskaitomos.
- **JS paketas** (~790 kB) neskaidomas. Grafą ir zip galima krauti tingiai (dynamic import).
- **Grafo** mazgų pozicijos neišsaugomos tarp seansų.
