import './styles/mobile.css';
import './styles/main.css';

import { hardenViewport } from './engine/mobile';
import { createSfx, type SfxName } from './engine/sound';
import { createStore } from './engine/storage';
import { newSeed } from './engine/rng';
import {
  initGame,
  resolveYear,
  legalize,
  feedNeeded,
  maxBuy,
  maxSow,
  standing,
  type GameState,
  type Decision,
  type YearResult,
} from './game';
import { MODES, MODE_IDS, modeOf, DEFAULT_MODE, type ModeId } from './modes';
import { cautious } from './bots';
import {
  parseShare,
  buildChallengeUrl,
  clearShareInUrl,
  dailySeed,
  dailyLabel,
  type ShareParams,
} from './share';
import { Particles } from './render/particles';
import { el, clear, openSheet, toast, fmt, tweenNumber, shareOrCopy } from './ui';

hardenViewport();

const store = createStore('grainfall');
const sfx = createSfx(store.get('muted', false));
document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

// ---- Root scaffolding ----
const app = document.getElementById('app')!;
const motes = el('canvas', { id: 'motes', 'aria-hidden': 'true' });
document.body.prepend(motes);
const particles = new Particles(motes);

const root = el('div', { class: 'main-content' });
const footer = el('footer', {
  class: 'site-footer',
  html:
    'Built by <a href="https://benrichardson.dev/" target="_blank" rel="noopener">benrichardson.dev</a> · ' +
    '<a href="https://hub.benrichardson.dev" target="_blank" rel="noopener">more games, tools &amp; sites</a>',
});
app.append(root, footer);

function setPlaying(on: boolean): void {
  document.body.classList.toggle('playing', on);
}

function play(name: SfxName): void {
  sfx.play(name);
}

// ---- Shared session context ----
const incoming: ShareParams = parseShare();
let selectedMode: ModeId = incoming.seed != null ? incoming.modeId : (store.get('mode', DEFAULT_MODE) as ModeId);
let challenge: { target: number | null; by: string | null } = { target: incoming.target, by: incoming.by };

// =====================================================================
// MENU
// =====================================================================
function renderMenu(): void {
  setPlaying(false);
  clear(root);

  const brand = el('div', { class: 'brand' }, [
    sheafSvg(),
    el('h1', {}, ['Grainfall']),
    el('p', { class: 'tag' }, ['Rule a city-state one year at a time. Split the grain, sow the fields, keep your people alive.']),
  ]);

  const menu = el('div', { class: 'menu' });

  // A challenge from a shared link.
  if (incoming.seed != null) {
    const m = modeOf(incoming.modeId);
    const card = el('div', { class: 'mode-card on' }, [
      el('div', { class: 'mc-name' }, ['A challenge awaits']),
      el('div', { class: 'mc-feel' }, [
        challenge.by ? `${challenge.by} played the ${m.name} reign` : `A shared ${m.name} reign`,
      ]),
      el('div', { class: 'mc-blurb' }, [
        challenge.target != null
          ? `Their standing: ${fmt(challenge.target)}. Play the identical decade and beat it.`
          : `Play the identical decade — same weather, same prices — and compare.`,
      ]),
    ]);
    const accept = el('button', {
      class: 'btn-primary',
      onclick: () => startGame(incoming.seed!, incoming.modeId, { target: challenge.target, by: challenge.by }),
    }, [`Accept the challenge`]);
    menu.append(card, accept, el('div', { class: 'section-label' }, ['Or start your own']));
  }

  // Mode picker
  const picker = el('div', { class: 'mode-pick' });
  const cards: HTMLButtonElement[] = [];
  for (const id of MODE_IDS) {
    const m = MODES[id];
    const c = el('button', {
      class: 'mode-card' + (id === selectedMode ? ' on' : ''),
      onclick: () => {
        selectedMode = id;
        store.set('mode', id);
        cards.forEach((b, i) => b.classList.toggle('on', MODE_IDS[i] === id));
        play('click');
      },
    }, [
      el('span', { class: 'mc-name' }, [m.name]),
      el('span', { class: 'mc-feel' }, [m.feel]),
      el('span', { class: 'mc-blurb' }, [m.blurb]),
    ]) as HTMLButtonElement;
    cards.push(c);
    picker.append(c);
  }

  const playBtn = el('button', {
    class: 'btn-primary sow-btn',
    onclick: () => startGame(newSeed(), selectedMode, { target: null, by: null }),
  }, ['Begin your reign']);

  const daily = el('button', {
    class: 'btn-ghost',
    onclick: () => startGame(dailySeed(), DEFAULT_MODE, { target: null, by: null, daily: true }),
  }, [`Daily Reign — ${dailyLabel()}`]);

  const links = el('div', { class: 'btn-row' }, [
    el('button', { class: 'btn-ghost', onclick: showHowTo }, ['How to play']),
    el('button', { class: 'btn-ghost', onclick: showAbout }, ['About']),
    muteButton(),
  ]);

  menu.append(
    el('div', { class: 'section-label' }, ['Choose a reign']),
    picker,
    playBtn,
    daily,
    links,
  );

  root.append(brand, menu);

  if (!store.get('seenHelp', false)) {
    store.set('seenHelp', true);
    showHowTo();
  }
}

