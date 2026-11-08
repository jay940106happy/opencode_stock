let currentRange = '6mo';
let searchRequestId = 0;
let currentChartData = null;
let candlestickChart = null;
let volumeChart = null;
let atrChart = null;
let rsiChart = null;
let macdChart = null;
let kdjChart = null;
let latestIndicatorData = null;

const searchInput = document.getElementById('stockSymbol');
const errorMessage = document.getElementById('errorMessage');
const errorSuggestion = document.getElementById('errorSuggestion');
const loading = document.getElementById('loading');
const loadingSpinner = document.getElementById('loadingSpinner');
const stockInfo = document.getElementById('stockInfo');
const chartGroups = document.getElementById('chartGroups');
const chartError = document.getElementById('chartError');
const recentSummary = document.getElementById('recentSummary');
const yearRange = document.getElementById('yearRange');
const maToggleInputs = Array.from(document.querySelectorAll('.ma-toggle'));
const quickButtons = Array.from(document.querySelectorAll('.search-tips .quick-btn'));
const rangeButtons = Array.from(document.querySelectorAll('.range-btn'));
const taipeiDate = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
});

const indicatorHelp = {
    atr: {
        title: 'ATR（14）平均真實波幅',
        description: '衡量近期價格波動的幅度，單位與股價相同。',
        formula: [
            'TR 取三者最大值：當日最高減最低、當日最高與前收之差的絕對值、當日最低與前收之差的絕對值。',
            '首筆 ATR ＝ 前 14 筆 TR 的平均。',
            '後續 ATR ＝（前一日 ATR × 13 ＋ 當日 TR）÷ 14。'
        ],
        note: 'ATR 上升表示近期波動變大。'
    },
    rsi: {
        title: 'RSI（14）相對強弱指標',
        description: '用收盤價的漲跌衡量近期動能。RSI 介於 0 到 100。',
        formula: [
            '把每日收盤價變動拆成漲額與跌額，跌額取正值。先分別取前 14 筆的平均。',
            '後續平均 ＝（前一日平均 × 13 ＋ 當日漲額或跌額）÷ 14。',
            'RS ＝ 平均漲額 ÷ 平均跌額。RSI ＝ 100 − 100 ÷（1 ＋ RS）。'
        ],
        note: '本站在平均跌額為 0 時顯示 RSI 100。圖中的參考線是 30 和 70。'
    },
    macd: {
        title: 'MACD（12、26、9）',
        description: '比較快慢兩條收盤價均線，觀察兩者的差距如何變化。',
        formula: [
            'MACD 線 ＝ 收盤價的 12 期 EMA − 26 期 EMA。',
            '訊號線 ＝ MACD 線的 9 期 EMA。',
            '柱狀圖 ＝ MACD 線 − 訊號線。'
        ],
        note: 'EMA 的初始值採前 N 期平均，之後以 2 ÷（N ＋ 1）作為最新值的權重。'
    },
    kdj: {
        title: 'KDJ（9）隨機指標',
        description: '觀察收盤價在最近 9 個交易日高低區間中的相對位置。',
        formula: [
            'RSV ＝（收盤 − 9 日最低）÷（9 日最高 − 9 日最低）× 100。',
            'K ＝（前一日 K × 2 ＋ RSV）÷ 3。',
            'D ＝（前一日 D × 2 ＋ 當日 K）÷ 3。J ＝ 3 × K − 2 × D。'
        ],
        note: 'K、D 初始值為 50。9 日最高和最低同價時，RSV 取 50。'
    }
};

document.getElementById('searchForm').addEventListener('submit', event => {
    event.preventDefault();
    handleSearch();
});

quickButtons.concat(errorSuggestion).forEach(btn => {
    btn.addEventListener('click', () => {
        searchInput.value = btn.dataset.symbol;
        handleSearch();
        if (btn === errorSuggestion) searchInput.focus();
    });
});

rangeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        rangeButtons.forEach(button => {
            const selected = button === btn;
            button.classList.toggle('active', selected);
            button.setAttribute('aria-pressed', String(selected));
        });
        currentRange = btn.dataset.range;
        if (currentChartData) renderSelectedRange();
    });
});

