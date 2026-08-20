# CraftControl Discord bridge

Send a message in a private Discord channel, and Claude Code runs it on CT102 in
`/opt/craftcontrol` — the same reach it has in an interactive terminal session.
The reply comes back in the channel, and the conversation keeps its context.

```
you   > kodėl serveris lagina?
bot   > 👀  (typing…)
bot   > Watchdog 3 kartus per valandą, visi dump'ai rodo Villager.tick →
        pushEntities. Chunk (0,0) turi 3372 villager'ius…
        -# 14 žingsn. · 96s · $0.42
```

---

## 1. Susikurkite Discord botą

1. Eikite į <https://discord.com/developers/applications> → **New Application**.
   Pavadinimas, pvz., `CraftControl`.
2. Kairėje → **Bot** → **Reset Token** → **Copy**. Šis tokenas rodomas **vieną
   kartą** — iškart įklijuokite į env failą (2 žingsnis).
3. Toje pačioje **Bot** skiltyje, sekcijoje *Privileged Gateway Intents*, įjunkite
   **MESSAGE CONTENT INTENT**. Be jo botas matys tuščias žinutes.
4. Kairėje → **OAuth2** → **URL Generator**:
   - *Scopes*: `bot`
   - *Bot Permissions*: `View Channels`, `Send Messages`, `Read Message History`,
     `Add Reactions`
5. Nukopijuokite apačioje sugeneruotą URL, atidarykite jį ir pakvieskite botą į
   savo serverį.
6. Discord programoje: **Settings → Advanced → Developer Mode** ON. Tada:
   - dešiniu pelės mygtuku ant savo vardo → **Copy User ID**
   - dešiniu ant kanalo → **Copy Channel ID**

> Kanalą rinkitės **privatų**. Viskas, ką jame parašo allowlist'o narys, vykdoma
> root teisėmis ant CT102.

## 2. Sukonfigūruokite hostą

```bash
sudo cp /opt/craftcontrol/discord-bot/craftcontrol-discord.env.example \
        /etc/craftcontrol-discord.env
sudo chmod 600 /etc/craftcontrol-discord.env
sudo nano /etc/craftcontrol-discord.env     # token, user ID, channel ID
```

## 3. Paleiskite servisą

```bash
sudo cp /opt/craftcontrol/discord-bot/craftcontrol-discord.service \
        /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now craftcontrol-discord
sudo systemctl status craftcontrol-discord
journalctl -u craftcontrol-discord -f
```

Sėkmingas startas atrodo taip:

```
Connected as CraftControl#0 (1234567890)
Watching channels: 9876543210
Allowlisted users: 1112223334
```

Parašykite `!help` kanale.

## Komandos

| Komanda | Ką daro |
|---|---|
| *(bet koks tekstas)* | Perduodama Claude; kontekstas kanale išsaugomas |
| `!help` | Pagalba |
| `!new` | Naujas pokalbis — išvalo kontekstą |
| `!status` | Sesijos ID, ar užimtas, veikimo laikas |
| `!stop` | Nutraukia vykdomą darbą |

Vienu metu vykdomas **vienas** darbas. Kol jis sukasi, kitos užklausos gauna ⏳ ir
atmetamos, o ne tyliai kaupiasi eilėje.

## Kaip veikia

Botas kviečia:

```
claude -p "<jūsų žinutė>" --output-format json \
       --permission-mode acceptEdits \
       --resume <ankstesnės sesijos id>
```

`cwd` yra `/opt/craftcontrol`. `session_id` iš atsakymo išsaugomas
`STATE_FILE`, todėl pokalbis tęsiasi ir po serviso perkrovimo. Jei išsaugota
sesija nebegalioja, botas automatiškai pradeda naują, o ne nulūžta.

Jokių priklausomybių — tik Python stdlib ir Discord REST API. Vietoj gateway
websocket'o naudojamas paprastas polling'as (numatytai kas 3 s), nes komandos
retos, o mažiau judančių dalių reiškia mažiau ką sugadinti.

### Kodėl ant hosto, o ne konteineryje

1. `claude` ir jo OAuth kredencialai yra `/root` ant hosto.
2. Jei botas suktųsi `deploymentV2` stack'e, paprašius `make deploy` jis
   perkrautų savo paties konteinerį viduryje komandos ir atsakymo nebegrąžintų.

### Leidimų režimas

Naudojamas `acceptEdits`, o ne `bypassPermissions` — pastarojo Claude Code
**neleidžia** paleidus root teisėmis (`--dangerously-skip-permissions cannot be
used with root/sudo privileges`), net su opt-in flag'u.

Praktiškai ant CT102 išmatuota, kad `acceptEdits` root'u:

| Veiksmas | Rezultatas |
|---|---|
| Bash komandos (docker, make, git…) | ✅ vykdoma |
| Failų kūrimas/redagavimas `CLAUDE_WORKDIR` viduje | ✅ vykdoma |
| Rašymas **už** `CLAUDE_WORKDIR` ribų | ⛔ atmetama |

Tad agentas pilnavertis ten, kur reikia — repo, docker, deploy — bet negali rašyti
kur papuola. Jei kas nors atmetama, tai matysite atsakymo apačioje kaip
`N atmesti leidimai`. Režimą galima perrašyti `CLAUDE_PERMISSION_MODE`, bet
`bypassPermissions` root'u tiesiog neveiks.

## ⚠️ Saugumas

Botas paleidžia Claude root teisėmis, su prieiga prie docker, repo ir Minecraft
pasaulio duomenų. **Vartotojų allowlist'as yra vienintelė apsauga** tarp Discord
žinutės ir šios galios.

Todėl:

- `DISCORD_ALLOWED_USER_IDS` tuščias → servisas **nestartuoja**. Nėra „leisti
  visiems" atsarginio varianto.
- Neįtraukto vartotojo žinutės ignoruojamos, pažymimos ⛔ ir įrašomos į žurnalą su
  vardu ir ID — `journalctl -u craftcontrol-discord | grep DENIED`.
- Botas skaito **tik** `DISCORD_CHANNEL_IDS` išvardintus kanalus.
- `/etc/craftcontrol-discord.env` turi būti `0600` ir niekada nepatekti į git.

Jei tokenas nutekėjo: Developer Portal → Bot → **Reset Token**, atnaujinkite env
failą, `systemctl restart craftcontrol-discord`.

Verta žinoti: kanalo istorija tampa audito žurnalu, o `journalctl` fiksuoja
kiekvieną priimtą ir atmestą komandą.