function muteButton(): HTMLButtonElement {
  const b = el('button', { class: 'btn-ghost', onclick: () => {
    const m = !sfx.muted();
    sfx.setMuted(m);
    store.set('muted', m);
    b.textContent = m ? '🔇 Sound off' : '🔊 Sound on';
    if (!m) play('click');
  } }, [sfx.muted() ? '🔇 Sound off' : '🔊 Sound on']) as HTMLButtonElement;
  return b;
}

// =====================================================================
// GAME
// =====================================================================
let state!: GameState;
let plan!: Decision;
let resolving = false;
let sessionChallenge: { target: number | null; by: string | null } = { target: null, by: null };
let isDaily = false;

function defaultPlan(st: GameState): Decision {
  const need = feedNeeded(st);
  const feed = Math.min(st.grain, need);
  const afterFeed = st.grain - feed;
  const sow = Math.min(maxSow(st, 0), Math.floor(afterFeed * 0.85));
  return legalize(st, { buy: 0, sow, feed });
}

function startGame(
  seed: number,
  modeId: string,
  opts: { target: number | null; by: string | null; daily?: boolean },
): void {
  state = initGame(seed, modeId);
  plan = defaultPlan(state);
  sessionChallenge = { target: opts.target, by: opts.by };
  isDaily = !!opts.daily;
  selectedMode = state.modeId as ModeId;
  clearShareInUrl();
  play('year');
  renderPlay();
}

// Persistent references for the play screen
interface PlayRefs {
  grainV: HTMLElement;
  peopleV: HTMLElement;
  landV: HTMLElement;
  yearV: HTMLElement;
  grainStat: HTMLElement;
  peopleStat: HTMLElement;
  landStat: HTMLElement;
  decisions: HTMLElement;
  price: HTMLElement;
  track: HTMLElement;
  log: HTMLElement;
}
let refs!: PlayRefs;

function renderPlay(): void {
  setPlaying(true);
  clear(root);
  const mode = modeOf(state.modeId);

  const topbar = el('div', { class: 'topbar' }, [
    el('button', { class: 'icon-btn btn-ghost', title: 'Back to menu', 'aria-label': 'Back to menu', onclick: confirmQuit }, ['←']),
    el('span', { class: 'title' }, ['Grainfall']),
    el('span', { class: 'mode-chip' }, [mode.name + (isDaily ? ' · Daily' : '')]),
    el('span', { class: 'spacer' }, []),
    el('button', { class: 'icon-btn btn-ghost', title: 'How to play', 'aria-label': 'How to play', onclick: showHowTo }, ['?']),
    (() => {
      const b = el('button', { class: 'icon-btn btn-ghost', 'aria-label': 'Toggle sound', onclick: () => {
        const m = !sfx.muted();
        sfx.setMuted(m);
        store.set('muted', m);
        b.textContent = m ? '🔇' : '🔊';
      } }, [sfx.muted() ? '🔇' : '🔊']);
      return b;
    })(),
  ]);

  // HUD
  const mk = (cls: string, k: string, v: string) => {
    const val = el('span', { class: 'v' }, [v]);
    const stat = el('div', { class: `stat ${cls}` }, [el('span', { class: 'k' }, [k]), val]);
    return { stat, val };
  };
  const g = mk('grain', 'Grain', fmt(state.grain));
  const p = mk('people', 'People', fmt(state.people));
  const l = mk('land', 'Land', fmt(state.land));
  const y = mk('year', 'Year', `${state.year}/${mode.years}`);
  const hud = el('div', { class: 'hud' }, [g.stat, p.stat, l.stat, y.stat]);

  const track = el('div', { class: 'yeartrack' });
  const price = el('div', { class: 'price-banner' });
  const decisions = el('div', { class: 'decisions' });
  const log = el('div', { class: 'log' }, [el('div', { class: 'log-title' }, ['Chronicle'])]);

  refs = {
    grainV: g.val, peopleV: p.val, landV: l.val, yearV: y.val,
    grainStat: g.stat, peopleStat: p.stat, landStat: l.stat,
    decisions, price, track, log,
  };

  root.append(topbar, hud, track, price, decisions, log);

  renderYearTrack();
  renderPriceBanner();
  renderDecisions();
  if (state.history.length) renderLog(state.history[state.history.length - 1]);
}