document.getElementById('downloadCsv').addEventListener('click', downloadChartCsv);
document.querySelectorAll('.indicator-help').forEach(button => {
    button.addEventListener('click', () => openIndicatorHelp(indicatorHelp[button.dataset.indicator]));
});

maToggleInputs.forEach(input => {
    input.addEventListener('change', () => {
        if (latestIndicatorData) {
            renderCandlestickChart(latestIndicatorData.ohlc, latestIndicatorData);
        }
    });
});

async function handleSearch() {
    const requestId = ++searchRequestId;
    const symbol = searchInput.value.normalize('NFKC').trim().toUpperCase();
    hideError();
    setLoading(false);
    stockInfo.hidden = true;
    chartGroups.hidden = true;
    recentSummary.hidden = true;
    yearRange.hidden = true;
    chartError.textContent = '';
    currentChartData = null;
    latestIndicatorData = null;
    clearIndicatorCharts();

    if (!symbol) {
        showError('請輸入股票代號，例如 2330。', { invalid: true });
        return;
    }

    if (!/^[A-Z0-9]{1,6}$/.test(symbol)) {
        const name = symbol.replace(/\s/g, '');
        const suggestion = quickButtons.find(btn => btn.dataset.name.replace(/\s/g, '') === name);
        const message = suggestion
            ? `「${symbol}」的代號是 ${suggestion.dataset.symbol}。請點下方按鈕查詢。`
            : `無法用「${symbol}」查詢。請輸入英數代號，例如 2330。`;
        showError(message, { invalid: true, suggestion });
        return;
    }

    setLoading(true);
    const [quote, chart] = await Promise.all([
        fetchStockData('quote', symbol),
        fetchStockData('chart', symbol, '&range=5y')
    ]);
    if (requestId !== searchRequestId) return;
    setLoading(false);

    const chartData = chart.data?.ohlc?.length ? chart.data : null;
    if (!quote.data && !chartData) {
        const invalid = quote.code === 'SYMBOL_NOT_FOUND' && chart.code === 'SYMBOL_NOT_FOUND';
        const message = invalid
            ? `查不到代號「${symbol}」，請確認代號後再查詢。`
            : `暫時無法取得「${symbol}」的資料，請稍後再查詢。`;
        showError(message, { invalid });
        return;
    }

    updateQuoteUI(quote.data || chartData, Boolean(quote.data));
    stockInfo.hidden = false;

    if (!chartData) {
        chartError.textContent = '暫時無法取得歷史資料。可重新查詢以重試。';
        return;
    }

    currentChartData = chartData;
    const indicatorData = buildIndicatorSeries(chartData.ohlc);
    const now = Date.now();
    renderYearRange(buildYearRange(chartData, now));
    renderSummary(buildRecentSummary(chartData, indicatorData, now));
    latestIndicatorData = indicatorData;
    renderSelectedRange();
}

async function fetchStockData(endpoint, symbol, extraQuery = '') {
    try {
        const response = await fetch(`/api/${endpoint}?symbol=${encodeURIComponent(symbol)}${extraQuery}`);
        if (!response.ok) return {};
        const result = await response.json();
        return result.success ? { data: result.data } : { code: result.code };
    } catch (error) {
        console.error('Stock request failed:', error);
        return {};
    }
}

function renderSelectedRange() {
    const visible = trimChartDataToRange(currentChartData, currentRange);
    const indicatorData = latestIndicatorData;
    indicatorData.ohlc = visible.ohlc;
    indicatorData.visibleStart = visible.ohlc[0]?.x ?? null;
    chartGroups.hidden = false;
    chartError.textContent = '';
    try {
        renderCandlestickChart(visible.ohlc, indicatorData);
        renderVolumeChart(visible.volume);
        renderAtrChart(indicatorData);
        renderRsiChart(indicatorData);
        renderMacdChart(indicatorData);
        renderKdjChart(indicatorData);
    } catch (error) {
        console.error('Chart render failed:', error);
        chartError.textContent = '暫時無法顯示圖表，請重新查詢。';
        chartGroups.hidden = true;
        clearIndicatorCharts();
    }
}

