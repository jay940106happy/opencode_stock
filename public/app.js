let currentSymbol = '';
let currentRange = '6mo';
let candlestickChart = null;
let volumeChart = null;
let atrChart = null;
let rsiChart = null;
let macdChart = null;
let kdjChart = null;
let latestIndicatorData = null;

const searchInput = document.getElementById('stockSymbol');
const searchBtn = document.getElementById('searchBtn');
const errorMessage = document.getElementById('errorMessage');
const loading = document.getElementById('loading');
const stockInfo = document.getElementById('stockInfo');
const maToggleInputs = Array.from(document.querySelectorAll('.ma-toggle'));

searchBtn.addEventListener('click', handleSearch);

searchInput.addEventListener('keypress', event => {
    if (event.key === 'Enter') {
        handleSearch();
    }
});

document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        searchInput.value = btn.dataset.symbol;
        handleSearch();
    });
});

document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        document.querySelectorAll('.range-btn').forEach(button => button.classList.remove('active'));
        btn.classList.add('active');
        currentRange = btn.dataset.range;

        if (currentSymbol) {
            await loadChartData(currentSymbol, currentRange);
        }
    });
});

maToggleInputs.forEach(input => {
    input.addEventListener('change', () => {
        if (latestIndicatorData) {
            renderCandlestickChart(latestIndicatorData.ohlc, latestIndicatorData);
        }
    });
});

async function handleSearch() {
    const symbol = searchInput.value.trim();

    if (!symbol) {
        showError('請輸入股票代號');
        return;
    }

    hideError();
    showLoading();

    try {
        currentSymbol = symbol;

        const [quoteResult, chartResult] = await Promise.all([
            loadQuoteData(symbol),
            loadChartData(symbol, currentRange)
        ]);

        stockInfo.style.display = 'block';

        if (!quoteResult.success && !chartResult.success) {
            showError(quoteResult.message || chartResult.message || '查詢失敗');
        }
    } catch (error) {
        console.error('Search error:', error);
        showError(error.message || '查詢失敗，請稍後再試');
    } finally {
        hideLoading();
    }
}

async function loadQuoteData(symbol) {
    const response = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
    const result = await response.json();

    if (!result.success) {
        showError(result.message || '無法取得股價資料');
        return result;
    }

    updateQuoteUI(result.data);
    return result;
}

async function loadChartData(symbol, range) {
    const chartError = document.getElementById('chartError');
    chartError.style.display = 'none';

    const fetchRange = getIndicatorFetchRange(range);
    const response = await fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(fetchRange)}`);
    const result = await response.json();

    if (!result.success) {
        chartError.textContent = result.message || '無法取得圖表資料';
        chartError.style.display = 'block';
        clearIndicatorCharts();
        latestIndicatorData = null;
        return result;
    }

    if (!result.data?.ohlc?.length) {
        chartError.textContent = '無歷史股價資料';
        chartError.style.display = 'block';
        clearIndicatorCharts();
        latestIndicatorData = null;
        return result;
    }

    try {
        const visibleChartData = trimChartDataToRange(result.data, range);
        const indicatorData = buildIndicatorSeries(result.data.ohlc);
        indicatorData.ohlc = visibleChartData.ohlc;
        indicatorData.volume = visibleChartData.volume;
        indicatorData.visibleStart = visibleChartData.ohlc[0]?.x ?? null;
        latestIndicatorData = indicatorData;

        renderCandlestickChart(visibleChartData.ohlc, indicatorData);
        renderVolumeChart(visibleChartData.volume || []);
        renderAtrChart(indicatorData);
        renderRsiChart(indicatorData);
        renderMacdChart(indicatorData);
        renderKdjChart(indicatorData);
    } catch (error) {
        console.error('[Frontend] Chart render error:', error);
        chartError.textContent = `圖表渲染失敗: ${error.message}`;
        chartError.style.display = 'block';
        clearIndicatorCharts();
        latestIndicatorData = null;
    }

    return result;
}

function getIndicatorFetchRange(range) {
    return range === '5y' ? '5y' : '5y';
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

function updateQuoteUI(data) {
    document.getElementById('stockName').textContent = data.name || '-';
    document.getElementById('stockSymbolDisplay').textContent = data.symbol || '-';

    const marketBadge = document.getElementById('stockMarket');
    marketBadge.textContent = data.market || '-';
    marketBadge.className = `market-badge ${data.market === '上市' ? 'listed' : 'otc'}`;

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
    document.getElementById('stockVolume').textContent = data.volume ? formatVolume(data.volume) : '-';
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
                    unit: 'day',
                    displayFormats: {
                        day: 'MM/dd'
                    }
                },
                ticks: {
                    source: 'data',
                    color: '#b0bec5',
                    maxRotation: 0
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
                callbacks: tooltipFormatter ? { label: tooltipFormatter } : {}
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
    if (volume >= 1e9) {
        return `${(volume / 1e9).toFixed(2)} B`;
    }
    if (volume >= 1e6) {
        return `${(volume / 1e6).toFixed(2)} M`;
    }
    if (volume >= 1e4) {
        return `${(volume / 1e4).toFixed(2)} 萬`;
    }
    return volume.toLocaleString('zh-TW');
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function hideError() {
    errorMessage.style.display = 'none';
}

function showLoading() {
    loading.style.display = 'block';
    stockInfo.style.display = 'none';
}

function hideLoading() {
    loading.style.display = 'none';
}