function renderYearTrack(): void {
  const mode = modeOf(state.modeId);
  clear(refs.track);
  for (let i = 1; i <= mode.years; i++) {
    const cls = i < state.year ? 'pip done' : i === state.year ? 'pip now' : 'pip';
    refs.track.append(el('span', { class: cls }));
  }
}

function renderPriceBanner(): void {
  clear(refs.price);
  const price = state.rolls.price;
  let trend = '';
  let trendCls = '';
  const prev = state.history.length ? state.history[state.history.length - 1].price : null;
  if (prev != null) {
    if (price > prev) { trend = '▲ dearer'; trendCls = 'price-trend'; }
    else if (price < prev) { trend = '▼ cheaper'; trendCls = 'price-trend'; }
    else { trend = '— steady'; trendCls = 'price-trend'; }
  }
  refs.price.append(
    el('span', {}, ['Land trades at ']),
    el('b', {}, [String(price)]),
    el('span', {}, [' bushels/acre']),
    trend ? el('span', { class: trendCls, style: 'color:var(--ink-faint)' }, [' ' + trend]) : el('span', {}),
  );
}

function renderDecisions(): void {
  const st = state;
  const mode = modeOf(st.modeId);
  clear(refs.decisions);

  // --- Land ---
  const landVal = el('span', { class: 'dec-val' }, ['']);
  const landRange = el('input', { type: 'range', 'aria-label': 'Buy or sell land' }) as HTMLInputElement;
  const landNum = el('input', { type: 'number', class: 'dec-num', 'aria-label': 'Acres to trade' }) as HTMLInputElement;
  const landHint = el('div', { class: 'dec-hint' }, ['']);
  const landDec = el('div', { class: 'dec land' }, [
    el('div', { class: 'dec-head' }, [
      el('div', {}, [el('span', { class: 'dec-title' }, ['Land']), el('div', { class: 'dec-sub' }, ['Buy low, sell high'])]),
      landVal,
    ]),
    el('div', { class: 'dec-row' }, [
      stepBtn(() => setBuy(plan.buy - 10)),
      landRange,
      stepBtn(() => setBuy(plan.buy + 10), true),
      landNum,
    ]),
    landHint,
  ]);

  // --- Sow ---
  const sowVal = el('span', { class: 'dec-val' }, ['']);
  const sowRange = el('input', { type: 'range', 'aria-label': 'Acres to sow' }) as HTMLInputElement;
  const sowNum = el('input', { type: 'number', class: 'dec-num', 'aria-label': 'Acres to sow' }) as HTMLInputElement;
  const sowHint = el('div', { class: 'dec-hint' }, ['']);
  const sowDec = el('div', { class: 'dec' }, [
    el('div', { class: 'dec-head' }, [
      el('div', {}, [el('span', { class: 'dec-title' }, ['Sow']), el('div', { class: 'dec-sub' }, ['1 bushel seeds 1 acre · a farmer works 10'])]),
      sowVal,
    ]),
    el('div', { class: 'dec-row' }, [
      stepBtn(() => setSow(plan.sow - 20)),
      sowRange,
      stepBtn(() => setSow(plan.sow + 20), true),
      sowNum,
    ]),
    sowHint,
  ]);

  // --- Feed ---
  const feedVal = el('span', { class: 'dec-val' }, ['']);
  const feedRange = el('input', { type: 'range', 'aria-label': 'Bushels to feed the people' }) as HTMLInputElement;
  const feedNum = el('input', { type: 'number', class: 'dec-num', 'aria-label': 'Bushels to feed' }) as HTMLInputElement;
  const feedHint = el('div', { class: 'dec-hint' }, ['']);
  const feedDec = el('div', { class: 'dec' }, [
    el('div', { class: 'dec-head' }, [
      el('div', {}, [el('span', { class: 'dec-title' }, ['Feed']), el('div', { class: 'dec-sub' }, [`${mode.feedPerPerson} bushels feeds one person`])]),
      feedVal,
    ]),
    el('div', { class: 'dec-row' }, [
      stepBtn(() => setFeed(plan.feed - mode.feedPerPerson)),
      feedRange,
      stepBtn(() => setFeed(plan.feed + mode.feedPerPerson), true),
      feedNum,
    ]),
    feedHint,
  ]);

  const quick = el('div', { class: 'btn-row' }, [
    el('button', { class: 'btn-ghost', onclick: () => setFeed(feedNeeded(st)) }, ['Feed everyone']),
    el('button', { class: 'btn-ghost', onclick: () => setSow(maxSow(st, plan.buy)) }, ['Sow all fields']),
  ]);

  const granary = el('div', { class: 'granary-line' }, [
    el('span', {}, ['In the granary after your plan']),
    el('b', { id: 'carry' }, ['']),
  ]);
  const feeds = el('div', { class: 'granary-line' }, [
    el('span', { id: 'fedlabel' }, ['']),
    el('span', { id: 'fedwarn' }, ['']),
  ]);

  const sowBtn = el('button', { class: 'btn-primary sow-btn', id: 'sowbtn', onclick: sowYear }, ['Sow the year ▶']);

  refs.decisions.append(landDec, sowDec, feedDec, quick, granary, feeds, sowBtn);

  // wire inputs
  landRange.addEventListener('input', () => setBuy(parseInt(landRange.value || '0', 10)));
  landNum.addEventListener('change', () => setBuy(parseInt(landNum.value || '0', 10)));
  sowRange.addEventListener('input', () => setSow(parseInt(sowRange.value || '0', 10)));
  sowNum.addEventListener('change', () => setSow(parseInt(sowNum.value || '0', 10)));
  feedRange.addEventListener('input', () => setFeed(parseInt(feedRange.value || '0', 10)));
  feedNum.addEventListener('change', () => setFeed(parseInt(feedNum.value || '0', 10)));

  // store refs on the elements object for refresh
  Object.assign(decRefs, {
    landVal, landRange, landNum, landHint,
    sowVal, sowRange, sowNum, sowHint,
    feedVal, feedRange, feedNum, feedHint,
    carry: granary.querySelector('#carry') as HTMLElement,
    fedLabel: feeds.querySelector('#fedlabel') as HTMLElement,
    fedWarn: feeds.querySelector('#fedwarn') as HTMLElement,
    sowBtn,
  });

  refreshDecisions();

  function setBuy(v: number) { plan.buy = v; refreshDecisions(); play('slide'); }
  function setSow(v: number) { plan.sow = v; refreshDecisions(); play('slide'); }
  function setFeed(v: number) { plan.feed = v; refreshDecisions(); play('slide'); }

  function stepBtn(onclick: () => void, plus = false): HTMLButtonElement {
    return el('button', { class: 'step btn-ghost', onclick, 'aria-label': plus ? 'increase' : 'decrease' }, [plus ? '+' : '−']) as HTMLButtonElement;
  }
}