function trimChartDataToRange(chartData, range) {
    const ohlc = chartData.ohlc || [];
    const volume = chartData.volume || [];

    if (ohlc.length === 0) {
        return { ohlc: [], volume: [] };
    }

    const endDate = new Date(ohlc[ohlc.length - 1].x);
    const startDate = new Date(endDate);

    if (range === '1mo') {
        startDate.setMonth(startDate.getMonth() - 1);
    } else if (range === '3mo') {
        startDate.setMonth(startDate.getMonth() - 3);
    } else if (range === '6mo') {
        startDate.setMonth(startDate.getMonth() - 6);
    } else if (range === '1y') {
        startDate.setFullYear(startDate.getFullYear() - 1);
    } else if (range === '5y') {
        startDate.setFullYear(startDate.getFullYear() - 5);
    }

    const startTime = startDate.getTime();

    return {
        ohlc: ohlc.filter(point => point.x >= startTime),
        volume: volume.filter(point => point.x >= startTime)
    };
}

function updateQuoteUI(data, hasQuote) {
    const code = data.symbol?.split('.')[0];
    const quickStock = quickButtons.find(btn => btn.dataset.symbol === code)?.dataset;
    document.getElementById('stockName').textContent = quickStock
        ? `${quickStock.name} ${code}`
        : data.name || code || '個股分析';
    document.getElementById('stockSymbolDisplay').textContent = data.symbol || '-';

    const marketBadge = document.getElementById('stockMarket');
    marketBadge.textContent = data.market || '-';
    marketBadge.className = `market-badge ${data.market === '上市' ? 'listed' : 'otc'}`;
    const kindBadge = document.getElementById('stockKind');
    const kind = quickStock?.kind || { EQUITY: '股票', ETF: 'ETF' }[data.instrumentType];
    kindBadge.textContent = kind || '';
    kindBadge.hidden = !kind;

    const quoteMeta = ['資料來源 Yahoo Finance'];
    if (hasQuote) {
        const date = Number.isFinite(data.timestamp) ? taipeiDate.format(data.timestamp) : '未提供';
        quoteMeta.push(`報價交易日 ${date}（台北時間）`, `幣別 ${data.currency || '未提供'}`);
    }
    document.getElementById('quoteMeta').textContent = quoteMeta.join(' · ');
    document.getElementById('quoteError').textContent = hasQuote ? '' : '暫時無法取得最新報價，以下為歷史資料。';
    document.getElementById('stockDetails').hidden = !hasQuote;
    document.querySelector('.price-section').hidden = !hasQuote;

    document.getElementById('stockPrice').textContent =
        data.price !== null && data.price !== undefined ? formatNumber(data.price) : '-';

    const changeEl = document.getElementById('stockChange');
    const changePercentEl = document.getElementById('stockChangePercent');

    if (data.change !== null && data.change !== undefined) {
        const isPositive = data.change >= 0;
        const sign = isPositive ? '+' : '';
        changeEl.textContent = `${sign}${formatNumber(data.change)}`;
        changeEl.className = `change ${isPositive ? 'positive' : 'negative'}`;
        changePercentEl.textContent = `${sign}${formatNumber(data.changePercent, 2)}%`;
        changePercentEl.className = `change-percent ${isPositive ? 'positive' : 'negative'}`;
    } else {
        changeEl.textContent = '-';
        changeEl.className = 'change';
        changePercentEl.textContent = '-';
        changePercentEl.className = 'change-percent';
    }

    document.getElementById('stockOpen').textContent =
        data.open !== null && data.open !== undefined ? formatNumber(data.open) : '-';
    document.getElementById('stockHigh').textContent =
        data.high !== null && data.high !== undefined ? formatNumber(data.high) : '-';
    document.getElementById('stockLow').textContent =
        data.low !== null && data.low !== undefined ? formatNumber(data.low) : '-';
    document.getElementById('stockVolume').textContent = formatVolume(data.volume);
}

function getLatestCompletedIndex({ ohlc, regularSessionEnd }, now) {
    const today = taipeiDate.format(now);
    const completedToday = Number.isFinite(regularSessionEnd) &&
        taipeiDate.format(regularSessionEnd) === today && now >= regularSessionEnd;
    return ohlc.findLastIndex(point => {
        const date = taipeiDate.format(point.x);
        return date < today || (date === today && completedToday);
    });
}

