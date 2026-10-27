import { api } from './api.js';
import {
  CATEGORIES, CURRENCIES, catOf, prefs, applyTheme, money, parseAmount, esc, pad,
  ymNow, isoToday, monthLabel, monthShort, dayLabel, enableNotifications, systemNotify,
} from './util.js';
import { dailyChart, historyChart } from './charts.js';

const $ = (selector, root = document) => root.querySelector(selector);
const view = $('#view');
const tabs = $('#tabs');

const state = {
  months: [],            // every saved month, newest first (summaries)
  currentYm: ymNow(),    // the real calendar month today
  viewYm: ymNow(),       // the month being looked at
  summary: null,         // full summary of viewYm (with categories)
  expenses: [],          // expenses of viewYm
  tab: 'home',
  filter: null,          // category being viewed in Expenses, or null for all
  pendingDelete: null,   // id of the expense waiting for delete confirmation
  loading: true,
  error: null,
};

const isCurrent = () => state.viewYm === state.currentYm;

// ------------------------------------------------------------------ icons
const svg = (d) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  left: svg('<path d="m15 6-6 6 6 6"/>'),
  right: svg('<path d="m9 6 6 6-6 6"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  trash: svg('<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10 11v5M14 11v5"/>'),
  sliders: svg('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
};

// ------------------------------------------------------------------- data
async function refresh() {
  state.currentYm = ymNow();
  try {
    state.months = await api.months();
    const exists = (ym) => state.months.some((m) => m.yearMonth === ym);
    if (!exists(state.viewYm) && state.viewYm !== state.currentYm) state.viewYm = state.currentYm;

    if (exists(state.viewYm)) {
      const [summary, expenses] = await Promise.all([api.month(state.viewYm), api.expenses(state.viewYm)]);
      state.summary = summary;
      state.expenses = expenses;
    } else {
      state.summary = null;
      state.expenses = [];
    }
    state.error = null;
  } catch (err) {
    state.error = err.message;
  }
  state.loading = false;
  render();
}

/** The previous (-1) or next (+1) month the user can step to, or null. */
function adjacentYm(dir) {
  const all = new Set(state.months.map((m) => m.yearMonth));
  all.add(state.currentYm);
  const sorted = [...all].sort();
  return sorted[sorted.indexOf(state.viewYm) + dir] || null;
}

// ----------------------------------------------------------------- render
function render() {
  if (state.loading) {
    tabs.hidden = true;
    view.innerHTML = '<div class="loading"><span class="spinner"></span>Loading your budget</div>';
    return;
  }
  if (state.error) {
    tabs.hidden = true;
    view.innerHTML = `<section class="setup"><div class="setup__brand">Pocketwise</div>
      <h1>Can't load your budget</h1><p class="setup__lede">${esc(state.error)}</p>
      <button class="btn btn--primary" data-action="retry">Try again</button></section>`;
    return;
  }
  if (!state.summary) {
    tabs.hidden = true;
    view.innerHTML = setupView();
    updateSetupHint();
    return;
  }

  tabs.hidden = false;
  const views = { home: homeView, expenses: expensesView, insights: insightsView, history: historyView };
  view.innerHTML = views[state.tab]();
  updateNav();
  animateMeters();
}

function updateNav() {
  tabs.querySelectorAll('.tab').forEach((btn) => {
    if (btn.dataset.tab === state.tab) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  $('#add-btn').setAttribute('aria-disabled', String(!isCurrent()));
}

/** Meters render at 0 and then grow, so the bar fills in when a screen opens. */
function animateMeters() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    view.querySelectorAll('[data-w]').forEach((el) => { el.style.width = `${el.dataset.w}%`; });
  }));
}

// ------------------------------------------------------------ shared bits
function monthSwitcher() {
  const prev = adjacentYm(-1);
  const next = adjacentYm(1);
  return `<div class="topbar">
    <div class="switcher">
      <button class="icon-btn" data-action="prev-month" aria-label="Previous month" ${prev ? '' : 'disabled'}>${ICON.left}</button>
      <h2>${monthLabel(state.viewYm)}</h2>
      <button class="icon-btn" data-action="next-month" aria-label="Next month" ${next ? '' : 'disabled'}>${ICON.right}</button>
    </div>
    <button class="icon-btn" data-action="open-settings" aria-label="Settings">${ICON.sliders}</button>
  </div>`;
}