const decRefs: Record<string, HTMLInputElement | HTMLElement> = {};

function refreshDecisions(): void {
  const st = state;
  const mode = modeOf(st.modeId);
  const price = st.rolls.price;
  plan = legalize(st, plan);

  const grainAfterBuy = st.grain - plan.buy * price;
  const carry = grainAfterBuy - plan.sow - plan.feed;
  const need = feedNeeded(st);
  const fed = Math.min(st.people, Math.floor(plan.feed / mode.feedPerPerson));

  const r = decRefs as Record<string, HTMLInputElement & HTMLElement>;

  r.landRange.min = String(-st.land);
  r.landRange.max = String(maxBuy(st));
  r.landRange.value = String(plan.buy);
  r.landNum.value = String(plan.buy);
  r.landVal.textContent = plan.buy > 0 ? `Buy ${fmt(plan.buy)}` : plan.buy < 0 ? `Sell ${fmt(-plan.buy)}` : 'Hold';
  r.landHint.textContent =
    plan.buy > 0 ? `−${fmt(plan.buy * price)} bushels for ${fmt(plan.buy)} acres`
    : plan.buy < 0 ? `+${fmt(-plan.buy * price)} bushels from ${fmt(-plan.buy)} acres`
    : 'Keep your acres this year';

  r.sowRange.min = '0';
  r.sowRange.max = String(maxSow(st, plan.buy));
  r.sowRange.value = String(plan.sow);
  r.sowNum.value = String(plan.sow);
  r.sowVal.textContent = `${fmt(plan.sow)} acres`;
  r.sowHint.textContent = `${fmt(plan.sow)} bushels of seed → harvest at year's end`;

  r.feedRange.min = '0';
  r.feedRange.max = String(grainAfterBuy - plan.sow);
  r.feedRange.value = String(plan.feed);
  r.feedNum.value = String(plan.feed);
  r.feedVal.textContent = `${fmt(plan.feed)} bushels`;
  r.feedHint.textContent = plan.feed >= need
    ? `Enough for all ${fmt(st.people)}`
    : `Only ${fmt(need - plan.feed)} short of feeding everyone`;
  r.feedHint.className = 'dec-hint' + (plan.feed >= need ? '' : ' warn');

  r.carry.textContent = fmt(carry);
  r.carry.className = carry <= 0 ? 'neg' : 'ok';

  const starving = st.people - fed;
  r.fedLabel.textContent = `Feeds ${fmt(fed)} of ${fmt(st.people)} people`;
  if (starving <= 0) {
    r.fedWarn.textContent = '✓ all fed';
    (r.fedWarn as HTMLElement).style.color = 'var(--good)';
  } else if (starving / st.people > 0.45) {
    r.fedWarn.textContent = `⚠ ${fmt(starving)} starve — you'll be deposed`;
    (r.fedWarn as HTMLElement).style.color = 'var(--bad)';
  } else {
    r.fedWarn.textContent = `${fmt(starving)} will starve`;
    (r.fedWarn as HTMLElement).style.color = 'var(--warn)';
  }
}