function buildYearRange(chartData, now = Date.now()) {
    const { ohlc } = chartData;
    const index = getLatestCompletedIndex(chartData, now);
    if (index < 0) return null;

    const { x, c: close } = ohlc[index];
    const date = taipeiDate.format(x);
    const weeksInMilliseconds = 52 * 7 * 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.parse(date) - weeksInMilliseconds).toISOString().slice(0, 10);
    if (taipeiDate.format(ohlc[0].x) > cutoff) return null;

    const window = ohlc.slice(0, index + 1).filter(point => taipeiDate.format(point.x) >= cutoff);
    const low = Math.min(...window.map(point => point.l));
    const high = Math.max(...window.map(point => point.h));
    return {
        date, low, high, close,
        position: high > low ? (close - low) / (high - low) * 100 : null,
        distanceFromHigh: high > 0 ? (close - high) / high * 100 : null
    };
}

function renderYearRange(range) {
    yearRange.hidden = false;
    document.getElementById('yearRangeData').hidden = !range;
    document.getElementById('yearRangeStatus').textContent = range ? '' : '已收盤的歷史資料未滿 52 週。';
    document.getElementById('yearRangeDate').textContent = range ? `截至 ${range.date}（台北時間）` : '';
    if (!range) return;

    document.getElementById('yearRangeClose').textContent = formatNumber(range.close);
    document.getElementById('yearRangeLow').textContent = formatNumber(range.low);
    document.getElementById('yearRangeHigh').textContent = formatNumber(range.high);
    document.getElementById('yearRangeDistance').textContent = Number.isFinite(range.distanceFromHigh)
        ? `${formatNumber(range.distanceFromHigh)}%`
        : '—';
    const track = document.getElementById('yearRangeTrack');
    track.style.setProperty('--range-position', `${range.position ?? 50}%`);
    track.setAttribute('aria-label', range.position === null
        ? '52 週高低點同價'
        : `收盤價位於 52 週高低區間的 ${formatNumber(range.position, 0)}%`);
}

function buildRecentSummary(chartData, indicators, now = Date.now()) {
    const { ohlc, volume } = chartData;
    const index = getLatestCompletedIndex(chartData, now);
    const bar = ohlc[index];
    if (!bar) return null;

    const indicatorAtClose = series => series.find(point => point.x === bar.x)?.y ?? null;
    const priceChange = base => Number.isFinite(base) && base > 0 ? (bar.c / base - 1) * 100 : null;
    const volumes = new Map(volume.map(point => [point.x, point.y]));
    const latestVolume = volumes.get(bar.x);
    const priorVolumes = ohlc.slice(Math.max(0, index - 20), index).map(point => volumes.get(point.x));
    const averageVolume = priorVolumes.length === 20 && priorVolumes.every(Number.isFinite)
        ? priorVolumes.reduce((sum, value) => sum + value, 0) / 20
        : null;

    return {
        date: taipeiDate.format(bar.x),
        change5: priceChange(ohlc[index - 5]?.c),
        change20: priceChange(ohlc[index - 20]?.c),
        ma20Distance: priceChange(indicatorAtClose(indicators.ma20)),
        volumeRatio: Number.isFinite(latestVolume) && averageVolume > 0 ? latestVolume / averageVolume : null,
        rsi14: indicatorAtClose(indicators.rsi14),
        atr14: indicatorAtClose(indicators.atr14)
    };
}

function renderSummary(summary) {
    document.getElementById('summaryDate').textContent = summary
        ? `以 ${summary.date} 的完整日線為準（台北時間）。`
        : '目前沒有可確認已收盤的日線資料。';
    const units = { change5: '%', change20: '%', ma20Distance: '%', volumeRatio: ' 倍', rsi14: '', atr14: '' };
    for (const [metric, unit] of Object.entries(units)) {
        const value = summary?.[metric];
        const sign = unit === '%' && value > 0 ? '+' : '';
        document.getElementById(metric).textContent = Number.isFinite(value)
            ? `${sign}${formatNumber(value)}${unit}`
            : '資料不足';
    }
    recentSummary.hidden = false;
}

