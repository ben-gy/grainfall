# Grainfall

**Rule a city-state one year at a time — split the grain, sow the fields, read the weather, and keep your people alive.**

🎮 Play: https://grainfall.benrichardson.dev

## What it is
Grainfall is a cozy-but-tense economy game. Every year you hold five numbers — grain,
people, land, the year, and this year's land price — and split the grain in your granary
three ways: **trade land** at a price that swings every year, **sow** your fields (a bushel
of seed per acre, a farmer works ten acres), and **feed** your people (twenty bushels each,
or they starve).

Then the year *rolls*: the harvest lands (the weather sets bushels-per-acre), rats may gnaw
the granary, a plague may sweep the city, and — if you fed them well — settlers arrive. The
whole game is the compounding: a fat granary is next year's seed, next year's buffer against
a bad harvest, and the thing that draws new people. Feed too little and they die; feed too
much and you've burned the seed you needed. Lose more than 45% of your people to starvation
in a single year and the city rises up and deposes you. Survive your reign and history judges
the city you leave behind.

It's a single-player thinking game — no login, no waiting — playable in five minutes.

## How to play
- **Desktop:** drag the three allocation sliders (or type exact bushels into the fields),
  use the −/+ steppers, and press the **Sow the year** button to advance.
- **Mobile:** big thumb-friendly sliders, steppers, and a full-width button. No dexterity —
  it's a game of decisions.

Three reigns, each a genuinely different game:
- **Steward** — a balanced 10-year reign. Learn the loop; a careful ruler thrives.
- **Famine** — an 11-year war of attrition. Lean harvests, hungry people, cheap land. Play defence.
- **Dynasty** — an 18-year boom. Fertile fields, wildly swinging land prices. Play offence and
  survive your own success.

## Multiplayer
**Async seed-share — no live connection, no server.** Every reign is a deterministic function
of its seed, so:
- **Daily Reign:** everyone plays the same decade each day (same weather, prices, and events).
- **Challenge a friend:** share a link and they play the byte-identical reign; the results
  screen shows their score to beat.

Grainfall is a turn-based, parallel-city game — players think at their own pace and naturally
end up on different years — so async seed-share gives the exact "same luck, who ruled better"
competition robustly, with nothing to desync.

## Tech
- Vite 6 + vanilla TypeScript
- DOM/CSS rendering, with a small canvas layer for the grain-mote juice
- Deterministic seeded RNG (mulberry32) so a shared seed replays an identical reign
- Vitest for logic, determinism, and a **balance sim** that referees the difficulty curve
- GitHub Pages hosting

No cookies, no fingerprinting, no third-party fonts, no accounts. Your settings and bests live
only in your browser. Anonymous, cookie-less page-view counts via Cloudflare Web Analytics are
the only network call.

## Local dev
```bash
npm install
npm run dev
npm test
npm run build
npm run preview
npm run icons   # regenerate the home-screen icons
```

## License
MIT