function plainHeader(title, withSwitcher = true) {
  if (withSwitcher) return `<header class="page">${monthSwitcher()}<h1>${title}</h1></header>`;
  return `<header class="page"><div class="topbar"><h1 class="page__title">${title}</h1>
    <button class="icon-btn" data-action="open-settings" aria-label="Settings">${ICON.sliders}</button></div></header>`;
}

/** One expense: category, its note, amount, and (optionally) visible Edit / Delete buttons. */
function entryRow(e, { interactive = true, actions = false, showDate = false } = {}) {
  const c = catOf(e.category);
  if (state.pendingDelete === e.id) {
    return `<li class="entry"><div class="confirm">
      <p>Delete <strong>${money(e.amount)}</strong> for ${esc(e.category)}${e.note ? ` (${esc(e.note)})` : ''}?</p>
      <div class="confirm__btns">
        <button class="btn-sm" data-action="cancel-delete">Keep it</button>
        <button class="btn-sm btn-sm--danger" data-action="confirm-delete" data-id="${e.id}">Delete</button>
      </div></div></li>`;
  }
  const body = `<span class="chip-icon" style="--c:${c.color}">${c.icon}</span>
    <span class="row__main">
      <span class="row__title">${esc(e.category)}${showDate ? `<span class="row__date">${dayLabel(e.date)}</span>` : ''}</span>
      ${e.note ? `<span class="row__note">${esc(e.note)}</span>` : ''}
    </span>
    <span class="row__amt">${money(e.amount)}</span>`;
  const buttons = actions && interactive ? `<div class="row__actions">
      <button class="icon-btn icon-btn--sm" data-action="open-edit" data-id="${e.id}" aria-label="Edit ${esc(e.category)} expense">${ICON.edit}</button>
      <button class="icon-btn icon-btn--sm icon-btn--danger" data-action="ask-delete" data-id="${e.id}" aria-label="Delete ${esc(e.category)} expense">${ICON.trash}</button>
    </div>` : '';
  return `<li class="entry"><div class="row">
    ${interactive
      ? `<button class="row__body" data-action="open-edit" data-id="${e.id}">${body}</button>`
      : `<div class="row__body">${body}</div>`}
    ${buttons}
  </div></li>`;
}

const emptyExpenses = (cur) => `<div class="empty"><strong>No expenses yet</strong>
  ${cur ? 'Tap the + button to log your first one.' : 'Nothing was logged in this month.'}</div>`;

