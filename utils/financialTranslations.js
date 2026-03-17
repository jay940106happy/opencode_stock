/**
 * 財報欄位翻譯對照表
 * 將 Yahoo Finance 的英文欄位翻譯成中文
 * 
 * 預留擴充欄位：
 * - 均線：MA5, MA10, MA20, MA60
 * - 本益比：PE ratio
 * - 殖利率：Dividend yield
 * - 月營收：Monthly revenue
 */

const TRANSLATIONS = {
    // ========== 損益表 (Income Statement) ==========
    'totalRevenue': '營業收入合計',
    'operatingRevenue': '營業收入',
    'costOfRevenue': '營業成本',
    'grossProfit': '毛損/毛利',
    'operatingExpenses': '營業費用',
    'sellingGeneralAndAdmin': '銷售及管理費用',
    'researchAndDevelopment': '研發費用',
    'operatingIncome': '營業利益',
    'netIncome': '淨利',
    'netIncomeBeforeTax': '稅前淨利',
    'incomeTaxExpense': '所得稅費用',
    'incomeBeforeTax': '稅前息前淨利',
    'ebit': '息稅前淨利(EBIT)',
    'ebitda': '息稅折舊攤銷前淨利(EBITDA)',
    
    // ========== 資產負債表 (Balance Sheet) ==========
    'totalAssets': '資產總計',
    'totalLiabilities': '負債總計',
    'totalEquity': '業主權益合計',
    'totalCurrentAssets': '流動資產合計',
    'totalNonCurrentAssets': '非流動資產合計',
    'totalCurrentLiabilities': '流動負債合計',
    'totalNonCurrentLiabilities': '非流動負債合計',
    'cashAndCashEquivalents': '現金及約當現金',
    'shortTermInvestments': '短期投資',
    'inventory': '存貨',
    'propertyPlantAndEquipment': '不動產、廠房及設備',
    'goodwill': '商譽',
    'accountsReceivable': '應收帳款',
    'accountsPayable': '應付帳款',
    'capitalization': '股本',
    'retainedEarnings': '保留盈餘',
    
    // ========== 現金流量表 (Cash Flow Statement) ==========
    'operatingCashFlow': '營業活動現金流量',
    'investingCashFlow': '投資活動現金流量',
    'financingCashFlow': '融資活動現金流量',
    'freeCashFlow': '自由現金流量',
    'capitalExpenditures': '資本支出',
    'dividendsPaid': '發放股利',
    
    // ========== 基本資訊 ==========
    'marketCap': '市值',
    'peRatio': '本益比',
    'pegRatio': 'PEG 本益比',
    'dividendYield': '殖利率',
    'beta': 'Beta 係數',
    'fiftyTwoWeekHigh': '52週最高',
    'fiftyTwoWeekLow': '52週最低',
    'averageVolume': '平均成交量',
    'volume': '成交量'
};

/**
 * 翻譯一個欄位
 * @param {string} key - 英文欄位名稱
 * @returns {string} - 中文欄位名稱
 */
function translate(key) {
    return TRANSLATIONS[key] || key;
}

/**
 * 翻譯整個財報物件
 * @param {object} data - 原始財報資料
 * @returns {object} - 翻譯後的財報資料
 */
function translateFinancialData(data) {
    const result = {};
    
    for (const [key, value] of Object.entries(data)) {
        const chineseKey = translate(key);
        result[chineseKey] = value;
    }
    
    return result;
}

/**
 * 格式化數值
 * @param {number|null|undefined} value 
 * @returns {string}
 */
function formatValue(value) {
    if (value === null || value === undefined) {
        return '此欄位無資料';
    }
    
    if (typeof value === 'number') {
        // 大數字格式化
        if (Math.abs(value) >= 1e9) {
            return (value / 1e9).toFixed(2) + ' 億';
        } else if (Math.abs(value) >= 1e6) {
            return (value / 1e6).toFixed(2) + ' 萬';
        } else if (Math.abs(value) >= 1e4) {
            return (value / 1e4).toFixed(2) + ' 千';
        }
        
        // 一般數值格式化
        return value.toLocaleString('zh-TW', { maximumFractionDigits: 2 });
    }
    
    return String(value);
}

/**
 * 取得所有翻譯對照表
 * @returns {object}
 */
function getAllTranslations() {
    return { ...TRANSLATIONS };
}

module.exports = {
    translate,
    translateFinancialData,
    formatValue,
    getAllTranslations,
    TRANSLATIONS
};
