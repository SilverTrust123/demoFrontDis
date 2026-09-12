document.addEventListener('DOMContentLoaded', () => {
    const ctx = document.getElementById('predictionChart').getContext('2d');

    // 1. PLC 預設參數 (單位: 秒)
    const DEFAULT_PARAMS = {
        "T14": 5.0, "T0": 0.5, "T7": 1.0,
        "T30": 1.0, "T3": 1.0, "T4": 1.0, "T31": 1.0, "T5": 1.0, "T6": 1.0, "T15": 5.0,
        "T8": 1.0, "T9": 1.0, "T32": 1.0, "T10": 1.0, "T11": 1.0,
        "T40": 1.0, "T12": 1.0, "T13": 1.0
    };

    // 2. PLC 狀態字典與動作時間
    const PLC_STATES = {
        1:  { text: "S1 等待物料", animTime: 1.62, waitParam: "T14" },
        10: { text: "S10 龍門向右預位", animTime: 3.68, waitParam: "T30" },
        11: { text: "S11 龍門向下預位", animTime: 1.27, waitParam: "T3" },
        12: { text: "S12 夾持工作, 龍門向上", animTime: 2.47, waitParam: "T4" },
        13: { text: "S13 龍門向左", animTime: 4.64, waitParam: "T31" },
        14: { text: "S14 龍門向下", animTime: 2.36, waitParam: "T5" },
        15: { text: "S15 放開夾爪", animTime: 0.17, waitParam: "T6" },
        16: { text: "S16 龍門向上", animTime: 1.56, waitParam: "T15" },
        17: { text: "S17 輸送帶2", animTime: 1.21, waitParam: "T7" },
        18: { text: "S18 轉臂向下", animTime: 0.62, waitParam: "T8" },
        19: { text: "S19 吸附工件", animTime: 0.49, waitParam: "T9" },
        20: { text: "S20 吸盤向上", animTime: 0.10, waitParam: "T32" }, 
        21: { text: "S21 吸盤旋轉向下", animTime: 1.62, waitParam: "T10" },
        22: { text: "S22 解真空", animTime: 0.10, waitParam: "T11" },
        23: { text: "S23 吸盤向上", animTime: 0.59 }, 
        24: { text: "S24 吸盤歸位", animTime: 0.83 },
        30: { text: "S30 滑台向左", animTime: 1.00 },
        31: { text: "S31 滑台向下", animTime: 0.20, waitParam: "T40" },
        32: { text: "S32 夾持工件", animTime: 0.30, waitParam: "T12" },
        33: { text: "S33 滑台向上", animTime: 0.5 },
        34: { text: "S34 滑台向右", animTime: 1.00 },
        35: { text: "S35 滑台向下", animTime: 0.50 },
        36: { text: "S36 放開工件", animTime: 0.30, waitParam: "T13" },
        37: { text: "S37 滑台向上", animTime: 0.5 },
        50: { text: "S50 系統急停", animTime: 0.1 } 
    };

    // 3. 嚴格對齊指示：S1(包含 T14) 雙邊皆計入
    // 金屬序列: S1 ~ S24
    const seqMetalFull = [1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
    // 非金屬序列: S1 + S30 ~ S37
    const seqNonMetalFull = [1, 30, 31, 32, 33, 34, 35, 36, 37];

    let currentParams = { ...DEFAULT_PARAMS };

    // 計算特定序列總循環時間的函式
    function calculateSequenceCycleTime(sequence, params) {
        let totalTime = 0;
        sequence.forEach(state => {
            const step = PLC_STATES[state];
            if (step) {
                totalTime += step.animTime || 0; // 累加硬體動作時間
                
                if (step.waitParam && params[step.waitParam] !== undefined) {
                    let waitSec = params[step.waitParam];
                    if (waitSec < 99) { // 防呆：剔除異常或停機等待值
                        totalTime += waitSec;
                    }
                }
            }
        });
        return totalTime;
    }

    // 初始化 Chart.js
    const predictionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['今日產能評估 (8hr)'],
            datasets: [
                {
                    label: '預測今日總產量',
                    data: [0],
                    backgroundColor: '#3498db',
                    barThickness: 60
                },
                {
                    label: '目前累積實際產量',
                    data: [0],
                    backgroundColor: '#e67e22',
                    barThickness: 60
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { font: { size: 16, weight: 'bold' } }
                },
                tooltip: { enabled: true }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { display: false },
                    ticks: { font: { size: 14, weight: 'bold' } }
                },
                y: {
                    grid: { display: false },
                    ticks: { font: { size: 18, weight: 'bold' } }
                }
            }
        }
    });

    // ⚡ 4. 從三個 API 取得即時數據，計算「預測產能」與「實際累積產能」
    async function fetchAndUpdateData() {
        let actualCount = 0;
        let dailyPrediction = 0;

        try {
            // 同時請求三支 API：參數、金屬產量、非金屬產量
            const [resDPoint, resMetal, resNonMetal] = await Promise.all([
                fetch('http://192.168.3.85:9090/plc/AllDPointData').then(r => r.ok ? r.json() : null).catch(() => null),
                fetch('http://192.168.3.85:9090/plc/getCountMetal').then(r => r.ok ? r.json() : { count: 0 }).catch(() => ({ count: 0 })),
                fetch('http://192.168.3.85:9090/plc/getCountNonMetal').then(r => r.ok ? r.json() : { count: 0 }).catch(() => ({ count: 0 }))
            ]);

            // ⚡ 結合金屬與非金屬實際數量
            actualCount = (resMetal.count || 0) + (resNonMetal.count || 0);

            if (resDPoint && resDPoint.reply) {
                const reply = resDPoint.reply;

                // API 的時間數值單位為 0.1 秒，轉換為秒 (例如 50 -> 5.0s)
                Object.keys(DEFAULT_PARAMS).forEach(key => {
                    if (reply[key] !== undefined) {
                        currentParams[key] = reply[key] / 10;
                    }
                });

                // 分別精算金屬與非金屬循環時間
                const metalCycleTime = calculateSequenceCycleTime(seqMetalFull, currentParams);
                const nonMetalCycleTime = calculateSequenceCycleTime(seqNonMetalFull, currentParams);

                // 計算各自 UPH (每小時產量)，並相加
                const metalUPH = metalCycleTime > 0 ? (3600 / metalCycleTime) : 0;
                const nonMetalUPH = nonMetalCycleTime > 0 ? (3600 / nonMetalCycleTime) : 0;
                const totalUPH = metalUPH + nonMetalUPH;
                
                // 預測今日產出：UPH 乘以 8 小時
                dailyPrediction = Math.round(totalUPH * 8);

                // --- 動態更新畫面的藍色公式面板數字 ---
                const metalEl = document.getElementById('metal-ct');
                const nonmetalEl = document.getElementById('nonmetal-ct');
                const predictEl = document.getElementById('predict-total');
                
                if (metalEl) metalEl.innerText = metalCycleTime.toFixed(1);
                if (nonmetalEl) nonmetalEl.innerText = nonMetalCycleTime.toFixed(1);
                if (predictEl) predictEl.innerText = dailyPrediction;

            } else {
                throw new Error("無法取得機台即時時間參數");
            }
        } catch (error) {
            console.error('抓取 API 資料發生錯誤，將使用預設值計算預測產量：', error);

            // 斷線降級處理：使用預設值計算預測產量
            const metalCycleTime = calculateSequenceCycleTime(seqMetalFull, DEFAULT_PARAMS);
            const nonMetalCycleTime = calculateSequenceCycleTime(seqNonMetalFull, DEFAULT_PARAMS);
            const metalUPH = metalCycleTime > 0 ? (3600 / metalCycleTime) : 0;
            const nonMetalUPH = nonMetalCycleTime > 0 ? (3600 / nonMetalCycleTime) : 0;
            dailyPrediction = Math.round((metalUPH + nonMetalUPH) * 8);

            const metalEl = document.getElementById('metal-ct');
            const nonmetalEl = document.getElementById('nonmetal-ct');
            const predictEl = document.getElementById('predict-total');
            if (metalEl) metalEl.innerText = metalCycleTime.toFixed(1);
            if (nonmetalEl) nonmetalEl.innerText = nonMetalCycleTime.toFixed(1);
            if (predictEl) predictEl.innerText = dailyPrediction;
        } finally {
            // --- 無論預測產量計算成功或使用預設值，最後都更新圖表 ---
            predictionChart.data.datasets[0].data = [dailyPrediction];
            predictionChart.data.datasets[1].data = [actualCount];
            predictionChart.update();
        }
    }

    // 首次載入並設定每 5 秒自動刷新
    fetchAndUpdateData();
    setInterval(fetchAndUpdateData, 5000);
});