// ------------------------------------------------------------------- home
function homeView() {
  const s = state.summary;
  const cur = isCurrent();
  const level = s.alertLevel.toLowerCase();
  const over = s.remaining < 0;
  const days = `${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'}`;

  let note;
  if (!cur) note = "This month is closed, so it can't be changed.";
  else if (s.remaining > 0 && s.daysLeft > 0) note = `You can spend <strong>${money(s.safeToSpendPerDay)}</strong> a day for the next ${days}.`;
  else note = 'Your budget for this month is used up.';

  let banner = '';
  if (cur && level === 'warning') {
    banner = `<div class="banner banner--warning" role="alert"><div><strong>You've used ${Math.floor(s.percentUsed)}% of your budget</strong>
      Only ${money(s.remaining)} is left for ${days}.</div></div>`;
  } else if (cur && level === 'exceeded') {
    banner = `<div class="banner banner--exceeded" role="alert"><div><strong>${over ? "You're over budget" : 'Budget fully used'}</strong>
      ${over ? `You've spent ${money(-s.remaining)} more than planned.` : 'Any more spending will put you over.'}</div></div>`;
  }

  const recent = state.expenses.slice(0, 5);
  const negative = s.actualSavings < 0;

  return `
  <section class="hero hero--${level}">
    ${monthSwitcher()}
    <p class="hero__label">${over ? 'Over budget by' : 'Left to spend'}</p>
    <p class="hero__amount">${money(Math.abs(s.remaining))}</p>
    <div class="gauge" role="progressbar" aria-label="Budget used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(s.percentUsed)}">
      <div class="gauge__fill" style="width:0" data-w="${Math.min(100, s.percentUsed)}"></div>
      <span class="gauge__tick"></span><span class="gauge__tag">90% alert</span>
    </div>
    <div class="gauge__meta"><span>${money(s.spent)} spent</span><span>of ${money(s.budget)}</span></div>
    <p class="hero__note">${note}</p>
  </section>
  ${banner}

  <section class="block">
    <dl class="ledger">
      <div><dt>Salary</dt><dd>${money(s.salary)}</dd></div>
      <div><dt>Budget</dt><dd>${money(s.budget)}</dd></div>
      <div><dt>Spent</dt><dd>${money(s.spent)}</dd></div>
    </dl>
  </section>

  <section class="savings${negative ? ' savings--negative' : ''}">
    <h3>${cur ? 'Saved so far' : 'Saved'}</h3>
    <p class="savings__main">${money(s.actualSavings)}</p>
    <p class="savings__sub">${negative ? "You've spent more than your salary this month." : `Salary minus what you've spent${cur ? ' so far' : ''}.`}</p>
    <div class="savings__row"><span>Planned savings (salary − budget)</span><strong>${money(s.plannedSavings)}</strong></div>
  </section>

  <section class="block">
    <div class="block__head"><h3>Recent expenses</h3>
      ${state.expenses.length > 5 ? '<button class="link" data-action="see-all">See all</button>' : ''}</div>
    ${recent.length ? `<ul class="list">${recent.map((e) => entryRow(e, { interactive: cur, showDate: true })).join('')}</ul>` : emptyExpenses(cur)}
  </section>`;
}

// --------------------------------------------------------------- expenses
const cents = (n) => Math.round(Number(n) * 100);
const sumOf = (list) => list.reduce((sum, e) => sum + cents(e.amount), 0) / 100;
const entriesLabel = (n) => `${n} entr${n === 1 ? 'y' : 'ies'}`;

function expensesView() {
  const cur = isCurrent();
  const s = state.summary;
  if (state.filter && !s.categories.some((c) => c.category === state.filter)) state.filter = null;

  const list = state.filter ? state.expenses.filter((e) => e.category === state.filter) : state.expenses;
  const total = sumOf(list);

  const chips = [
    `<button class="filter" data-action="set-filter" data-cat="" aria-pressed="${!state.filter}">All <small>${money(s.spent)}</small></button>`,
    ...s.categories.map((c) => `<button class="filter" data-action="set-filter" data-cat="${esc(c.category)}"
      aria-pressed="${state.filter === c.category}"><span aria-hidden="true">${catOf(c.category).icon}</span>${esc(c.category)} <small>${money(c.total)}</small></button>`),
  ].join('');

  let summary;
  if (state.filter) {
    const meta = catOf(state.filter);
    const share = Number(s.spent) > 0 ? Math.round((total / Number(s.spent)) * 100) : 0;
    summary = `<div class="cat-summary" style="--c:${meta.color}">
      <span class="chip-icon">${meta.icon}</span>
      <div><p class="cat-summary__label">${esc(state.filter)} so far</p>
        <p class="cat-summary__total">${money(total)}</p>
        <p class="cat-summary__sub">${entriesLabel(list.length)}, ${share}% of this month's spending${cur ? '. New entries here add to this total.' : '.'}</p></div>
    </div>`;
  } else {
    summary = `<p class="page__sub">${entriesLabel(state.expenses.length)}, ${money(total)} in total${cur ? '. Edit or delete any of them with the icons.' : '.'}</p>`;
  }

  const groups = new Map();
  for (const e of list) {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date).push(e);
  }
  const body = [...groups].map(([date, items]) => `
    <div class="day"><span>${dayLabel(date)}</span><span>${money(sumOf(items))}</span></div>
    <ul class="list">${items.map((e) => entryRow(e, { interactive: cur, actions: cur })).join('')}</ul>`).join('');

  return `${plainHeader('Expenses')}
    <div class="filters" role="group" aria-label="Filter by category">${s.categories.length ? chips : ''}</div>
    <section class="block block--tight">
      ${summary}
      ${body || emptyExpenses(cur)}
    </section>`;
}

// --------------------------------------------------------------- insights
function insightsView() {
  const s = state.summary;
  const cats = s.categories;
  const total = Number(s.spent);

  const rows = cats.map((c) => {
    const meta = catOf(c.category);
    const share = total > 0 ? (Number(c.total) / total) * 100 : 0;
    const count = state.expenses.filter((e) => e.category === c.category).length;
    return `<li><button class="cat-row" data-action="filter-category" data-cat="${esc(c.category)}">
      <span class="cat-row__top">
        <span class="chip-icon" style="--c:${meta.color}">${meta.icon}</span>
        <span class="row__main"><span class="row__title">${esc(c.category)}</span>
          <span class="row__sub">${entriesLabel(count)}, ${Math.round(share)}% of spending</span></span>
        <span class="row__amt">${money(c.total)}</span>
        <span class="chev" aria-hidden="true">${ICON.right}</span>
      </span>
      <span class="meter"><i style="--c:${meta.color};width:0" data-w="${share.toFixed(1)}"></i></span>
    </button></li>`;
  }).join('');

  const top = cats[0];
  const lede = top
    ? `${esc(top.category)} is your biggest category at ${money(top.total)}. Tap a category to see its entries.`
    : 'Add a few expenses to see where your money goes.';

  return `${plainHeader('Insights')}
    <section class="block block--tight">
      <p class="page__sub">${lede}</p>
      ${cats.length ? `<ul class="list">${rows}</ul>` : emptyExpenses(isCurrent())}
    </section>
    ${cats.length ? `<section class="block">
      <div class="block__head"><h3>Day by day</h3></div>
      ${dailyChart(state.expenses, state.viewYm, Number(s.budget))}
      <p class="legend"><span class="swatch"></span>Within daily budget
        <span class="swatch swatch--over"></span>Above it</p>
    </section>` : ''}`;
}

// ---------------------------------------------------------------- history
function historyView() {
  const ms = state.months;
  const savedTotal = ms.reduce((sum, m) => sum + Number(m.actualSavings), 0);

  const rows = ms.map((m) => {
    const live = m.yearMonth === state.currentYm;
    const overBudget = Number(m.spent) > Number(m.budget);
    const chip = live ? '<span class="tag-chip tag-chip--live">In progress</span>'
      : overBudget ? '<span class="tag-chip tag-chip--over">Over budget</span>'
      : '<span class="tag-chip">Within budget</span>';
    return `<li><button class="month-row" data-action="open-month" data-ym="${m.yearMonth}">
      <span class="month-row__top"><strong>${monthLabel(m.yearMonth)}</strong>${chip}</span>
      <span class="meter meter--sm"><i class="${overBudget ? 'is-over' : ''}" style="width:0" data-w="${Math.min(100, m.percentUsed)}"></i></span>
      <span class="month-row__meta"><span>${money(m.spent)} of ${money(m.budget)}</span>
        <span>Saved ${money(m.actualSavings)}</span></span>
    </button></li>`;
  }).join('');

  return `${plainHeader('History', false)}
    <section class="block block--tight">
      <p class="page__sub">${ms.length} month${ms.length === 1 ? '' : 's'} tracked. You've saved <strong>${money(savedTotal)}</strong> across all of them.</p>
      ${ms.length > 1 ? `${historyChart(ms)}
        <p class="legend"><span class="swatch swatch--budget"></span>Budget <span class="swatch"></span>Spent
          <span class="swatch swatch--over"></span>Spent over budget</p>` : ''}
    </section>
    <section class="block"><ul class="list">${rows}</ul></section>`;
}

// ------------------------------------------------------------------ setup
function setupView() {
  const last = state.months[0];
  const first = !last;
  return `<section class="setup">
    <div class="setup__brand">Pocketwise</div>
    <h1>${first ? 'Set up your first month' : `Start ${monthLabel(state.currentYm)}`}</h1>
    <p class="setup__lede">${first
      ? 'Tell us what comes in and what you plan to spend. We track the rest.'
      : `A new month has begun. ${monthLabel(last.yearMonth)} is saved in History. Your numbers from last month are filled in.`}</p>
    <form id="setup-form" novalidate>
      <label class="field"><span>Monthly salary or allowance</span>
        <div class="input-money"><b>${prefs.currency}</b>
          <input name="salary" inputmode="decimal" autocomplete="off" placeholder="0" value="${last ? Number(last.salary) : ''}"></div></label>
      <label class="field"><span>Budget for this month</span>
        <div class="input-money"><b>${prefs.currency}</b>
          <input name="budget" inputmode="decimal" autocomplete="off" placeholder="0" value="${last ? Number(last.budget) : ''}"></div></label>
      <p class="hint" id="setup-hint"></p>
      <p class="form-error" id="form-error" role="alert"></p>
      <button class="btn btn--primary" type="submit">${first ? 'Start tracking' : `Start ${monthShort(state.currentYm)}`}</button>
      ${last ? `<button class="btn btn--ghost" type="button" data-action="skip-setup">View ${monthLabel(last.yearMonth)} instead</button>` : ''}
    </form>
  </section>`;
}

function updateSetupHint() {
  const form = $('#setup-form');
  const hint = $('#setup-hint');
  if (!form || !hint) return;
  const salary = parseAmount(form.elements.salary.value);
  const budget = parseAmount(form.elements.budget.value);
  if (Number.isNaN(salary) || Number.isNaN(budget) || budget <= 0) { hint.textContent = ''; hint.className = 'hint'; return; }
  if (budget > salary) {
    hint.textContent = "Your budget is higher than your salary, so you'd spend more than you earn.";
    hint.className = 'hint hint--warn';
  } else {
    hint.textContent = `If you stay within budget, you'll save at least ${money(salary - budget)}.`;
    hint.className = 'hint hint--good';
  }
}