function buildChartCsv({ ohlc, volume }, indicators) {
    const series = [
        ['成交量(股)', volume],
        ['MA5', indicators.ma5],
        ['MA10', indicators.ma10],
        ['MA20', indicators.ma20],
        ['MA60', indicators.ma60],
        ['ATR(14)', indicators.atr14],
        ['RSI(14)', indicators.rsi14],
        ['MACD', indicators.macd.macd],
        ['MACD訊號線', indicators.macd.signal],
        ['MACD柱狀圖', indicators.macd.histogram],
        ['K', indicators.kdj.k],
        ['D', indicators.kdj.d],
        ['J', indicators.kdj.j]
    ];
    const columns = series.map(([, points]) => new Map(points.map(({ x, y }) => [x, y])));
    const rows = [['日期', '開盤', '最高', '最低', '收盤', ...series.map(([name]) => name)].join(',')];
    for (const { x, o, h, l, c } of ohlc) {
        const values = [o, h, l, c, ...columns.map(column => column.get(x))];
        rows.push([taipeiDate.format(x), ...values.map(value => Number.isFinite(value) ? value : '')].join(','));
    }
    return '\uFEFF' + rows.join('\r\n') + '\r\n';
}

function downloadChartCsv() {
    if (!currentChartData || !latestIndicatorData) return;
    const visible = trimChartDataToRange(currentChartData, currentRange);
    const csv = buildChartCsv(visible, latestIndicatorData);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentChartData.symbol}-${currentRange}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openIndicatorHelp(help) {
    document.getElementById('indicatorTitle').textContent = help.title;
    document.getElementById('indicatorDescription').textContent = help.description;
    document.getElementById('indicatorNote').textContent = help.note;
    const formulaItems = help.formula.map(text => {
        const item = document.createElement('li');
        item.textContent = text;
        return item;
    });
    document.getElementById('indicatorFormula').replaceChildren(...formulaItems);
    document.getElementById('indicatorDialog').showModal();
}

function buildIndicatorSeries(ohlcData) {
    const points = ohlcData.map(point => ({ x: point.x, o: point.o, h: point.h, l: point.l, c: point.c }));
    const closes = points.map(point => point.c);
    const highs = points.map(point => point.h);
    const lows = points.map(point => point.l);

    return {
        ma5: calculateSmaSeries(closes, 5, points),
        ma10: calculateSmaSeries(closes, 10, points),
        ma20: calculateSmaSeries(closes, 20, points),
        ma60: calculateSmaSeries(closes, 60, points),
        atr14: calculateAtrSeries(highs, lows, closes, 14, points),
        rsi14: calculateRsiSeries(closes, 14, points),
        macd: calculateMacdSeries(closes, points),
        kdj: calculateKdjSeries(highs, lows, closes, 9, points)
    };
}

function calculateSmaSeries(values, period, points) {
    const series = [];
    for (let index = period - 1; index < values.length; index += 1) {
        const window = values.slice(index - period + 1, index + 1);
        series.push({
            x: points[index].x,
            y: window.reduce((sum, value) => sum + value, 0) / period
        });
    }
    return series;
}

function calculateEmaSeries(values, period) {
    if (values.length < period) {
        return [];
    }

    const multiplier = 2 / (period + 1);
    const series = [];
    let ema = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
    series.push(ema);

    for (let index = period; index < values.length; index += 1) {
        ema = ((values[index] - ema) * multiplier) + ema;
        series.push(ema);
    }

    return series;
}

function calculateRsiSeries(values, period, points) {
    if (values.length <= period) {
        return [];
    }

    let gains = 0;
    let losses = 0;

    for (let index = 1; index <= period; index += 1) {
        const delta = values[index] - values[index - 1];
        if (delta >= 0) {
            gains += delta;
        } else {
            losses += Math.abs(delta);
        }
    }

    let averageGain = gains / period;
    let averageLoss = losses / period;
    const series = [{
        x: points[period].x,
        y: averageLoss === 0 ? 100 : 100 - (100 / (1 + (averageGain / averageLoss)))
    }];

    for (let index = period + 1; index < values.length; index += 1) {
        const delta = values[index] - values[index - 1];
        const gain = delta > 0 ? delta : 0;
        const loss = delta < 0 ? Math.abs(delta) : 0;

        averageGain = ((averageGain * (period - 1)) + gain) / period;
        averageLoss = ((averageLoss * (period - 1)) + loss) / period;

        const rsi = averageLoss === 0 ? 100 : 100 - (100 / (1 + (averageGain / averageLoss)));
        series.push({ x: points[index].x, y: rsi });
    }

    return series;
}

