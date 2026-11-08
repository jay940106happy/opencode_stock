const symbolResolver = require('../utils/symbolResolver');

const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com';

async function yahooRequest(endpoint, params = {}) {
    const url = new URL(`${YAHOO_BASE_URL}${endpoint}`);

    Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
    });

    const response = await fetch(url.toString(), {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    if (!response.ok) {
        throw new Error(`Yahoo API error: ${response.status}`);
    }

    return response.json();
}

async function getQuote(symbol) {
    const resolved = await symbolResolver.resolveSymbol(symbol);

    if (!resolved) {
        return {
            success: false,
            code: 'SYMBOL_NOT_FOUND',
            message: '查無此股票代號，請確認代號是否正確'
        };
    }

    const { symbol: fullSymbol, market } = resolved;

    try {
        const result = await yahooRequest(`/v8/finance/chart/${fullSymbol}`, {
            range: '1d',
            interval: '1d'
        });

        if (!result.chart?.result?.[0]) {
            return {
                success: false,
                message: '無法取得股價資料'
            };
        }

        const data = result.chart.result[0];
        const meta = data.meta || {};
        const quote = data.indicators?.quote?.[0] || {};
        const closePrices = quote.close || [];
        const lastIndex = closePrices.length - 1;
        const currentPrice = closePrices[lastIndex] || meta.regularMarketPrice;
        const previousClose = meta.chartPreviousClose || meta.previousClose;
        const change = currentPrice && previousClose ? currentPrice - previousClose : 0;
        const changePercent = currentPrice && previousClose ? (change / previousClose) * 100 : 0;

        return {
            success: true,
            data: {
                name: meta.shortName || meta.longName || symbol,
                market,
                symbol: fullSymbol,
                currency: meta.currency ?? null,
                instrumentType: meta.instrumentType ?? null,
                timestamp: toMilliseconds(meta.regularMarketTime ?? data.timestamp?.[lastIndex]),
                price: currentPrice,
                change,
                changePercent,
                previousClose,
                open: quote.open?.[lastIndex] || meta.regularMarketOpen,
                high: quote.high?.[lastIndex] || meta.regularMarketDayHigh,
                low: quote.low?.[lastIndex] || meta.regularMarketDayLow,
                volume: meta.regularMarketVolume ?? quote.volume?.[lastIndex] ?? null,
                fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || null,
                fiftyTwoWeekLow: meta.fiftyTwoWeekLow || null
            }
        };
    } catch (error) {
        console.error('[Quote] Error:', error.message);
        return {
            success: false,
            message: `取得股價資料失敗: ${error.message}`
        };
    }
}

async function getChart(symbol, range) {
    const resolved = await symbolResolver.resolveSymbol(symbol);

    if (!resolved) {
        return {
            success: false,
            code: 'SYMBOL_NOT_FOUND',
            message: '查無此股票代號，請確認代號是否正確'
        };
    }

    const { symbol: fullSymbol } = resolved;

    try {
        const result = await yahooRequest(`/v8/finance/chart/${fullSymbol}`, {
            range,
            interval: '1d',
            events: 'history'
        });

        if (!result.chart?.result?.length) {
            return {
                success: false,
                message: '無歷史股價資料'
            };
        }

        const chartData = result.chart.result[0];
        const timestamps = chartData.timestamp || [];
        const quote = chartData.indicators?.quote?.[0] || {};

        if (timestamps.length === 0) {
            return {
                success: false,
                message: '無歷史股價資料'
            };
        }

        const ohlc = timestamps.map((timestamp, index) => normalizeOhlcPoint({
            timestamp,
            open: quote.open?.[index],
            high: quote.high?.[index],
            low: quote.low?.[index],
            close: quote.close?.[index]
        })).filter(Boolean);

        const volume = timestamps.map((timestamp, index) => ({
            x: timestamp * 1000,
            y: quote.volume?.[index]
        })).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y) && point.y >= 0);

        if (ohlc.length === 0) {
            return { success: false, message: '無歷史股價資料' };
        }

        return {
            success: true,
            data: {
                ohlc,
                volume,
                symbol: fullSymbol,
                market: resolved.market,
                name: chartData.meta?.shortName || chartData.meta?.longName,
                instrumentType: chartData.meta?.instrumentType ?? null,
                regularSessionEnd: toMilliseconds(chartData.meta?.currentTradingPeriod?.regular?.end),
                range
            }
        };
    } catch (error) {
        console.error('[Chart] Error:', error.message);
        return {
            success: false,
            message: `取得圖表資料失敗: ${error.message}`
        };
    }
}

function toMilliseconds(seconds) {
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

function normalizeOhlcPoint({ timestamp, open, high, low, close }) {
    if (!Number.isFinite(timestamp) || !Number.isFinite(close)) {
        return null;
    }

    const o = Number.isFinite(open) ? open : close;
    const c = close;
    const h = Number.isFinite(high) ? high : Math.max(o, c);
    const l = Number.isFinite(low) ? low : Math.min(o, c);

    if (![o, h, l, c].every(Number.isFinite)) {
        return null;
    }

    return {
        x: timestamp * 1000,
        o,
        h: Math.max(h, o, c),
        l: Math.min(l, o, c),
        c
    };
}

module.exports = {
    getQuote,
    getChart
};