// ----------------------------------------------------------------- sheets
function openSheet(html, onMount) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="sheet-backdrop" data-action="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true"><div class="sheet__handle"></div>${html}</div>`;
  root.classList.add('open');
  document.body.classList.add('no-scroll');
  if (onMount) onMount($('.sheet', root));
}

function closeSheet() {
  const root = $('#sheet-root');
  root.innerHTML = '';
  root.classList.remove('open');
  document.body.classList.remove('no-scroll');
}

function openExpenseSheet(expense = null) {
  const ym = state.viewYm;
  const [y, m] = ym.split('-').map(Number);
  const min = `${ym}-01`;
  const max = `${ym}-${pad(new Date(y, m, 0).getDate())}`;
  const today = isoToday();
  const date = expense?.date || (today >= min && today <= max ? today : max);
  const picked = expense?.category || state.filter || CATEGORIES[0].name;
  const editing = Boolean(expense);

  openSheet(`
    <h3>${editing ? 'Edit expense' : 'Add expense'}</h3>
    <form id="expense-form" novalidate data-id="${expense?.id ?? ''}">
      <label class="amount"><span class="sr-only">Amount</span><b>${prefs.currency}</b>
        <input name="amount" inputmode="decimal" autocomplete="off" placeholder="0" value="${expense ? Number(expense.amount) : ''}"></label>
      <fieldset class="cats"><legend class="sr-only">Category</legend>
        ${CATEGORIES.map((c) => `<label class="cat"><input type="radio" name="category" value="${c.name}" ${c.name === picked ? 'checked' : ''}>
          <span><i class="chip-icon" style="--c:${c.color}">${c.icon}</i>${c.name}</span></label>`).join('')}
      </fieldset>
      <div class="row-fields">
        <label class="field"><span>Date</span><input type="date" name="date" min="${min}" max="${max}" value="${date}"></label>
        <label class="field"><span>Note (optional)</span><input name="note" maxlength="120" placeholder="Lunch with friends" value="${esc(expense?.note || '')}"></label>
      </div>
      <p class="form-error" id="form-error" role="alert"></p>
      <button class="btn btn--primary" type="submit">${editing ? 'Save changes' : 'Add expense'}</button>
      ${editing ? '<button class="btn btn--danger" type="button" data-action="delete-expense">Delete expense</button>' : ''}
    </form>`, (sheet) => { if (!editing) sheet.querySelector('input[name="amount"]').focus(); });
}

function openSettings() {
  const cur = state.months.find((m) => m.yearMonth === state.currentYm);
  openSheet(`
    <h3>Settings</h3>
    ${cur ? `<form id="month-form" class="sec" novalidate>
      <h4>${monthLabel(state.currentYm)}</h4>
      <div class="row-fields row-fields--even">
        <label class="field"><span>Salary</span><input name="salary" inputmode="decimal" autocomplete="off" value="${Number(cur.salary)}"></label>
        <label class="field"><span>Budget</span><input name="budget" inputmode="decimal" autocomplete="off" value="${Number(cur.budget)}"></label>
      </div>
      <p class="form-error" id="form-error" role="alert"></p>
      <button class="btn btn--primary" type="submit">Update this month</button>
    </form>` : ''}
    <div class="sec"><h4>Currency</h4>
      <label class="field"><select id="currency-select" aria-label="Currency">
        ${CURRENCIES.map((c) => `<option value="${c}" ${c === prefs.currency ? 'selected' : ''}>${c}</option>`).join('')}
      </select></label></div>
    <div class="sec"><h4>Appearance</h4>
      <div class="seg" role="radiogroup" aria-label="Theme">
        ${[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([v, label]) =>
          `<label><input type="radio" name="theme" value="${v}" ${prefs.theme === v ? 'checked' : ''}><span>${label}</span></label>`).join('')}
      </div></div>
    <div class="sec"><h4>Alerts</h4>
      <div class="switch-row"><p>Get a phone notification when you reach 90% and 100% of your budget. Warnings inside the app always show.</p>
        <button class="pill-btn" data-action="toggle-notify" aria-pressed="${prefs.notify}">${prefs.notify ? 'On' : 'Off'}</button></div></div>
    <div class="sec"><h4>Your data</h4>
      <a class="btn btn--outline" href="${api.exportUrl}" download>Export all expenses (CSV)</a></div>
    <button class="btn btn--ghost" data-action="close-sheet">Close</button>`);
}

function openAlert(level, s, entry = null, verb = 'Added') {
  const exceeded = level === 'EXCEEDED';
  const days = `${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'}`;
  const title = exceeded
    ? (s.remaining < 0 ? "You're over budget" : 'Budget fully used')
    : `You've used ${Math.floor(s.percentUsed)}% of your budget`;
  const body = exceeded
    ? (s.remaining < 0 ? `You've spent ${money(-s.remaining)} more than you planned for ${monthLabel(s.yearMonth)}.` : 'There is nothing left in this month\'s budget.')
    : `Only ${money(s.remaining)} is left for ${days}. Try to keep it under ${money(s.safeToSpendPerDay)} a day.`;

  const justNow = entry ? `${verb} ${money(entry.amount)} for ${entry.category}.` : '';
  systemNotify(title, `${justNow} ${body}`.trim());
  openSheet(`<div class="alert-sheet">
    <div class="alert-dot${exceeded ? ' alert-dot--bad' : ''}" aria-hidden="true">!</div>
    <h3>${title}</h3>${justNow ? `<p class="alert-sheet__entry">${esc(justNow)}</p>` : ''}<p>${body}</p>
    <button class="btn btn--primary" data-action="close-sheet">Got it</button></div>`);
}