function renderLog(result: YearResult): void {
  clear(refs.log);
  refs.log.append(el('div', { class: 'log-title' }, [`Year ${result.year}`]));
  result.events.forEach((line, i) => {
    const d = el('div', { class: 'log-line', style: `animation-delay:${i * 90}ms` }, [line]);
    refs.log.append(d);
  });
}

function sowYear(): void {
  if (resolving) return;
  resolving = true;
  const before = { grain: state.grain, people: state.people, land: state.land };
  const { state: next, result } = resolveYear(state, plan);

  // Juice: sounds + particles keyed to what happened.
  if (result.harvest > 0) {
    play('harvest');
    particles.burstEl(refs.grainStat, { count: 26, color: '#f6c968', up: true, spread: 90 });
    refs.grainStat.classList.add('flash');
  }
  if (result.settlers > 0) {
    setTimeout(() => { play('coin'); particles.burstEl(refs.peopleStat, { count: 14, color: '#58c6c0', up: true }); }, 260);
  }
  if (result.ratLoss > 0) {
    setTimeout(() => { play('rats'); particles.burstEl(refs.grainStat, { count: 18, color: '#6b5636' }); refs.grainStat.classList.add('shudder'); }, 380);
  }
  if (result.starved > 0) {
    setTimeout(() => { play('starve'); particles.burstEl(refs.peopleStat, { count: 16, color: '#8a785f' }); refs.peopleStat.classList.add('shudder'); }, 520);
  }
  if (result.plagueDead > 0) {
    setTimeout(() => { play('plague'); particles.burstEl(refs.peopleStat, { count: 20, color: '#9a8fa0' }); document.body.classList.add('shake'); setTimeout(() => document.body.classList.remove('shake'), 460); }, 640);
  }

  // Tween the HUD to the new numbers.
  tweenNumber(refs.grainV, before.grain, next.grain, 700);
  tweenNumber(refs.peopleV, before.people, next.people, 700);
  tweenNumber(refs.landV, before.land, next.land, 700);
  renderLog(result);
  setTimeout(() => {
    refs.grainStat.classList.remove('flash', 'shudder');
    refs.peopleStat.classList.remove('shudder');
  }, 800);

  state = next;

  if (next.over) {
    play(next.endReason === 'reign' ? 'reign' : 'fail');
    setTimeout(() => { resolving = false; renderResults(); }, 1500);
    return;
  }

  setTimeout(() => {
    play('year');
    plan = defaultPlan(state);
    refs.yearV.textContent = `${state.year}/${modeOf(state.modeId).years}`;
    renderYearTrack();
    renderPriceBanner();
    renderDecisions();
    resolving = false;
  }, 1200);
}

