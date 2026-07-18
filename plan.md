# Game Plan: Grainfall

## Overview
- **Name:** Grainfall
- **Repo name:** grainfall
- **Tagline:** Rule a city-state one year at a time — split the grain, sow the fields, read the weather, and keep your people alive.
- **Genre (directory category):** strategy

## Core Loop
Each **year** you hold five numbers — grain, people, land, the year, and this year's
land price — and make three decisions with the grain in your granary:
1. **Trade land** at a price that swings every year (buy low, sell high).
2. **Sow** fields (each acre needs a bushel of seed; a farmer works ten acres).
3. **Feed** your people (twenty bushels keeps one alive; under-feed and they starve).

Then the year *rolls*: the harvest lands (weather sets bushels-per-acre), rats may
gnaw the granary, a plague may sweep the city, and — if you fed them — settlers arrive.
The tension is compounding: a fat granary this year is next year's seed, next year's
buffer against a bad harvest, and the thing that draws new people. Feed too little and
they die; feed too much and you've burned the seed you needed. Lose > 45 % of your
people to starvation in a single year and you are overthrown. Survive your whole reign
and you are judged on the city you leave behind.

**Win:** finish the reign with a thriving city (a high *Standing* score → a title).
**Lose:** overthrown (mass starvation in one year) or the city dies (population 0).

## Controls
- **Desktop:** click/drag the three allocation sliders (or type exact numbers into the
  bushel fields), **Enter** = advance the year. Everything reachable by keyboard/Tab.
- **Mobile:** big thumb-friendly sliders + `−/+` steppers and numeric fields; a full-width
  **Sow the year** button. No canvas dexterity — it's a thinking game, so the controls are
  large hit targets (≥44px), never a D-pad or a reach-across gesture.

## Multiplayer
- **Mode:** async-seed (share a deterministic reign; compare who ruled it better). **No live P2P.**
- **Why async and not live P2P (stated deliberately, per the contract):** Grainfall is a
  turn-based *parallel-city* sim — each player advances their own city at their own pace,
  thinking for as long as they like. There is no shared board, no real-time interaction that
  needs sub-150 ms sync, and players naturally end up on different years. Forcing a live mesh
  would add the entire host-transfer / rematch / lockstep-turn surface (the fragile part this
  factory keeps getting bitten by) for a payoff — "we ruled the same decade, who did better" —
  that **async seed-share delivers exactly and robustly**: identical weather/price/event
  sequence from one seed via `rng.ts`, so nobody drew a luckier decade, and a shareable score
  card. The spec explicitly blesses async for games that are best solo. So: ship it beautifully
  solo, with a genuine social layer that can't break.
- **Async shapes:**
  - **Daily Reign:** seed = `grainfall-<UTC-date>` (Steward mode). Everyone plays the same
    decade that day; compare scores.
  - **Challenge link:** `?seed=<n>&mode=<id>` (+ optional `&t=<score>&by=<name>`). A friend
    plays the byte-identical reign; the results screen shows the challenger's score as a
    target to beat (this is the async form of principle #9 — everyone's result, side by side).
  - **Share result:** Web Share / clipboard score card + challenge-back link.

## Juice Plan
- **Tweened number counters** on grain/people/land whenever they change (ease-out, ~600 ms).
- **Harvest:** a shower of grain motes pours into the granary; warm chime scaled to yield.
- **Rats:** a noise-burst "scurry" SFX + the granary number flashes and shudders as it drops.
- **Plague:** screen shake + a low toll; population number greys and drops with a skull mote.
- **Starvation:** somber tone, faded souls drift off the population figure.
- **Year survived:** a soft warm chord + the sun-arc advances one notch across the top.
- **Overthrow / reign complete:** shake + fanfare (or dirge); an illuminated end-of-reign
  scroll tallies the years.
- **Narrated event log** with a brief typewriter reveal — every roll gets one honest line
  ("A fine harvest — 5 bushels an acre." / "Rats! 214 bushels gnawed away." / "Plague took 22 souls.").
- All shake/particles gated behind `prefers-reduced-motion`.

## Style Direction
**Vibe:** cozy-but-tense, illuminated-manuscript / harvest almanac.
**Palette:** warm harvest — wheat/amber accent, parchment text, deep earthy brown-green
background; status colours are **amber (grain) / teal (people) / clay-rose (land)** —
chosen to be colour-blind-safe (no red-vs-green pairing). Alerts use amber→rose, never red/green.
**Theme:** dark, warm (a granary at dusk).
**Reference feel:** the calm legibility of a good almanac; the quiet dread of a Hammurabi turn;
the tactile number-juice of a well-made idle/management game.

## Technical Architecture
- **Stack:** Vanilla TypeScript + Vite. No React (a handful of screens, one state machine).
- **Render:** DOM/CSS — it's numbers, sliders, and a log; crisp text, trivial responsive
  layout, accessible by default. A tiny canvas layer only for the grain-mote / particle juice.
- **Engine modules copied from patterns/:** `rng` (deterministic reign), `sound`, `storage`
  (settings + local best per mode), `mobile.ts` + `mobile.css` (hardenViewport, never-zoom).
  **No** net/lobby/loop (turn-based, async only).
- **Persistence:** localStorage — mute, reduced-motion pref, "seen how-to", and a local best
  Standing per mode.

## Non-Goals
- No live P2P, no server, no accounts.
- No tech tree / buildings / map — depth is the compounding economy, not UI breadth.
- Not a real-time game; no dexterity.

## How To Play (player-facing copy)
> You rule a city-state, one year at a time. Each year, split your grain three ways: **buy or
> sell land** at the going price, **sow** your fields (1 bushel of seed per acre, a farmer works
> 10 acres), and **feed** your people (20 bushels each — or they starve). Then the year rolls:
> the harvest lands, rats and plague test you, and a well-fed city draws new settlers. Keep a
> cushion for the bad years. Survive your reign and history will judge the city you leave behind.

## Balance (this is the whole game — simulate, don't eyeball)
`tests/balance.test.ts` runs a **cautious** bot and a **greedy** bot over hundreds of fixed
seeds per mode and asserts the *shape* of the outcome:
- Cautious **survives** the reign most of the time but not always (skill + luck both matter):
  Steward high (~75–95 %), Famine meaningfully harder, Dynasty in between.
- Cautious **out-survives** greedy in every mode (a reckless policy dies more — skill decides).
- **Mode difficulty ordering holds:** Famine survival < Steward survival.
- Score has real spread (not everyone lands the same number); every game terminates in ≤ reign years.
- The Daily/challenge seed is deterministic (rng test): same seed ⇒ identical weather/price/event
  stream ⇒ identical reign for every player.
