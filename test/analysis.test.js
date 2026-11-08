const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const context = vm.createContext({
    document: {
        getElementById: () => ({ addEventListener() {} }),
        querySelectorAll: () => []
    }
});
vm.runInContext(app, context);

const bars = Array.from({ length: 25 }, (_, index) => ({
    x: Date.UTC(2026, 9, index + 1, 1),
    o: 100 + index,
    h: 101 + index,
    l: 99 + index,
    c: 100 + index
}));
const volume = bars.map(({ x }, index) => ({ x, y: index === 23 ? 200 : 100 }));
const sessionEnd = Date.UTC(2026, 9, 25, 5, 30);

function summarize(ohlc, chartVolume, now, regularSessionEnd = sessionEnd) {
    const data = { ohlc, volume: chartVolume, regularSessionEnd };
    return context.buildRecentSummary(data, context.buildIndicatorSeries(ohlc), now);
}

test('uses the last completed session and the preceding 20 sessions for volume', () => {
    const summary = summarize(bars, volume, Date.UTC(2026, 9, 25, 4));
    assert.equal(summary.date, '2026-10-24');
    assert.equal(summary.change5.toFixed(2), '4.24');
    assert.equal(summary.change20.toFixed(2), '19.42');
    assert.equal(summary.ma20Distance.toFixed(2), '8.37');
    assert.equal(summary.volumeRatio, 2);
    assert.equal(summary.rsi14, 100);
    assert.equal(summary.atr14, 2);
});

test('includes the current Taipei session after the reported close', () => {
    const summary = summarize(bars, volume, sessionEnd);
    assert.equal(summary.date, '2026-10-25');
});

test('leaves incomplete metrics unset for a short history', () => {
    const summary = summarize(bars.slice(0, 3), volume.slice(0, 3), sessionEnd);
    assert.equal(summary.date, '2026-10-03');
    for (const metric of ['change5', 'change20', 'ma20Distance', 'volumeRatio', 'rsi14', 'atr14']) {
        assert.equal(summary[metric], null, metric);
    }
});

test('distinguishes zero volume from a missing observation in the lookback', () => {
    const zeroVolume = volume.map((point, i) => i === 24 ? { ...point, y: 0 } : point);
    assert.equal(summarize(bars, zeroVolume, sessionEnd).volumeRatio, 0);
    assert.equal(summarize(bars, zeroVolume.filter((_, i) => i !== 20), sessionEnd).volumeRatio, null);
});

test('does not assume a same-day bar is complete without a session end', () => {
    const summary = summarize(bars, volume, Date.UTC(2026, 9, 25, 10), null);
    assert.equal(summary.date, '2026-10-24');
});

test('52-week range excludes older prices and the current incomplete session', () => {
    const ohlc = [
        { x: Date.UTC(2025, 9, 21, 1), h: 300, l: 20, c: 150 },
        { x: Date.UTC(2025, 9, 25, 1), h: 180, l: 100, c: 160 },
        { x: Date.UTC(2026, 9, 22, 1), h: 200, l: 150, c: 165 },
        { x: Date.UTC(2026, 9, 23, 1), h: 170, l: 140, c: 160 },
        { x: Date.UTC(2026, 9, 26, 1), h: 300, l: 30, c: 270 }
    ];
    const range = context.buildYearRange({ ohlc, regularSessionEnd: Date.UTC(2026, 9, 26, 5, 30) },
        Date.UTC(2026, 9, 26, 4));
    assert.equal(range.date, '2026-10-23');
    assert.equal(range.low, 100);
    assert.equal(range.high, 200);
    assert.equal(range.close, 160);
    assert.equal(range.position, 60);
    assert.equal(range.distanceFromHigh.toFixed(2), '-20.00');
});

test('does not label a short history as a 52-week range', () => {
    assert.equal(context.buildYearRange({ ohlc: bars }, Date.UTC(2026, 9, 26)), null);
});

test('flat 52-week ranges have no percentage position', () => {
    const ohlc = [
        { x: Date.UTC(2025, 9, 20, 1), h: 100, l: 100, c: 100 },
        { x: Date.UTC(2026, 9, 22, 1), h: 100, l: 100, c: 100 }
    ];
    const range = context.buildYearRange({ ohlc }, Date.UTC(2026, 9, 26));
    assert.equal(range.position, null);
    assert.equal(range.distanceFromHigh, 0);
});

test('CSV exports the visible dates with aligned indicators and blank missing observations', () => {
    const dates = [
        { x: Date.UTC(2026, 9, 21, 17), o: 110, h: 115, l: 105, c: 113 },
        { x: Date.UTC(2026, 9, 23, 1), o: 114, h: 118, l: 111, c: 116 }
    ];
    const day2 = dates[1].x;
    const indicators = {
        ma5: [{ x: day2, y: 110.2 }], ma10: [], ma20: [], ma60: [],
        atr14: [], rsi14: [{ x: day2, y: 0 }],
        macd: { macd: [], signal: [], histogram: [] }, kdj: { k: [], d: [], j: [] }
    };
    const csv = context.buildChartCsv({ ohlc: dates, volume: [{ x: day2, y: 0 }] }, indicators);
    const [head, first, second] = csv.split('\r\n');
    assert.ok(head.startsWith('\uFEFF日期,開盤,最高,最低,收盤,成交量(股)'));
    assert.equal(head.split(',').length, 18);
    const firstRow = first.split(',');
    const secondRow = second.split(',');
    assert.equal(firstRow.length, 18);
    assert.equal(secondRow.length, 18);
    assert.deepEqual(firstRow.slice(0, 7), ['2026-10-22', '110', '115', '105', '113', '', '']);
    assert.deepEqual(secondRow.slice(0, 7), ['2026-10-23', '114', '118', '111', '116', '0', '110.2']);
    assert.equal(secondRow[11], '0');
});
