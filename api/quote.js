const yahooService = require('../services/yahooService');

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { symbol } = req.query;

        if (!symbol) {
            return res.status(400).json({ error: '請提供股票代號' });
        }

        const result = await yahooService.getQuote(symbol);
        return res.status(200).json(result);
    } catch (error) {
        console.error('Vercel Quote API Error:', error.message);
        return res.status(500).json({
            success: false,
            message: '取得股價資料失敗，請稍後再試'
        });
    }
};
