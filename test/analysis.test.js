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
