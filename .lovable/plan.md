# NEXUS-logo siistimiseksi (ei blur-efektiä)

Ongelma: kirjautumissivulla käytetty logokuva on tekoälyllä tehty rasterikuva, jonka reunat pehmenevät ja logo näyttää epäterävältä pienessä koossa (kuten käyttäjän lähettämässä kuvakaappauksessa).

## Ratkaisu

Piirretään logo koodilla SVG:nä/Tekstinä web-fontilla Saira (projectin brändifontti) sen sijaan, että käytetään rasterikuvaa:

- Sivustolla /auth logo renderöidään inline-elementtinä: fontti Saira 800 kursiivi, kirjaimet NE**X**US, X verde-neon ja muut kirjaimet valkoiset. Tämä on teräv kaikissa kooissa ja saumaton tummalle taustalle.
- Poistetaan rasterilogo `src/assets/nexus-logo.png` käytöstä kirjautumissivulla.

## Favicon

Nykyinen favicon on myös tehty samasta epäterävästä kuvasta. Uusi favicon tehdään renderöimällä sama puhtaasti koodilla piirretty logo selaimessa (Playwright-kuvakaappaus) ja pienentämällä se 64×64 pikseliin `public/favicon.png`-tiedostoksi — ei aiheuta sumeutta.

## Muutoksen laajuus

- Vain kirjautumissivun logo ja favicon. Taustakuva, lomake ja muut elementit säilyvät ennallaan.
- Kirjautumisen toiminnallisuutta ei muuteta.

## Verifiointi

- `npx tsc --noEmit` ja build-loki.
- Playwright-kuvakaappaukset /auth työpöydällä ja mobiilissa: logo terävä, ei sumeutta.
