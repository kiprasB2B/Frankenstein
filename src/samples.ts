// Pavyzdiniai susieti užrašai, kuriuos galima sukurti iš tuščio vault pradžios ekrano.

export interface Sample {
  name: string;
  blurb: string;
  body: string;
}

export const SAMPLES: Sample[] = [
  {
    name: 'Sveiki atvykę',
    blurb: 'Pradžios taškas: kas yra ADAM ir nuo ko pradėti.',
    body: `Tai jūsų **ADAM** laboratorija – vieta, kur mintys susijungia į tinklą.

Kiekvienas užrašas yra paprastas \`.md\` failas. Užrašus jungia [[Wiki nuorodos]], o visą tinklą matote [[Grafo vaizdas|grafe]].

## Kur toliau
- [ ] Perskaityti apie [[Wiki nuorodos]]
- [ ] Išbandyti [[Žymos]] ir filtravimą
- [ ] Atidaryti [[Grafo vaizdas]] (Ctrl+G)
- [ ] Peržiūrėti [[Klavišų kombinacijos]]
- [ ] Sukurti pirmą dienos užrašą (Alt+D)

> Patarimas: perjunkite peržiūros režimą su **Ctrl+E** ir pažymėkite varneles – jos įrašomos į failą.

#pradžia`,
  },
  {
    name: 'Wiki nuorodos',
    blurb: 'Kaip jungti užrašus dvigubais laužtiniais skliaustais.',
    body: `Parašykite \`[[\` ir pradėkite vesti pavadinimą – atsiras pasiūlymų sąrašas.

- \`[[Užrašas]]\` – paprasta nuoroda
- \`[[Užrašas|kitas tekstas]]\` – nuoroda su savo tekstu
- \`[[Neegzistuojantis]]\` – paspaudus užrašas bus sukurtas, pvz. [[Nauja idėja]]

Kiekviena nuoroda sukuria **atgalinę nuorodą**: dešiniajame skydelyje matysite, kas nurodo į šį užrašą. Grįžti: [[Sveiki atvykę]].

#pradžia #nuorodos`,
  },
  {
    name: 'Grafo vaizdas',
    blurb: 'Interaktyvus švytintis visų ryšių žemėlapis.',
    body: `Grafas rodo visus užrašus kaip švytinčias daleles, o [[Wiki nuorodos]] – kaip plonas linijas tarp jų.

- tempkite mazgus pele ar pirštu
- ratuku keiskite mastelį
- užveskite – paryškės kaimynai
- paspauskite – atsidarys užrašas

Jungiklis **Vietinis** rodo tik aktyvaus užrašo aplinką. Žr. [[Žymos]].

#pradžia #grafas`,
  },
  {
    name: 'Žymos',
    blurb: 'Grupuokite užrašus #žymomis ir filtruokite.',
    body: `Bet kur tekste parašykite \`#žyma\`. Visas žymas rasite kairiajame skydelyje (# ikona).

Paspaudus žymą matysite jos užrašus, **Shift** + paspaudimas – keli filtrai iš karto. Hierarchija: \`#projektai/adam\`.

Susiję: [[Grafo vaizdas]], [[Sveiki atvykę]].

#pradžia #žymos`,
  },
  {
    name: 'Klavišų kombinacijos',
    blurb: 'Greičiausias būdas valdyti laboratoriją.',
    body: `| Veiksmas | Klavišai |
|---|---|
| Komandų paletė | Ctrl+P |
| Greitas perjungiklis | Ctrl+O |
| Paieška visuose užrašuose | Ctrl+Shift+F |
| Šaltinis / peržiūra | Ctrl+E |
| Grafas | Ctrl+G |
| Dienos užrašas | Alt+D |
| Naujas užrašas | Alt+N |
| Padalinti ekraną | Ctrl+\\\\ |
| Atgal / pirmyn | Alt+← / Alt+→ |

Grįžti į [[Sveiki atvykę]].

#pradžia`,
  },
];
