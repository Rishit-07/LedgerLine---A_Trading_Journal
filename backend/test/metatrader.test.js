import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReport, toTrade, number, serverTime } from '../src/metatrader-parse.js';

const mt5 = `<html><body>Account: 5012345<table>
<tr><th>Time</th><th>Position</th><th>Symbol</th><th>Type</th><th>Volume</th><th>Price</th><th>S / L</th><th>T / P</th><th>Time</th><th>Price</th><th>Commission</th><th>Swap</th><th>Profit</th></tr>
<tr><td>2026.11.02 09:15:00</td><td>7001</td><td>EURUSD</td><td>buy</td><td>0.10</td><td>1.1000</td><td>1.0950</td><td>1.1100</td><td>2026.11.02 11:00:00</td><td>1.1100</td><td>-0.70</td><td>0</td><td>100.00</td></tr>
<tr><td>2026.11.03 09:15:00</td><td>7002</td><td>XAUUSD</td><td>sell</td><td>1.00</td><td>2,000.00</td><td>0.00</td><td>0.00</td><td>2026.11.03 12:00:00</td><td>1,990.00</td><td>0</td><td>0</td><td>10</td></tr>
<tr><td>2026.11.04 09:15:00</td><td>7003</td><td>GBPUSD</td><td>sell</td><td>0.10</td><td>1.3000</td><td>1.3050</td><td>0</td><td>2026.11.04 10:00:00</td><td>1.3050</td><td>0</td><td>0</td><td>-50</td></tr>
<tr><td>2026.11.05 00:00:00</td><td>1</td><td>balance</td><td>balance</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td>1000</td></tr>
</table></body></html>`;

test('MT5 HTML report: R from stop, skips no-stop and balance rows', () => {
  const r = parseReport(mt5);
  assert.equal(r.found, 3); assert.equal(r.trades.length, 2); assert.equal(r.skipped.length, 1);
  assert.equal(r.trades[0].ref, 'mt:5012345:7001'); assert.equal(r.trades[0].result, 2); assert.equal(r.trades[0].side, 'long');
  assert.equal(r.trades[1].result, -1); assert.equal(r.trades[1].side, 'short');
  assert.match(r.skipped[0].reason, /No stop loss/);
});

test('MT4 CSV layout with semicolons', () => {
  const csv = 'Ticket;Open Time;Type;Size;Item;Price;S / L;T / P;Close Time;Price;Commission;Taxes;Swap;Profit\n9001;2026.11.02 09:00;buy;0.5;BTCUSD;100;90;0;2026.11.02 10:00;120;0;0;0;5';
  const r = parseReport(csv);
  assert.equal(r.trades[0].market, 'crypto'); assert.equal(r.trades[0].result, 2);
});

test('rejects unrelated files, empties and oversize', () => {
  assert.ok(parseReport('hello').error); assert.ok(parseReport('').error);
  assert.ok(parseReport('x'.repeat(1_600_000)).error);
});

test('stop moved past entry is skipped, never guessed', () => {
  const t = toTrade({ ticket: '1', symbol: 'EURUSD', type: 'buy', openedAt: new Date(0), closedAt: new Date(1), entry: 1, exit: 1.2, stop: 1.1 });
  assert.ok(t.skip);
});

test('number and time helpers', () => {
  assert.equal(number('1 234.50'), 1234.5); assert.equal(number('1,5'), 1.5); assert.ok(Number.isNaN(number('abc')));
  assert.equal(serverTime('2026.11.02 09:15:00').toISOString(), '2026-11-02T09:15:00.000Z'); assert.equal(serverTime('nope'), null);
});
