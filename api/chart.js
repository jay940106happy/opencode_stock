const yahooService = require('../services/yahooService');

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

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
        return res.status(200).json(result);
    } catch (error) {
        console.error('Vercel Chart API Error:', error.message);
        return res.status(500).json({
            success: false,
            message: '取得圖表資料失敗，請稍後再試'
        });
    }
};
