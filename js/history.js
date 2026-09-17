let mainChart = null;
let currentMode = 'temp'; // 預設顯示模式

// --- 1. 圖表配置與欄位對應 ---
// truncateEndpoint 存放各感測器對應之清空資料 GET 接口
const configs = {
    temp: { 
        label: 'Temperature 1', 
        color: '#b24b4b', 
        key: 'temperature', 
        unit: '溫度 1 (°C)', 
        endpoint: '/history/temparatureAndHumidityHistory',
        truncateEndpoint: '/temperatureAndHumidityData/truncateAllTemparatureAndHumidityData',
        deviceId: '8266_2' 
    },
    humi: { 
        label: 'Humidity 1', 
        color: '#e08e45', 
        key: 'humidity', 
        unit: '濕度 1 (%)', 
        endpoint: '/history/temparatureAndHumidityHistory',
        truncateEndpoint: '/temperatureAndHumidityData/truncateAllTemparatureAndHumidityData',
        deviceId: '8266_2' 
    },
    temp2: { 
        label: 'Temperature 2', 
        color: '#ff6b6b', 
        key: 'temperature', 
        unit: '溫度 2 (°C)', 
        endpoint: '/history/temparatureAndHumidityHistory',
        truncateEndpoint: '/temperatureAndHumidityData/truncateAllTemparatureAndHumidityData',
        deviceId: '8266_4' 
    },
    humi2: { 
        label: 'Humidity 2', 
        color: '#c08552', 
        key: 'humidity', 
        unit: '濕度 2 (%)', 
        endpoint: '/history/temperatureAndHumidityHistory',
        truncateEndpoint: '/temperatureAndHumidityData/truncateAllTemparatureAndHumidityData',
        deviceId: '8266_4'
    },
    co2: { 
        label: 'CO2 Concentration', 
        color: '#d4af37', 
        key: 'airPollution', 
        unit: 'CO2 (ppm)', 
        endpoint: '/history/airQualityHistory',
        truncateEndpoint: '/airQualityData/truncateAllAirQualityData',
        deviceId: '8266_3'
    },
    pm: { 
        label: 'PM2.5', 
        color: '#763dc6', 
        key: 'pm2_5', 
        unit: '污染 (μg/m³)', 
        endpoint: '/history/airParticulatesHistory',
        truncateEndpoint: '/airParticulatesData/truncateAllAirParticulatesData',
        deviceId: '8266_1'
    },
    power: { 
        label: 'Power Usage', 
        color: '#2d6a4f', 
        key: 'current', 
        unit: '電流 (kW)', 
        endpoint: '/history/circuitHistory',
        truncateEndpoint: '/circuitData/truncateAllCircuitData',
        deviceId: '8266_5'
    }
};

/**
 * 初始化圖表 (縱軸從 0 開始)
 */
function initChart() {
    const canvas = document.getElementById('historyChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    mainChart = new Chart(ctx, {
        type: 'line',
        data: { 
            labels: [], 
            datasets: [{ 
                data: [], 
                borderWidth: 3, 
                tension: 0.3,
                fill: false,
                backgroundColor: 'transparent',
                pointRadius: 4,
                pointBackgroundColor: '#fff'
            }] 
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 300 // 因每秒刷新，將動畫縮短為 300ms 讓畫面流暢
            },
            plugins: { 
                legend: { display: false },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: {
                    title: { display: true, text: '時間', font: { size: 14, weight: 'bold' } }
                },
                y: {
                    title: { display: true, text: '數值', font: { size: 14, weight: 'bold' } },
                    beginAtZero: true, 
                    min: 0
                }
            }
        }
    });

    updateChartData(); 
}

/**
 * 格式化 UNIX Timestamp (秒轉為 HH:mm:ss)
 */
function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const ts = String(timestamp).length === 10 ? timestamp * 1000 : timestamp;
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * 從 API 抓取數據並只顯示最新的 20 筆
 */
