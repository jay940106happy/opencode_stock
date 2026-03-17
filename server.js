const express = require('express');
const path = require('path');
const yahooService = require('./services/yahooService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/quote', async (req, res) => {
    try {
        const { symbol } = req.query;

        if (!symbol) {
            return res.status(400).json({ error: '請提供股票代號' });
        }

        const result = await yahooService.getQuote(symbol);
        res.json(result);
    } catch (error) {
        console.error('Quote API Error:', error.message);
        res.status(500).json({ error: '取得股價資料失敗，請稍後再試' });
    }
});

app.get('/api/chart', async (req, res) => {
    try {
        const { symbol, range = '6mo' } = req.query;

        if (!symbol) {
            return res.status(400).json({ error: '請提供股票代號' });
        }

        const validRanges = ['1mo', '3mo', '6mo', '1y', '5y'];
        if (!validRanges.includes(range)) {
            return res.status(400).json({ error: '不支援的時間區間' });
        }

        const result = await yahooService.getChart(symbol, range);
        res.json(result);
    } catch (error) {
        console.error('Chart API Error:', error.message);
        res.status(500).json({ error: '取得圖表資料失敗，請稍後再試' });
    }
});

app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('  台股查詢伺服器已啟動');
    console.log(`  http://localhost:${PORT}`);
    console.log('========================================\n');
});

module.exports = app;
