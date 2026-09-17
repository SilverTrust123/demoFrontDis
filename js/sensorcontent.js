// API 設定
const HOST = (window.location.hostname && window.location.hostname !== "") ? window.location.hostname : "192.168.3.85";
const GET_BORDER_URL = `http://192.168.3.85:9090/sensorBorder/getCurrentSensorBorder`;
const SAVE_BORDER_URL = `http://192.168.3.85:9090/sensorBorder/saveSensorBorder`;

// 建立 HTML 元素 ID 與後端 API 欄位 key 的對應關係
const FIELD_MAP = {
    'temp-max-8266_2': 'temp_1',
    'hum-max-8266_2': 'humi_1',
    'temp-max-8266_4': 'temp_2',
    'hum-max-8266_4': 'humi_2',
    'dust-max-8266_3': 'dust',
    'aq-max-8266_3': 'qua',
    'power-max-8266_5': 'pow'
};

document.addEventListener('DOMContentLoaded', () => {
    // 1. 初始化輪播切換邏輯
    initCarousel();

    // 2. 從後端 API 載入當前 Group A 的設定值並顯示在輸入框中
    fetchCurrentLimits();
});

/**
 * 輪播切換邏輯
 */
function initCarousel() {
    const track = document.getElementById('carouselTrack');
    const nextBtn = document.getElementById('nextBtn');
    const prevBtn = document.getElementById('prevBtn');

    if (!track || !nextBtn || !prevBtn) return;

    let currentIndex = 0;
    const pages = track.querySelectorAll('.carousel-page');
    const totalPages = pages.length;

    const updateSlide = () => {
        track.style.transform = `translateX(-${currentIndex * 100}%)`;
    };

    nextBtn.addEventListener('click', () => {
        if (currentIndex < totalPages - 1) {
            currentIndex++;
            updateSlide();
        }
    });

    prevBtn.addEventListener('click', () => {
        if (currentIndex > 0) {
            currentIndex--;
            updateSlide();
        }
    });
}

/**
 * 讀取 Group A 當前邊界資料並帶入輸入框
 */
async function fetchCurrentLimits() {
    try {
        const response = await fetch(GET_BORDER_URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();

        // 自動對應 API 欄位值到各個 Input
        for (const [elementId, apiKey] of Object.entries(FIELD_MAP)) {
            const el = document.getElementById(elementId);
            if (el && data[apiKey] !== undefined) {
                el.value = data[apiKey];
            }
        }
    } catch (error) {
        console.error('讀取 Sensor Border 失敗:', error);
    }
}

/**
 * 當按下任意 set 按鈕時，帶入 sensor_group=A 並覆蓋更新
 * @param {string} deviceId - 設備 ID
 * @param {string} metric - 監控指標
 * @param {string} type - 門檻類型
 * @param {string} inputId - 對應 input 元素的 ID
 */
async function saveSensorLimit(deviceId, metric, type, inputId) {
    const targetInput = document.getElementById(inputId);
    if (!targetInput) return;

    const val = targetInput.value.trim();
    if (val === "" || isNaN(val)) {
        alert("請輸入有效的數值！");
        return;
    }

    // 建立 Query Parameters
    const params = new URLSearchParams();
    
    // 固定 group 為 A
    params.append('sensor_group', 'A');

    // 撈取畫面上所有輸入框的值
    for (const [elementId, apiKey] of Object.entries(FIELD_MAP)) {
        const el = document.getElementById(elementId);
        const inputVal = el ? el.value.trim() : '0';
        params.append(apiKey, inputVal || '0');
    }

    // 組成 Request 地址：saveSensorBorder?sensor_group=A&temp_1=...&temp_2=...
    const targetUrl = `${SAVE_BORDER_URL}?${params.toString()}`;

    try {
        const response = await fetch(targetUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const result = await response.json();
        alert(`設定更新成功！目前該項門檻值為：${val}`);
    } catch (error) {
        console.error('覆蓋 Sensor Border 失敗:', error);
        alert('設定失敗，請確認後端服務狀態。');
    }
}