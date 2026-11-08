const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getQuote, getChart } = require('../services/yahooService');

const date = Date.UTC(2026, 9, 23, 1) / 1000;
const end = Date.UTC(2026, 9, 23, 5, 30) / 1000;
const payload = {
    chart: {
        result: [{
            meta: {
                currency: 'TWD',
                instrumentType: 'ETF',
                regularMarketPrice: 81,
                regularMarketTime: end,
                chartPreviousClose: 80,
                currentTradingPeriod: { regular: { end } }
            },
            timestamp: [date, date + 86400, date + 172800],
            indicators: {
                quote: [{ open: [80, 80, 81], high: [82, 82, 83], low: [79, 79, 80],
                    close: [81, null, 81], volume: [0, 100, null] }]
            }
        }]
    }
};

test('preserves upstream quote metadata for the ETF card', async t => {
    t.mock.method(globalThis, 'fetch', async () => Response.json(payload));
    const quote = (await getQuote('0050')).data;
    assert.equal(quote.timestamp, end * 1000);
    assert.equal(quote.currency, 'TWD');
    assert.equal(quote.instrumentType, 'ETF');
});

test('history retains zero volume and avoids substituting a missing close', async t => {
    t.mock.method(globalThis, 'fetch', async () => Response.json(payload));
    const { data } = await getChart('0050', '5y');
    assert.equal(data.regularSessionEnd, end * 1000);
    assert.deepEqual(data.ohlc.map(point => point.x), [date * 1000, (date + 172800) * 1000]);
    assert.equal(data.volume[0].y, 0);
    assert.equal(data.volume.length, 2);
});

test('keeps an upstream outage distinct from an unknown symbol', async t => {
    const mock = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 429 }));
    await assert.rejects(getQuote('2330'), /429/);
    mock.mock.mockImplementation(async () => new Response(null, { status: 404 }));
    assert.equal((await getQuote('9999')).code, 'SYMBOL_NOT_FOUND');
});

test('resolves an OTC symbol after a listed-symbol miss', async t => {
    t.mock.method(globalThis, 'fetch', async input =>
        new URL(input).pathname.endsWith('.TWO') ? Response.json(payload) : new Response(null, { status: 404 }));
    const { data } = await getQuote('6488');
    assert.equal(data.symbol, '6488.TWO');
    assert.equal(data.market, '上櫃');
});
