/**
 * Symbol Resolver - 台股代號解析工具
 * 使用 chart API 來驗證代號
 * 
 * 台股代號規則：
 * - 上市股票：通常使用 .TW 後綴
 *   例如：2330.TW (台積電), 0050.TW (元大台灣50)
 * - 上櫃股票：通常使用 .TWO 後綴
 *   例如：6488.TWO (玉山金), 3122.TWO (安逸)
 */

const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com';

/**
 * 發送 HTTP 請求
 */
async function yahooRequest(url) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
}

/**
 * 解析股票代號
 * @param {string} symbol - 原始代號（如 2330）
 * @returns {Promise<{symbol: string, market: string}>}
 */
async function resolveSymbol(symbol) {
    // 清理輸入
    const cleanSymbol = symbol.toString().trim().toUpperCase();
    
    // 先嘗試上市（.TW）
    const twSymbol = `${cleanSymbol}.TW`;
    try {
        const url = `${YAHOO_BASE_URL}/v8/finance/chart/${twSymbol}?range=1d&interval=1d`;
        const result = await yahooRequest(url);
        
        if (result.chart?.result?.[0]?.meta?.regularMarketPrice) {
            return {
                symbol: twSymbol,
                market: '上市'
            };
        }
    } catch (error) {
        // 繼續嘗試下一個
    }
    
    // 再嘗試上櫃（.TWO）
    const twoSymbol = `${cleanSymbol}.TWO`;
    try {
        const url = `${YAHOO_BASE_URL}/v8/finance/chart/${twoSymbol}?range=1d&interval=1d`;
        const result = await yahooRequest(url);
        
        if (result.chart?.result?.[0]?.meta?.regularMarketPrice) {
            return {
                symbol: twoSymbol,
                market: '上櫃'
            };
        }
    } catch (error) {
        // 繼續嘗試下一個
    }
    
    // 都失敗
    return null;
}

/**
 * 快速解析代號（不發實際 API 請求）
 * 僅根據代號規則推測
 * @param {string} symbol 
 * @returns {{symbol: string, market: string}}
 */
function guessSymbol(symbol) {
    const cleanSymbol = symbol.toString().trim().toUpperCase();
    
    // 上市常見規則：4碼或以下
    if (cleanSymbol.length <= 4) {
        return {
            symbol: `${cleanSymbol}.TW`,
            market: '上市(推測)'
        };
    }
    
    // 上櫃常見規則：4碼以上
    return {
        symbol: `${cleanSymbol}.TWO`,
        market: '上櫃(推測)'
    };
}

module.exports = {
    resolveSymbol,
    guessSymbol
};