function calculateMacdSeries(values, points) {
    const ema12 = calculateEmaSeries(values, 12);
    const ema26 = calculateEmaSeries(values, 26);

    if (!ema12.length || !ema26.length) {
        return { macd: [], signal: [], histogram: [] };
    }

    const macdRaw = [];
    for (let index = 25; index < values.length; index += 1) {
        macdRaw.push({
            x: points[index].x,
            y: ema12[index - 11] - ema26[index - 25]
        });
    }

    const signalRaw = calculateEmaSeries(macdRaw.map(point => point.y), 9);
    const signal = signalRaw.map((value, index) => ({
        x: macdRaw[index + 8].x,
        y: value
    }));

    const histogram = signal.map((point, index) => ({
        x: point.x,
        y: macdRaw[index + 8].y - point.y
    }));

    return {
        macd: macdRaw,
        signal,
        histogram
    };
}

function calculateKdjSeries(highs, lows, closes, period, points) {
    if (closes.length < period) {
        return { k: [], d: [], j: [] };
    }

    let k = 50;
    let d = 50;
    const kSeries = [];
    const dSeries = [];
    const jSeries = [];

    for (let index = period - 1; index < closes.length; index += 1) {
        const highestHigh = Math.max(...highs.slice(index - period + 1, index + 1));
        const lowestLow = Math.min(...lows.slice(index - period + 1, index + 1));
        const rsv = highestHigh === lowestLow ? 50 : ((closes[index] - lowestLow) / (highestHigh - lowestLow)) * 100;

        k = ((2 * k) + rsv) / 3;
        d = ((2 * d) + k) / 3;
        const j = (3 * k) - (2 * d);

        kSeries.push({ x: points[index].x, y: k });
        dSeries.push({ x: points[index].x, y: d });
        jSeries.push({ x: points[index].x, y: j });
    }

    return { k: kSeries, d: dSeries, j: jSeries };
}

function calculateAtrSeries(highs, lows, closes, period, points) {
    if (closes.length <= period) {
        return [];
    }

    const trueRanges = [];
    for (let index = 1; index < closes.length; index += 1) {
        trueRanges.push(Math.max(
            highs[index] - lows[index],
            Math.abs(highs[index] - closes[index - 1]),
            Math.abs(lows[index] - closes[index - 1])
        ));
    }

    if (trueRanges.length < period) {
        return [];
    }

    const series = [];
    let atr = trueRanges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
    series.push({ x: points[period].x, y: atr });

    for (let index = period; index < trueRanges.length; index += 1) {
        atr = ((atr * (period - 1)) + trueRanges[index]) / period;
        series.push({ x: points[index + 1].x, y: atr });
    }

    return series;
}

function renderCandlestickChart(ohlcData, indicatorData) {
    const ctx = document.getElementById('candlestickChart').getContext('2d');

    if (candlestickChart) {
        candlestickChart.destroy();
    }

    const datasets = [{
        label: 'K線',
        type: 'candlestick',
        data: ohlcData,
        color: {
            up: '#ef5350',
            down: '#26a69a',
            unchanged: '#9e9e9e'
        }
    }];

    const visibleMas = getVisibleMas();
    const maConfigs = {
        ma5: ['MA5', '#ff7043'],
        ma10: ['MA10', '#42a5f5'],
        ma20: ['MA20', '#66bb6a'],
        ma60: ['MA60', '#ab47bc']
    };

    visibleMas.forEach(key => {
        const [label, color] = maConfigs[key];
        datasets.push(buildLineDataset(label, filterSeriesForVisibleRange(indicatorData[key], indicatorData.visibleStart, true), color, 1.5));
    });

    candlestickChart = new Chart(ctx, {
        data: { datasets },
        options: getTimeSeriesOptions({
            hideLegend: false,
            tooltipFormatter(context) {
                const point = context.raw;
                if (point && Number.isFinite(point.o)) {
                    return [
                        `開盤: ${formatNumber(point.o)}`,
                        `最高: ${formatNumber(point.h)}`,
                        `最低: ${formatNumber(point.l)}`,
                        `收盤: ${formatNumber(point.c)}`
                    ];
                }
                return `${context.dataset.label}: ${formatNumber(point.y)}`;
            }
        })
    });
}