async function updateChartData() {
    if (!mainChart) return;

    const config = configs[currentMode];
    if (!config) return;

    const requestPayload = {
        deviceId: config.deviceId,
        start: 0,
        end: Math.floor(Date.now() / 1000)
    };

    try {
        // 使用 CONFIG.API_BASE 並透過 fetchWithAuth 發送帶有 Token 的請求
        const apiBase = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE) ? CONFIG.API_BASE : 'http://192.168.3.85:9090';
        const response = await fetchWithAuth(`${apiBase}${config.endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestPayload)
        });

        if (!response.ok) return;

        let resData = await response.json();

        let historyArray = [];
        if (Array.isArray(resData)) {
            historyArray = resData;
        } else if (typeof resData === 'object' && resData !== null) {
            const firstArrayKey = Object.keys(resData).find(k => Array.isArray(resData[k]));
            if (firstArrayKey) {
                historyArray = resData[firstArrayKey];
            }
        }

        // 取陣列最後 20 筆資料 (最新資料)
        const recentData = historyArray.slice(-20);

        // 更新 X 軸標籤與 Y 軸數據
        mainChart.data.labels = recentData.map(d => formatTimestamp(d.timestamp));
        mainChart.data.datasets[0].data = recentData.map(d => d[config.key] ?? 0);
        
        // 更新顏色與單位
        mainChart.data.datasets[0].borderColor = config.color;
        mainChart.data.datasets[0].pointBorderColor = config.color;
        mainChart.options.scales.y.title.text = config.unit;

        // 更新 UI 標題
        const labelEl = document.getElementById('current-chart-label');
        if (labelEl) {
            labelEl.innerText = config.label;
            labelEl.style.color = config.color;
        }

        mainChart.update();

    } catch (e) {
        console.error(`[History] API 連線失敗:`, e);
    }
}

/**
 * 綁定頁籤切換事件
 */
function bindTabEvents() {
    const buttons = document.querySelectorAll('.tab-btn');
    
    // 初始化：設定當前預設按鈕 (currentMode) 的 active Class
    const activeBtn = document.querySelector(`.tab-btn[data-target="${currentMode}"]`);
    if (activeBtn) {
        buttons.forEach(b => {
            const colorClasses = Object.keys(configs).map(key => `active-${key}`);
            b.classList.remove('active', ...colorClasses);
        });
        activeBtn.classList.add('active', `active-${currentMode}`);
    }

    // 綁定點擊切換事件
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget.getAttribute('data-target');
            if (!configs[target]) return;

            buttons.forEach(b => {
                const colorClasses = Object.keys(configs).map(key => `active-${key}`);
                b.classList.remove('active', ...colorClasses);
            });
            e.currentTarget.classList.add('active', `active-${target}`);

            currentMode = target;
            updateChartData();
        });
    });
}

/**
 * 綁定清除歷史資料按鈕點擊事件 (帶有 Token 驗證)
 */
function bindClearDataEvent() {
    const clearBtn = document.getElementById('clear-history-btn');
    if (!clearBtn) return;

    clearBtn.addEventListener('click', async () => {
        const config = configs[currentMode];
        if (!config || !config.truncateEndpoint) return;

        const isConfirmed = confirm(`確定要清除【${config.label}】的所有歷史資料嗎？此動作無法復原。`);
        if (!isConfirmed) return;

        try {
            // 使用 global.js 提供之 CONFIG 與 fetchWithAuth 自動攜帶 Authorization Token
            const apiBase = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE) ? CONFIG.API_BASE : 'http://192.168.3.85:9090';
            const response = await fetchWithAuth(`${apiBase}${config.truncateEndpoint}`, {
                method: 'GET'
            });

            if (response.ok) {
                alert(`已成功清除【${config.label}】的歷史資料！`);
                updateChartData(); // 立即重新整理圖表畫面
            } else if (response.status === 401 || response.status === 403) {
                alert('權限不足或 Token 已過期，請重新登入！');
                // 若有登入彈窗可在此自動開啟
                const loginModal = document.getElementById('login-modal-overlay');
                if (loginModal) loginModal.style.display = 'block';
            } else {
                alert(`清除失敗，伺服器回應狀態碼：${response.status}`);
            }
        } catch (e) {
            console.error(`[Clear Data] API 連線失敗:`, e);
            alert('清除失敗，請確認網路連線或後端服務是否正常。');
        }
    });
}

// 供 global.js 在登入成功後重新撈取資料使用
window.refreshLogUI = function() {
    updateChartData();
};

// 每 1 秒刷新一次資料
setInterval(updateChartData, 1000); 

window.addEventListener('load', () => {
    initChart();
    bindTabEvents();
    bindClearDataEvent();
});