function confirmQuit(): void {
  openSheet((close) => el('div', {}, [
    el('h2', {}, ['Leave this reign?']),
    el('p', {}, ['Your progress this reign will be lost.']),
    el('div', { class: 'btn-row close-row' }, [
      el('button', { class: 'btn-ghost', onclick: close }, ['Keep ruling']),
      el('button', { class: 'btn-primary', onclick: () => { close(); renderMenu(); } }, ['Back to menu']),
    ]),
  ]));
}

// =====================================================================
// RESULTS
// =====================================================================
function renderResults(): void {
  setPlaying(false);
  clear(root);
  const st = state;
  const mode = modeOf(st.modeId);
  const s = standing(st);

  // Local best per mode.
  const bestKey = `best:${st.modeId}`;
  const prevBest = store.get<number>(bestKey, 0);
  const isBest = s.score > prevBest;
  if (isBest) store.set(bestKey, s.score);

  // Benchmark: how a masterful steward would have ruled this exact decade.
  const benchScore = benchmark(st.seed, st.modeId);

  const head = el('div', {}, [
    el('div', { class: 'result-title' }, [s.title]),
    el('p', { class: 'result-epitaph' }, [s.epitaph]),
    el('div', { class: 'score-big' }, [fmt(s.score)]),
    el('div', { class: 'score-cap' }, ['Standing']),
  ]);

  const bestLine = el('div', { class: 'best-line' }, [
    isBest ? `★ A new best for ${mode.name}!` : `Your best ${mode.name}: ${fmt(Math.max(prevBest, s.score))}`,
  ]);

  const rows: Node[] = [];
  if (sessionChallenge.target != null) {
    const beat = s.score >= sessionChallenge.target;
    rows.push(el('div', { class: 'target-line ' + (beat ? 'beat' : 'lost') }, [
      beat
        ? `You beat ${sessionChallenge.by ?? 'the challenger'} (${fmt(sessionChallenge.target)})!`
        : `${sessionChallenge.by ?? 'The challenger'} ruled better: ${fmt(sessionChallenge.target)} to your ${fmt(s.score)}.`,
    ]));
  }
  rows.push(el('div', { class: 'target-line' }, [
    `A masterful steward would have scored about ${fmt(benchScore)} on this decade.`,
  ]));

  const table = reignTable(st);

  const actions = el('div', {}, [
    el('button', { class: 'btn-primary sow-btn', onclick: () => startGame(newSeed(), st.modeId, { target: null, by: null }) }, ['Rule again']),
    el('div', { class: 'btn-row', style: 'margin-top:10px' }, [
      el('button', { class: 'btn-ghost', onclick: () => shareResult(st, s.score) }, ['Challenge a friend']),
      el('button', { class: 'btn-ghost', onclick: renderMenu }, ['Menu']),
    ]),
  ]);

  root.append(head, bestLine, ...rows, table, actions);
}

function reignTable(st: GameState): HTMLElement {
  const head = el('tr', {}, [
    el('th', {}, ['Yr']),
    el('th', {}, ['Price']),
    el('th', {}, ['Sown']),
    el('th', {}, ['Harvest']),
    el('th', {}, ['Starved']),
    el('th', {}, ['People']),
    el('th', {}, ['Grain']),
  ]);
  const body = st.history.map((h) =>
    el('tr', { class: h.starved > 0 || h.plagueDead > 0 ? 'dead' : '' }, [
      el('td', {}, [String(h.year)]),
      el('td', {}, [String(h.price)]),
      el('td', {}, [fmt(h.sow)]),
      el('td', {}, [fmt(h.harvest)]),
      el('td', {}, [fmt(h.starved + h.plagueDead)]),
      el('td', {}, [fmt(h.people)]),
      el('td', {}, [fmt(h.grain)]),
    ]),
  );
  return el('table', { class: 'reign-table' }, [el('thead', {}, [head]), el('tbody', {}, body)]);
}

