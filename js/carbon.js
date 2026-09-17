document.addEventListener('DOMContentLoaded', () => {
    
    // ===== 1. 初始化 Chart.js 圖表 (改為雙軸折線圖) =====
    const ctx = document.getElementById('predictionChart').getContext('2d');

    const predictionChart = new Chart(ctx, {
        type: 'line', // 改為折線圖
        data: {
            labels: [], // X 軸將放入時間標籤
            datasets: [
                {
                    label: '總功率 (W)',
                    data: [], 
                    borderColor: '#e67e22', // 橘色線條
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: '#e67e22',
                    yAxisID: 'y', // 指定使用左側 Y 軸
                    tension: 0.3, // 讓線條有平滑弧度
                    fill: true
                },
                {
                    label: '碳排放量 (g CO₂e)',
                    data: [], 
                    borderColor: '#27ae60', // 綠色線條
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: '#27ae60',
                    yAxisID: 'y1', // 指定使用右側 Y 軸
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false, // 滑鼠游標靠近時，同時顯示兩條線的當下數值
            },
            plugins: {
                legend: {
                    position: 'bottom', 
                    labels: { font: { size: 16, weight: 'bold' } }
                },
                tooltip: { enabled: true }
            },
            scales: {
                x: {
                    display: true,
                    grid: { display: false },
                    ticks: { font: { size: 14, weight: 'bold' } }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left', // 左側 Y 軸
                    title: { 
                        display: true, 
                        text: '總功率 (W)', 
                        font: { size: 14, weight: 'bold' },
                        color: '#e67e22'
                    },
                    grid: { color: 'rgba(0,0,0,0.1)' },
                    ticks: { font: { size: 14, weight: 'bold' } }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right', // 右側 Y 軸
                    title: { 
                        display: true, 
                        text: '碳排放量 (g CO₂e)', 
                        font: { size: 14, weight: 'bold' },
                        color: '#27ae60'
                    },
                    grid: { drawOnChartArea: false }, // 隱藏右側的網格線，避免與左側格線交錯導致畫面混亂
                    ticks: { font: { size: 14, weight: 'bold' } }
                }
            }
        }
    });

    // ===== 2. 碳足跡計算邏輯 (5秒輪詢) =====
    async function fetchCarbonFootprint() {
        try {
            // A, B, C, D, E 的邏輯維持不變
            const cirRes = await fetch('http://192.168.3.85:9090/circuitData/');
            if (!cirRes.ok) return;
            
            const cirData = await cirRes.json();
            const deviceList = Array.isArray(cirData) ? cirData : (cirData.data || cirData.reply || cirData.response || []);
            
            if (!deviceList || deviceList.length === 0) return;

            const targetDevice = deviceList[0];
            const deviceId = targetDevice.deviceId;
            const currentTimestamp = targetDevice.timestamp;

            const payload = { deviceId: deviceId, start: 0, end: currentTimestamp };

            const historyRes = await fetch('http://192.168.3.85:9090/history/circuitHistory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'accept': '*/*' },
                body: JSON.stringify(payload)
            });

            if (!historyRes.ok) return;
            
            let historyData = await historyRes.json();
            let records = [];

            if (typeof historyData === 'string') {
                try { historyData = JSON.parse(historyData); } catch (e) {}
            }

            if (Array.isArray(historyData)) { records = historyData; } 
            else if (historyData && Array.isArray(historyData.response)) { records = historyData.response; } 
            else if (historyData && Array.isArray(historyData.data)) { records = historyData.data; } 
            else if (historyData && Array.isArray(historyData.reply)) { records = historyData.reply; }

            if (records && records.length > 0) {
                let totalPower = 0;
                for (let i = 0; i < records.length; i++) {
                    const powerVal = parseFloat(records[i].power || 0);
                    totalPower += powerVal;
                }

                const carbonKg = (totalPower / 60000) * 0.467;
                const carbonGrams = carbonKg * 1000;

                const powerEl = document.getElementById('power-display');
                const carbonEl = document.getElementById('carbon-display');
                if (powerEl) powerEl.innerText = totalPower.toFixed(1);
                if (carbonEl) carbonEl.innerText = carbonKg.toFixed(4);

                // ===== 這裡替換為：F. 更新雙軸折線圖表 =====
                
                // 取得當前的時間 (格式：時:分:秒) 作為 X 軸標籤
                const now = new Date();
                const timeLabel = now.toLocaleTimeString('zh-TW', { hour12: false });

                // 1. 將新時間與新數據推入陣列的最尾端
                predictionChart.data.labels.push(timeLabel);
                predictionChart.data.datasets[0].data.push(totalPower);
                predictionChart.data.datasets[1].data.push(carbonGrams);

                // 2. 限制畫面上最多顯示幾筆資料 (例如 20 筆)，避免時間一長導致圖表過度擠壓或瀏覽器卡頓
                const maxPoints = 20;
                if (predictionChart.data.labels.length > maxPoints) {
                    predictionChart.data.labels.shift(); // 移除最舊的 X 軸標籤
                    predictionChart.data.datasets[0].data.shift(); // 移除最舊的 Power 數據
                    predictionChart.data.datasets[1].data.shift(); // 移除最舊的 Carbon 數據
                }

                // 3. 更新圖表畫面
                predictionChart.update();

            } else {
                console.warn("⚠️ 解析後的歷史資料筆數為 0");
            }
        } catch (error) {
            console.error("❌ 更新碳足跡時發生程式錯誤:", error);
        }
    }

    // ===== 3. 初始化與設定定時器 =====
    fetchCarbonFootprint();
    setInterval(fetchCarbonFootprint, 5000);
});