function renderVolumeChart(volumeData) {
    const ctx = document.getElementById('volumeChart').getContext('2d');

    if (volumeChart) {
        volumeChart.destroy();
    }

    volumeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            datasets: [{
                label: '成交量',
                data: volumeData,
                backgroundColor: 'rgba(100, 181, 246, 0.65)',
                borderWidth: 0,
                barPercentage: 0.92,
                categoryPercentage: 0.96,
                parsing: false
            }]
        },
        options: getTimeSeriesOptions({
            hideLegend: true,
            tooltipFormatter(context) {
                return `成交量: ${formatVolume(context.raw.y)}`;
            }
        })
    });
}

function renderAtrChart(indicatorData) {
    const ctx = document.getElementById('atrChart').getContext('2d');
    if (atrChart) {
        atrChart.destroy();
    }

    atrChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                buildLineDataset('ATR14', filterSeriesForVisibleRange(indicatorData.atr14, indicatorData.visibleStart), '#ffca28', 1.6)
            ]
        },
        options: getTimeSeriesOptions({ hideLegend: false })
    });
}

function renderRsiChart(indicatorData) {
    const ctx = document.getElementById('rsiChart').getContext('2d');
    if (rsiChart) {
        rsiChart.destroy();
    }

    const rsiSeries = filterSeriesForVisibleRange(indicatorData.rsi14, indicatorData.visibleStart, true);

    rsiChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                buildLineDataset('RSI(14)', rsiSeries, '#29b6f6', 1.8),
                buildLineDataset('超買 70', buildHorizontalSeries(rsiSeries, 70), 'rgba(239, 83, 80, 0.7)', 1, 'y', [6, 6]),
                buildLineDataset('超賣 30', buildHorizontalSeries(rsiSeries, 30), 'rgba(102, 187, 106, 0.7)', 1, 'y', [6, 6])
            ]
        },
        options: getTimeSeriesOptions({
            hideLegend: false,
            yMin: 0,
            yMax: 100
        })
    });
}

function renderMacdChart(indicatorData) {
    const ctx = document.getElementById('macdChart').getContext('2d');
    if (macdChart) {
        macdChart.destroy();
    }

    const histogram = filterSeriesForVisibleRange(indicatorData.macd.histogram, indicatorData.visibleStart);
    const macdSeries = filterSeriesForVisibleRange(indicatorData.macd.macd, indicatorData.visibleStart, true);
    const signalSeries = filterSeriesForVisibleRange(indicatorData.macd.signal, indicatorData.visibleStart, true);

    macdChart = new Chart(ctx, {
        data: {
            datasets: [
                {
                    type: 'bar',
                    label: 'Hist',
                    data: histogram,
                    backgroundColor: histogram.map(point =>
                        point.y >= 0 ? 'rgba(239, 83, 80, 0.55)' : 'rgba(38, 166, 154, 0.55)'
                    ),
                    parsing: false
                },
                buildLineDataset('MACD', macdSeries, '#ff7043', 1.5),
                buildLineDataset('Signal', signalSeries, '#42a5f5', 1.5)
            ]
        },
        options: getTimeSeriesOptions({ hideLegend: false })
    });
}

function renderKdjChart(indicatorData) {
    const ctx = document.getElementById('kdjChart').getContext('2d');
    if (kdjChart) {
        kdjChart.destroy();
    }

    kdjChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                buildLineDataset('K', filterSeriesForVisibleRange(indicatorData.kdj.k, indicatorData.visibleStart, true), '#ffee58', 1.4),
                buildLineDataset('D', filterSeriesForVisibleRange(indicatorData.kdj.d, indicatorData.visibleStart, true), '#66bb6a', 1.4),
                buildLineDataset('J', filterSeriesForVisibleRange(indicatorData.kdj.j, indicatorData.visibleStart, true), '#ab47bc', 1.4)
            ]
        },
        options: getTimeSeriesOptions({ hideLegend: false })
    });
}