// ----------------------------------------------------------------- toast
let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ---------------------------------------------------------------- actions
function showError(message) {
  const el = $('#form-error');
  if (el) el.textContent = message;
}

async function submitSetup(form) {
  const salary = parseAmount(form.elements.salary.value);
  const budget = parseAmount(form.elements.budget.value);
  if (Number.isNaN(salary)) return showError('Enter your salary as a number, like 15000.');
  if (Number.isNaN(budget) || budget <= 0) return showError('Enter a budget greater than zero.');
  try {
    await api.saveMonth(state.currentYm, { salary, budget });
    state.viewYm = state.currentYm;
    state.tab = 'home';
    await refresh();
    toast(`${monthLabel(state.currentYm)} is ready`);
  } catch (err) { showError(err.message); }
}

async function submitMonthSettings(form) {
  const salary = parseAmount(form.elements.salary.value);
  const budget = parseAmount(form.elements.budget.value);
  if (Number.isNaN(salary)) return showError('Enter your salary as a number.');
  if (Number.isNaN(budget) || budget <= 0) return showError('Enter a budget greater than zero.');
  try {
    const result = await api.saveMonth(state.currentYm, { salary, budget });
    closeSheet();
    await refresh();
    toast('Month updated');
    if (result.alert) openAlert(result.alert, result.summary);
  } catch (err) { showError(err.message); }
}

