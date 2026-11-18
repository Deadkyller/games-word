# Games World (Cloudflare Workers)

```
games-world-worker/
  public/            site-ul (index.html, css, js, assets)
  src/worker.js      API-ul pentru profiluri + autentificare administrator
  wrangler.toml      configurare (conține ID-ul KV)
```

## Cum funcționează

Oricine deschide site-ul poate citi tot, inclusiv profilurile jucătorilor.
Doar administratorul poate adăuga, edita și șterge profiluri. Tot ce face apare imediat pentru toți.

Statisticile (Co-Op, PES, OSM) rămân ca până acum: datele din Excel + sincronizare din Google Sheets.
Pe profilul unui jucător apar și statisticile lui din Sheet-uri, când numele coincide cu cel din foi.

## Administratorul (fără buton în aplicație)

Panoul NU apare nicăieri în meniu. Se deschide doar la adresa  `https://adresa-ta/#admin`.
Parola NU se pune în cod sau pe GitHub. Se setează în Cloudflare:
Workers & Pages, apoi `games-world`, apoi Settings, apoi Variables and Secrets, apoi Add.
Type: Secret, Variable name: `ADMIN_PASSWORD`, Value: parola ta. Apoi Deploy.

Sesiunea ține 30 de zile pe acel dispozitiv (cookie HttpOnly, nu poate fi citit de JavaScript).
După 8 parole greșite, adresa e blocată 15 minute.
Dacă schimbi parola în Cloudflare, toate sesiunile vechi se închid.
Fără parola setată, site-ul rămâne doar pentru citit.

## Instalare (o singură dată)

1. Cloudflare: Storage & databases, apoi Workers KV, apoi Create a namespace (ex. `games-world`). Copiază ID-ul.
2. În `wrangler.toml`, înlocuiește `PUNE-AICI-ID-UL-KV` cu acel ID.
3. Pune folderul într-un repository GitHub și conectează-l în Workers & Pages (Create, apoi Import a repository).
   Fiecare commit nou pornește singur un build și publică site-ul.
4. Adaugă secretul `ADMIN_PASSWORD` (pașii de mai sus).

## Fotografii

Fotografia se micșorează în browser (maxim 1200 px, JPEG) și se salvează în KV, sub cheile `img:<id>`.
O fotografie încărcată dar nefolosită dispare după 24 de ore. Dacă o înlocuiești sau ștergi profilul,
fotografia veche mai rămâne 7 zile.

## Dacă cineva șterge profile

În Cloudflare: Workers KV, apoi namespace-ul tău, apoi KV Pairs.
Copiază conținutul cheii `players-backup` și pune-l în cheia `players` (Edit).
Se poate reface doar ultima stare, nu mai multe modificări în urmă.