function clearIndicatorCharts() {
    [candlestickChart, volumeChart, atrChart, rsiChart, macdChart, kdjChart].forEach(chart => {
        if (chart) {
            chart.destroy();
        }
    });
    candlestickChart = null;
    volumeChart = null;
    atrChart = null;
    rsiChart = null;
    macdChart = null;
    kdjChart = null;
}

function getVisibleMas() {
    return maToggleInputs.filter(input => input.checked).map(input => input.value);
}

function buildLineDataset(label, data, color, width = 1.4, yAxisID = 'y', dash = []) {
    return {
        type: 'line',
        label,
        data,
        parsing: false,
        borderColor: color,
        backgroundColor: color,
        borderWidth: width,
        pointRadius: 0,
        tension: 0.15,
        yAxisID,
        borderDash: dash
    };
}

function buildHorizontalSeries(referenceSeries, value) {
    return referenceSeries.map(point => ({ x: point.x, y: value }));
}

function filterSeriesForVisibleRange(series, visibleStart, includePreviousPoint = false) {
    if (!Array.isArray(series) || visibleStart === null) {
        return [];
    }

    const startIndex = series.findIndex(point => point.x >= visibleStart);
    if (startIndex === -1) {
        return [];
    }

    if (includePreviousPoint && startIndex > 0) {
        return series.slice(startIndex - 1);
    }

    return series.slice(startIndex);
}

function getTimeSeriesOptions({ hideLegend = false, tooltipFormatter = null, yMin, yMax } = {}) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        interaction: {
            mode: 'index',
            intersect: false
        },
        scales: {
            x: {
                type: 'timeseries',
                time: {
                    unit: 'day'
                },
                ticks: {
                    source: 'data',
                    color: '#b0bec5',
                    maxRotation: 0,
                    autoSkipPadding: 12,
                    maxTicksLimit: 10,
                    callback(value) {
                        const date = taipeiDate.format(value);
                        const label = ['1y', '5y'].includes(currentRange) ? date.slice(0, 7) : date.slice(5);
                        return label.replace('-', '/');
                    }
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.08)'
                }
            },
            y: {
                position: 'right',
                min: yMin,
                max: yMax,
                grid: {
                    color: 'rgba(255, 255, 255, 0.08)'
                },
                ticks: {
                    color: '#b0bec5'
                }
            }
        },
        plugins: {
            legend: {
                display: !hideLegend,
                labels: {
                    color: '#d7e0ea',
                    boxWidth: 16
                }
            },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.82)',
                titleColor: '#fff',
                bodyColor: '#fff',
                callbacks: {
                    title: items => Number.isFinite(items[0]?.raw?.x) ? taipeiDate.format(items[0].raw.x) : '',
                    ...(tooltipFormatter ? { label: tooltipFormatter } : {})
                }
            }
        }
    };
}

function formatNumber(num, decimals = 2) {
    if (num === null || num === undefined || !Number.isFinite(num)) {
        return '-';
    }

    return num.toLocaleString('zh-TW', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function formatVolume(volume) {
    if (!Number.isFinite(volume)) {
        return '-';
    }
    if (volume >= 1e8) {
        return `${formatNumber(volume / 1e8)} 億股`;
    }
    if (volume >= 1e4) {
        return `${formatNumber(volume / 1e4)} 萬股`;
    }
    return `${formatNumber(volume, 0)} 股`;
}

function showError(message, { invalid, suggestion }) {
    errorMessage.textContent = message;
    if (invalid) searchInput.setAttribute('aria-invalid', 'true');
    if (suggestion) {
        errorSuggestion.textContent = `查詢 ${suggestion.textContent}`;
        errorSuggestion.dataset.symbol = suggestion.dataset.symbol;
        errorSuggestion.hidden = false;
    }
}

function hideError() {
    errorMessage.textContent = '';
    errorSuggestion.hidden = true;
    searchInput.removeAttribute('aria-invalid');
}

function setLoading(active) {
    loading.textContent = active ? '載入中…' : '';
    loadingSpinner.hidden = !active;
}
