// 感測器圖文資料庫：新增 deviceId 用於比對 API 回傳資料
const sensorGroups = {
    1: [
        { 
            name: "溫濕度感測器B", 
            img: "../picture/sensor_temp_b.png", 
            deviceId: "8266_2" // 對應溫濕度裝置 ID
        },
        { 
            name: "灰塵感測器", 
            img: "../picture/sensor_dust.png", 
            deviceId: "8266_3" // 對應空氣品質/灰塵裝置 ID
        },
        { 
            name: "空氣品質感測器", 
            img: "../picture/sensor_air.png", 
            deviceId: "8266_3" // 對應空氣品質裝置 ID
        }
    ],
    2: [
        { 
            name: "溫濕度感測器A", 
            img: "../picture/sensor_temp_a.png", 
            deviceId: "8266_4" // 對應溫濕度裝置 ID
        },
        { 
            name: "電力感測器", 
            img: "../picture/sensor_power.png", 
            deviceId: "8266_5" // 對應電力裝置 ID (cir)
        }
    ]
};

/**
 * 查詢 API 並檢查特定 deviceId 是否處於啟動狀態
 * @param {string} targetDeviceId - 欲查詢的裝置 ID
 * @returns {Promise<boolean>} - 是否在 API 列表中且正常回傳資料
 */
async function checkSensorStatus(targetDeviceId) {
    try {
        const response = await fetch("http://192.168.3.85:9090/allData/allSenosrData");
        if (!response.ok) return false;

        const data = await response.json();

        // 遍歷 API 回傳 JSON 物件中的所有陣列 (例如 temp, cir, aq 等)
        for (const categoryKey in data) {
            const deviceList = data[categoryKey];
            if (Array.isArray(deviceList)) {
                const foundDevice = deviceList.find(device => device.deviceId === targetDeviceId);
                if (foundDevice) {
                    return true; // 找到對應 deviceId，代表裝置已啟動
                }
            }
        }
        return false; // 未找到裝置
    } catch (error) {
        console.error("無法取得感測器 API 資料:", error);
        return false;
    }
}

/**
 * 點擊橘色點點時觸發：
 * 1. 移除地圖置中的 Class，讓地圖往右滑動
 * 2. 異步向 API 請求資料並渲染卡片狀態
 * @param {number} groupId - 1 代表左下點點，2 代表右上點點
 */
async function showGroup(groupId) {
    const layoutContainer = document.getElementById("layout-container");
    const detailsContainer = document.getElementById("sensor-details");
    const groupData = sensorGroups[groupId];

    if (!detailsContainer || !groupData) return;

    // 1. 移除置中模式，觸發滑動至右側的動畫
    if (layoutContainer) {
        layoutContainer.classList.remove("is-centered");
    }

    // 先顯示載入中提示
    detailsContainer.innerHTML = '<div style="font-size:20px; font-weight:bold; color:#666;">載入感測器狀態中...</div>';

    // 2. 併發請求檢查該組所有感測器的狀態
    const cardsHtml = await Promise.all(
        groupData.map(async (sensor) => {
            const isOnline = await checkSensorStatus(sensor.deviceId);
            const statusText = isOnline ? "狀態：已啟動" : "狀態：未啟動";
            const statusColorStyle = isOnline ? "color: #2e7d32;" : "color: #d32f2f;"; // 啟動顯示綠字，未啟動顯示紅字

            return `
                <div class="sensor-card">
                    <img src="${sensor.img}" alt="${sensor.name}" onerror="this.src='../picture/sensorplace.png'">
                    <h3>${sensor.name}</h3>
                    <p class="status" style="${statusColorStyle}">${statusText}</p>
                </div>
            `;
        })
    );

    // 3. 渲染至左側區塊
    detailsContainer.innerHTML = `<div class="card-list">${cardsHtml.join("")}</div>`;
}