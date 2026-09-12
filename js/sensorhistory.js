document.addEventListener('DOMContentLoaded', () => {
    const BASE_URL = 'http://192.168.3.85:9090';

    // DOM 元素
    const sensorSelect = document.getElementById('sensor-select');
    const btnToday = document.getElementById('btn-today');
    const btnWeek = document.getElementById('btn-week');
    const btnMonth = document.getElementById('btn-month');
    const btnCustom = document.getElementById('btn-custom');
    
    const startPicker = document.getElementById('custom-start-picker');
    const endPicker = document.getElementById('custom-end-picker');
    
    const dateGroup = document.getElementById('date-display-group');
    const startDisplay = document.getElementById('display-date-start');
    const endDisplay = document.getElementById('display-date-end');
    const tableBody = document.getElementById('data-table-body');
    const tableHeaderRow = document.querySelector('.history-table thead tr');

    // 狀態變數
    let currentStartDate = null;
    let currentEndDate = null;
    let pollingInterval = null;
    let lastRenderedTimestamp = null;

    // 感測器 ID 對應的 API 路由、即時資料 Key 與欄位設定
    const SENSOR_CONFIG = {
        '8266_2': {
            endpoint: '/history/temparatureAndHumidityHistory',
            realtimeKey: 'temp',
            type: 'temp_hum',
            headers: ['時間戳記', '設備 ID', '溫度 (°C)', '濕度 (%)']
        },
        '8266_4': {
            endpoint: '/history/temparatureAndHumidityHistory',
            realtimeKey: 'temp',
            type: 'temp_hum',
            headers: ['時間戳記', '設備 ID', '溫度 (°C)', '濕度 (%)']
        },
        '8266_5': {
            endpoint: '/history/circuitHistory',
            realtimeKey: 'circuit',
            type: 'circuit',
            headers: ['時間戳記', '設備 ID', '電流 (A)']
        },
        '8266_3': {
            endpoint: '/history/airQualityHistory',
            realtimeKey: 'co2',
            type: 'air_quality',
            headers: ['時間戳記', '設備 ID', 'CO2 (ppm)']
        },
        '8266_6': {
            endpoint: '/history/airParticulatesHistory',
            realtimeKey: 'aq',
            type: 'pm25',
            headers: ['時間戳記', '設備 ID', '懸浮微粒 (μg/m³)']
        }
    };

    // 格式化日期：YYYY/MM/DD
    const formatDate = (dateObj) => {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return `${y}/${m}/${d}`;
    };

    // 格式化時間戳記：YYYY-MM-DD HH:mm:ss
    const formatFullTime = (ts) => {
        const date = new Date(ts * 1000);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        const ss = String(date.getSeconds()).padStart(2, '0');
        return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
    };

    // 設定日期顯示並觸發查詢
    const setRange = (startDate, endDate) => {
        currentStartDate = startDate;
        currentEndDate = endDate;
        startDisplay.value = formatDate(startDate);
        endDisplay.value = formatDate(endDate);
        dateGroup.classList.remove('hidden');

        fetchDataAndRender();
    };

    // 1. 歷史資料 API 呼叫
    async function fetchHistoryData(deviceId, startTs, endTs) {
        const config = SENSOR_CONFIG[deviceId];
        if (!config) return [];

        try {
            const response = await fetch(`${BASE_URL}${config.endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'accept': '*/*'
                },
                body: JSON.stringify({
                    deviceId: deviceId,
                    start: startTs,
                    end: endTs
                })
            });

            if (!response.ok) throw new Error('歷史數據查詢失敗');
            const resData = await response.json();

            return Array.isArray(resData) ? resData : (resData.response || []);
        } catch (error) {
            console.error('取得歷史資料失敗:', error);
            return [];
        }
    }

    // 2. 即時輪詢 API 呼叫
    async function fetchRealtimeData(deviceId, config) {
        try {
            const response = await fetch(`${BASE_URL}/allData/allSenosrData`);
            if (!response.ok) throw new Error('輪詢失敗');
            const data = await response.json();
            
            const list = data ? data[config.realtimeKey] : null;
            if (Array.isArray(list)) {
                return list.find(item => item.deviceId === deviceId);
            }
        } catch (error) {
            console.error('即時輪詢失敗:', error);
        }
        return null;
    }

    // 3. 動態更新表格標頭 <thead>
    function updateTableHeader(config) {
        if (!tableHeaderRow || !config) return;
        tableHeaderRow.innerHTML = config.headers.map(h => `<th>${h}</th>`).join('');
    }

    // 4. 根據感測器類型產生表格行 HTML
    function buildRowHTML(item, config) {
        const timeStr = formatFullTime(item.timestamp);
        switch (config.type) {
            case 'temp_hum':
                return `<td>${timeStr}</td><td>${item.deviceId}</td><td>${item.temperature ?? '-'} °C</td><td>${item.humidity ?? '-'} %</td>`;
            case 'circuit':
                return `<td>${timeStr}</td><td>${item.deviceId}</td><td>${item.current ?? '-'} A</td>`;
            case 'air_quality':
                return `<td>${timeStr}</td><td>${item.deviceId}</td><td>${item.co2 ?? '-'} ppm</td>`;
            case 'pm25':
                return `<td>${timeStr}</td><td>${item.deviceId}</td><td>${item.airPollution ?? '-'} μg/m³</td>`;
            default:
                return '';
        }
    }

    // 5. 渲染數據表格內容
    function renderTable(dataList, config) {
        const colSpan = config ? config.headers.length : 4;

        if (!Array.isArray(dataList) || dataList.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align: center; color: #888;">查無歷史資料</td></tr>`;
            return;
        }

        dataList.sort((a, b) => b.timestamp - a.timestamp);
        lastRenderedTimestamp = dataList[0].timestamp;

        tableBody.innerHTML = dataList.map(item => `
            <tr>${buildRowHTML(item, config)}</tr>
        `).join('');
    }

    // 6. 新增輪詢最新資料至頂端
    function prependTableRow(item, config) {
        if (!item || item.timestamp === lastRenderedTimestamp) return;

        lastRenderedTimestamp = item.timestamp;
        const newRow = document.createElement('tr');
        newRow.style.backgroundColor = '#e8f5e9';
        newRow.innerHTML = buildRowHTML(item, config);

        tableBody.insertBefore(newRow, tableBody.firstChild);

        setTimeout(() => {
            newRow.style.backgroundColor = '';
        }, 1500);
    }

    // 7. 資料查詢與輪詢流程
    async function fetchDataAndRender() {
        stopPolling();
        const deviceId = sensorSelect.value;
        if (!deviceId || !currentStartDate || !currentEndDate) return;

        const config = SENSOR_CONFIG[deviceId];
        if (!config) return;

        updateTableHeader(config);

        const startTs = Math.floor(new Date(currentStartDate.setHours(0,0,0,0)).getTime() / 1000);
        const endTs = Math.floor(new Date(currentEndDate.setHours(23,59,59,999)).getTime() / 1000);

        tableBody.innerHTML = `<tr><td colspan="${config.headers.length}" style="text-align: center;">資料載入中...</td></tr>`;

        const historyList = await fetchHistoryData(deviceId, startTs, endTs);
        renderTable(historyList, config);

        const isToday = new Date().toDateString() === currentEndDate.toDateString();
        if (isToday) {
            startPolling(deviceId, config);
        }
    }

    function startPolling(deviceId, config) {
        pollingInterval = setInterval(async () => {
            const latest = await fetchRealtimeData(deviceId, config);
            if (latest) {
                prependTableRow(latest, config);
            }
        }, 5000);
    }

    function stopPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }

    // ===== 事件監聽 =====
    sensorSelect.addEventListener('change', fetchDataAndRender);

    btnToday.addEventListener('click', () => {
        const today = new Date();
        setRange(today, today);
    });

    btnWeek.addEventListener('click', () => {
        const now = new Date();
        const day = now.getDay() || 7;
        const monday = new Date(now);
        monday.setDate(now.getDate() - day + 1);
        setRange(monday, now);
    });

    btnMonth.addEventListener('click', () => {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        setRange(firstDay, now);
    });

    btnCustom.addEventListener('click', () => {
        startPicker.showPicker();
    });

    startPicker.addEventListener('change', () => {
        if (startPicker.value) endPicker.showPicker();
    });

    endPicker.addEventListener('change', () => {
        if (startPicker.value && endPicker.value) {
            const s = new Date(startPicker.value);
            const e = new Date(endPicker.value);

            if (s > e) {
                alert("開始日期不能晚於結束日期");
                return;
            }
            setRange(s, e);
        }
    });
});