function benchmark(seed: number, modeId: string): number {
  let s = initGame(seed, modeId);
  let guard = 0;
  while (!s.over && guard++ < 40) s = resolveYear(s, cautious(s)).state;
  return standing(s).score;
}

async function shareResult(st: GameState, score: number): Promise<void> {
  const name = store.get('name', '') as string;
  const url = buildChallengeUrl(st.seed, st.modeId, { score, by: name });
  const mode = modeOf(st.modeId);
  const res = await shareOrCopy(
    'Grainfall',
    `I scored ${fmt(score)} ruling the ${mode.name} reign in Grainfall. Play the identical decade and beat me:`,
    url,
  );
  if (res === 'copied') toast('Challenge link copied');
  else if (res === 'failed') toast('Could not share');
}

// =====================================================================
// MODALS
// =====================================================================
function showHowTo(): void {
  openSheet((close) => el('div', {}, [
    el('h2', {}, ['How to rule']),
    el('p', {}, ['You rule a city-state, one year at a time. Each year you split the grain in your granary three ways:']),
    el('ul', {}, [
      el('li', {}, [el('b', {}, ['Trade land']), ' at a price that swings every year — buy low, sell high.']),
      el('li', {}, [el('b', {}, ['Sow']), ' your fields — each acre needs a bushel of seed, and one person can work ten acres.']),
      el('li', {}, [el('b', {}, ['Feed']), ' your people — twenty bushels each, or they starve.']),
    ]),
    el('p', {}, ['Then the year rolls: the harvest lands, rats and plague may strike, and a well-fed city draws new settlers. Keep a cushion of grain for the bad years — a failed harvest with an empty granary is how reigns end. Lose more than 45% of your people to starvation in a single year and the city deposes you.']),
    el('p', {}, ['Survive your whole reign and history will judge the city you leave behind.']),
    el('div', { class: 'btn-row close-row' }, [el('button', { class: 'btn-primary', onclick: close }, ["Let's rule"])]),
  ]));
}

function showAbout(): void {
  openSheet((close) => el('div', {}, [
    el('h2', {}, ['About Grainfall']),
    el('p', {}, ['A cozy-but-tense economy game inspired by the classic 1968 city-management games — reimagined with original art, sound, and three distinct reigns.']),
    el('p', {}, ['Every reign is a deterministic function of its seed, so the Daily Reign and any challenge link play the identical decade for everyone — same weather, same prices, same rats. Nobody drew a luckier year.']),
    el('h3', {}, ['Multiplayer']),
    el('p', {}, ['There is no live connection and no server — "challenge a friend" just shares a seed. Your scores, settings, and bests live only in this browser. No cookies, no tracking, no accounts.']),
    el('p', { style: 'color:var(--ink-faint);font-size:0.85rem' }, ['Anonymous, cookie-less page-view counts via Cloudflare Web Analytics are the only network call.']),
    el('div', { class: 'btn-row close-row' }, [el('button', { class: 'btn-primary', onclick: close }, ['Close'])]),
  ]));
}

// =====================================================================
// Assets
// =====================================================================
function sheafSvg(): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('class', 'sheaf');
  svg.innerHTML =
    '<g stroke="#e0a94b" stroke-width="3" stroke-linecap="round" fill="none">' +
    '<path d="M32 58 V28"/>' +
    '<path d="M32 32 C22 30 18 22 19 14 C28 15 33 22 32 32"/>' +
    '<path d="M32 32 C42 30 46 22 45 14 C36 15 31 22 32 32"/>' +
    '<path d="M32 44 C22 42 18 34 19 26 C28 27 33 34 32 44"/>' +
    '<path d="M32 44 C42 42 46 34 45 26 C36 27 31 34 32 44"/>' +
    '</g><circle cx="32" cy="12" r="4" fill="#f6c968"/>';
  return svg;
}

// ---- Boot ----
renderMenu();
