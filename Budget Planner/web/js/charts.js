// Small hand-written SVG charts. No libraries, so they work offline inside the APK.
import { monthShort } from './util.js';

const W = 340;

/** Spending per day of the month, with a dashed line for the daily budget. */
export function dailyChart(expenses, ym, budget) {
  const [y, m] = ym.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const totals = Array(days).fill(0);
  for (const e of expenses) totals[Number(e.date.slice(8, 10)) - 1] += Number(e.amount);

  const pace = budget / days;
  const H = 160, padX = 6, padT = 16, padB = 22;
  const max = Math.max(...totals, pace * 1.3, 1);
  const bw = (W - padX * 2) / days;
  const yOf = (v) => padT + (H - padT - padB) * (1 - v / max);

  const bars = totals.map((t, i) => {
    if (t <= 0) return '';
    const top = yOf(t);
    return `<rect class="bar${t > pace ? ' bar--over' : ''}" x="${(padX + i * bw + bw * 0.15).toFixed(1)}" y="${top.toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${(H - padB - top).toFixed(1)}" rx="2"/>`;
  }).join('');

  const ticks = [1, 8, 15, 22, days].filter((d, i, a) => a.indexOf(d) === i)
    .map((d) => `<text class="axis" x="${(padX + (d - 0.5) * bw).toFixed(1)}" y="${H - 6}" text-anchor="middle">${d}</text>`).join('');

  const py = yOf(pace).toFixed(1);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Spending for each day of the month">
    <line class="axis-line" x1="${padX}" x2="${W - padX}" y1="${H - padB}" y2="${H - padB}"/>
    ${bars}
    <line class="pace" x1="${padX}" x2="${W - padX}" y1="${py}" y2="${py}"/>
    <text class="tag" x="${W - padX}" y="${Number(py) - 5}" text-anchor="end">daily budget</text>
    ${ticks}
  </svg>`;
}

/** Budget vs spent for the most recent months (up to six). */
export function historyChart(months) {
  const list = months.slice(0, 6).reverse();
  const H = 180, padT = 10, padB = 24;
  const max = Math.max(...list.flatMap((m) => [Number(m.budget), Number(m.spent)]), 1);
  const group = (W - 12) / list.length;
  const bw = Math.min(24, group * 0.3);
  const yOf = (v) => padT + (H - padT - padB) * (1 - v / max);

  const groups = list.map((m, i) => {
    const cx = 6 + group * i + group / 2;
    const budgetTop = yOf(Number(m.budget));
    const spentTop = yOf(Number(m.spent));
    const over = Number(m.spent) > Number(m.budget);
    return `
      <rect class="bar bar--budget" x="${(cx - bw - 2).toFixed(1)}" y="${budgetTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - padB - budgetTop).toFixed(1)}" rx="4"/>
      <rect class="bar${over ? ' bar--over' : ''}" x="${(cx + 2).toFixed(1)}" y="${spentTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(H - padB - spentTop, 0).toFixed(1)}" rx="4"/>
      <text class="axis" x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle">${monthShort(m.yearMonth)}</text>`;
  }).join('');

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Budget and spending for recent months">
    <line class="axis-line" x1="6" x2="${W - 6}" y1="${H - padB}" y2="${H - padB}"/>
    ${groups}
  </svg>`;
}