async function submitExpense(form) {
  const amount = parseAmount(form.elements.amount.value);
  if (Number.isNaN(amount) || amount <= 0) return showError('Enter an amount greater than zero.');
  const body = {
    amount,
    category: form.elements.category.value,
    note: form.elements.note.value.trim(),
    date: form.elements.date.value,
  };
  if (!body.date) return showError('Pick a date.');
  const id = form.dataset.id;
  try {
    const result = id ? await api.updateExpense(id, body) : await api.addExpense(state.viewYm, body);
    closeSheet();
    await refresh();
    toast(id ? 'Changes saved' : 'Expense added');
    if (result.alert) openAlert(result.alert, result.summary, result.expense, id ? 'Updated' : 'Added');
  } catch (err) { showError(err.message); }
}

async function deleteExpense(id) {
  try {
    await api.deleteExpense(id);
    closeSheet();
    await refresh();
    toast('Expense deleted');
  } catch (err) { showError(err.message); }
}

async function goToMonth(ym) {
  if (!ym) return;
  state.viewYm = ym;
  state.filter = null;
  state.pendingDelete = null;
  await refresh();
}

// ----------------------------------------------------------------- events
document.addEventListener('click', async (event) => {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  const { action } = el.dataset;

  switch (action) {
    case 'tab':
      state.tab = el.dataset.tab;
      state.pendingDelete = null;
      render();
      window.scrollTo({ top: 0 });
      break;
    case 'prev-month': await goToMonth(adjacentYm(-1)); break;
    case 'next-month': await goToMonth(adjacentYm(1)); break;
    case 'open-month':
      state.tab = 'home';
      await goToMonth(el.dataset.ym);
      window.scrollTo({ top: 0 });
      break;
    case 'see-all': state.tab = 'expenses'; render(); window.scrollTo({ top: 0 }); break;
    case 'open-add':
      if (!isCurrent()) toast('Past months are read-only. Go to this month to add expenses.');
      else openExpenseSheet();
      break;
    case 'open-edit': {
      const expense = state.expenses.find((e) => String(e.id) === el.dataset.id);
      if (expense) openExpenseSheet(expense);
      break;
    }
    case 'delete-expense':
      if (!el.dataset.armed) {
        el.dataset.armed = '1';
        el.textContent = 'Tap again to delete';
      } else {
        await deleteExpense($('#expense-form').dataset.id);
      }
      break;
    case 'filter-category':
      state.filter = el.dataset.cat;
      state.tab = 'expenses';
      render();
      window.scrollTo({ top: 0 });
      break;
    case 'set-filter': {
      const scrolled = $('.filters')?.scrollLeft || 0;
      state.filter = el.dataset.cat || null;
      state.pendingDelete = null;
      render();
      const bar = $('.filters');
      if (bar) bar.scrollLeft = scrolled;
      break;
    }
    case 'ask-delete': state.pendingDelete = Number(el.dataset.id); render(); break;
    case 'cancel-delete': state.pendingDelete = null; render(); break;
    case 'confirm-delete':
      state.pendingDelete = null;
      try {
        await api.deleteExpense(el.dataset.id);
        await refresh();
        toast('Expense deleted');
      } catch (err) { toast(err.message); render(); }
      break;
    case 'open-settings': openSettings(); break;
    case 'close-sheet': closeSheet(); break;
    case 'toggle-notify': {
      const turnOn = !prefs.notify;
      let on = false;
      if (turnOn) {
        on = await enableNotifications();
        if (!on) toast("Notifications are blocked. Allow them in your browser or phone settings.");
      } else {
        prefs.notify = false;
      }
      el.textContent = on ? 'On' : 'Off';
      el.setAttribute('aria-pressed', String(on));
      break;
    }
    case 'skip-setup': await goToMonth(state.months[0].yearMonth); break;
    case 'retry':
      state.loading = true;
      render();
      await refresh();
      break;
    default:
  }
});

document.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.id === 'setup-form') submitSetup(form);
  else if (form.id === 'month-form') submitMonthSettings(form);
  else if (form.id === 'expense-form') submitExpense(form);
});

document.addEventListener('input', (event) => {
  if (event.target.form?.id === 'setup-form') updateSetupHint();
});

document.addEventListener('change', (event) => {
  const el = event.target;
  if (el.id === 'currency-select') {
    prefs.currency = el.value;
    render();
  } else if (el.name === 'theme') {
    prefs.theme = el.value;
    applyTheme();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSheet();
});

// ------------------------------------------------------------------ start
applyTheme();
render();
refresh();