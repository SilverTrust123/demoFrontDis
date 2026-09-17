document.addEventListener("DOMContentLoaded", () => {
    
    // --- 1. 配置與 API 端點 ---
    const HOST = window.location.hostname || "192.168.3.85";
    const ENDPOINTS = {
        ALL: `${CONFIG.API_BASE}/allData/allSenosrData`,
        TH: `${CONFIG.API_BASE}/temperatureAndHumidityData/`,
        CIRCUIT: `${CONFIG.API_BASE}/circuitData/`,
        CO2_DATA: `${CONFIG.API_BASE}/airQualityData/`,      
        PM25_DATA: `${CONFIG.API_BASE}/airParticulatesData/`,
        PLC_STATE: `http://192.168.3.85:9090/plc/state`,
        COUNT_METAL: `http://192.168.3.85:9090/plc/getCountMetal`,
        COUNT_NONMETAL: `http://192.168.3.85:9090/plc/getCountNonMetal`
    };

    // PLC 狀態碼與最下方 5 個設備 (0~4) 的對應關係
    const stateToDeviceMap = {
        "S1": 0,  // 輸送帶1
        "S10": 2, "S11": 2, "S12": 2, "S13": 2, "S14": 2, "S15": 2, "S16": 2, // 龍門機械臂 (金屬)
        "S17": 3, // 輸送帶2
        "S18": 4, "S19": 4, "S20": 4, "S21": 4, "S22": 4, "S23": 4, "S24": 4, // 旋轉缸臂 (非金屬)
        "S30": 1, "S31": 1, "S32": 1, "S33": 1, "S34": 1, "S35": 1, "S36": 1, "S37": 1  // 滑台缸臂
    };

    let gaugeConfigs = {};

    // --- 製程時間與計時控制變數 ---
    let currentMode = null;       // 'metal' | 'nonmetal' | null
    let isRunning = false;        // 記錄目前是否處於有效的 S 步驟運轉狀態
    let lastActiveTime = null;   // 計算每段運轉間隔的時間戳
    let metalElapsed = 0;        // 金屬累計秒數
    let nonmetalElapsed = 0;     // 非金屬累計秒數
    let timerInterval = null;
    let lastState = null;

    // --- 2. 核心數據處理 ---

    async function fetchJson(url) {
        try {
            const res = await fetch(url, { 
                method: 'GET', 
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(500) 
            });
            if (res.ok) return await res.json();
        } catch (e) {
            console.warn(`請求失敗: ${url}`);
        }
        return null;
    }

    function saveToHistory(data) {
        let history = JSON.parse(localStorage.getItem('sensorHistory') || '[]');
        
        const newEntry = {
            time: new Date().toLocaleTimeString('zh-TW', { 
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit' 
            }),
            temp:  data.temp1,
            humi:  data.humi1,
            temp2: data.temp2,
            humi2: data.humi2,
            co2:   data.co2,
            pm:    data.pm,
            power: data.power
        };

        history.push(newEntry);
        if (history.length > 30) history.shift();
        localStorage.setItem('sensorHistory', JSON.stringify(history));
    }

    // --- 3. UI 工具函式與時間格式化 ---

    function formatTime(totalSeconds) {
        const hrs = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
        const mins = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
        const secs = String(Math.floor(totalSeconds % 60)).padStart(2, '0');
        return `${hrs}:${mins}:${secs}`;
    }

    function updateLampStatus(lampId, isOnline) {
        const el = document.getElementById(lampId);
        if (!el) return;
        if (isOnline) {
            el.classList.remove('lamp-red');
            el.classList.add('lamp-green');
        } else {
            el.classList.remove('lamp-green');
            el.classList.add('lamp-red');
        }
    }

    function setupGauge(id) {
        const ring = document.getElementById(id);
        if (!ring) return null;
        const length = ring.getTotalLength();
        ring.style.strokeDasharray = length;
        ring.style.strokeDashoffset = length; 
        ring.style.transition = "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)";
        return length;
    }

    function updateGauge(id, value, max, length) {
        const ring = document.getElementById(id);
        if (!ring || !length) return;
        const ratio = Math.max(0, Math.min(value / max, 1));
        const offset = length * (1 - ratio);
        ring.style.strokeDashoffset = offset;
    }

    function updateTextBySelector(selector, val, unit) {
        const displayEl = document.querySelector(selector);
        if (displayEl) {
            const formattedVal = typeof val === 'number' ? val.toFixed(1) : "0.0";
            displayEl.innerHTML = `${formattedVal}${unit}`;
        }
    }

    /**
     * 更新設備連接與運轉狀態文字
     * @param {boolean} isConnected 設備連接狀態
     * @param {boolean} isRunYes 運轉狀態是否為 yes
     */
    function updateStatusUI(isConnected, isRunYes) {
        const connEl = document.getElementById("conn-status");
        const runEl = document.getElementById("run-status");

        if (connEl) {
            connEl.innerText = isConnected ? "yes" : "no";
            connEl.className = isConnected ? "v-green" : "v-red";
        }

        if (runEl) {
            runEl.innerText = isRunYes ? "yes" : "no";
            runEl.className = isRunYes ? "v-green" : "v-red";
        }
    }

    function updateBottomDevices(rawState) {
        const stateKey = rawState ? `S${rawState}` : "";
        const activeDeviceIndex = stateToDeviceMap[stateKey] ?? -1;

        const deviceItems = document.querySelectorAll('.device-item');
        deviceItems.forEach((item, index) => {
            const lamp = item.querySelector('.lamp');
            if (lamp) {
                const isActive = (index === activeDeviceIndex);
                lamp.innerText = isActive ? "○" : "×";
                lamp.className = isActive ? "lamp lamp-ok" : "lamp lamp-fail";
            }
        });
    }

    /**
     * 製程計時狀態機邏輯 (同時決定運轉狀態 Run Status)
     * @param {string|number|null} rawState PLC 回傳的狀態
     * @returns {boolean} 是否應顯示 yes
     */
    function processProcessTimer(rawState) {
        // 1. 若無傳入值、傳入 "0"、傳入 50 / "50" (急停) 或 null -> 視為停止 (No)
        if (!rawState || rawState === "0" || rawState === 50 || rawState === "50") {
            stopTimer();
            return false;
        }

        const stateNum = parseInt(rawState, 10);
        if (isNaN(stateNum)) {
            stopTimer();
            return false;
        }

        // 2. 判斷是否為金屬步驟 (10~24) 或非金屬步驟 (30~37) 以進行計時
        const isMetalStep = (stateNum >= 10 && stateNum <= 24);
        const isNonMetalStep = (stateNum >= 30 && stateNum <= 37);

        if (isMetalStep) {
            currentMode = 'metal';
        } else if (isNonMetalStep) {
            currentMode = 'nonmetal';
        }

        if (!isRunning && (isMetalStep || isNonMetalStep)) {
            isRunning = true;
            lastActiveTime = Date.now();
        }

        lastState = `S${rawState}`;
        
        // ⚡ 只要不是 S50 且有抓到有效狀態，運轉狀態皆顯示 yes
        return true;
    }

    // 輔助函式：停止計時並重置基準時間
    function stopTimer() {
        isRunning = false;
        lastActiveTime = null;
        lastState = null;
    }

    /**
     * 更新時間累計與畫面顯示 (由 setInterval 每 200ms 觸發)
     */
    function updateTimerDisplay() {
        const now = Date.now();

        if (isRunning && lastActiveTime) {
            const deltaSeconds = (now - lastActiveTime) / 1000;

            if (currentMode === 'metal') {
                metalElapsed += deltaSeconds;
            } else if (currentMode === 'nonmetal') {
                nonmetalElapsed += deltaSeconds;
            }

            lastActiveTime = now;
        }

        const metalEl = document.getElementById("metal-timer");
        const nonmetalEl = document.getElementById("nonmetal-timer");

        if (metalEl) metalEl.innerText = formatTime(metalElapsed);
        if (nonmetalEl) nonmetalEl.innerText = formatTime(nonmetalElapsed);
    }

    /**
     * 更新當前金屬與非金屬的產量數據
     */
    function updateProductionCounts(metalData, nonmetalData) {
        const metalCountEl = document.getElementById("metal-count");
        const nonmetalCountEl = document.getElementById("nonmetal-count");

        if (metalCountEl && metalData && typeof metalData.count === "number") {
            metalCountEl.innerText = metalData.count;
        }

        if (nonmetalCountEl && nonmetalData && typeof nonmetalData.count === "number") {
            nonmetalCountEl.innerText = nonmetalData.count;
        }
    }

    // --- 4. 初始化與主循環 ---
    async function initDashboard() {
        gaugeConfigs = {
            temp1: { id: "temp-fill-1", len: setupGauge("temp-fill-1"), max: 70,   unit: "°C", selector: ".area-lt .gauge-box:nth-of-type(1) .gauge-value" },
            humi1: { id: "humi-fill-1", len: setupGauge("humi-fill-1"), max: 100,  unit: "%",  selector: ".area-lt .gauge-box:nth-of-type(2) .gauge-value" },
            temp2: { id: "temp-fill-2", len: setupGauge("temp-fill-2"), max: 70,   unit: "°C", selector: ".area-lb .gauge-box:nth-of-type(1) .gauge-value" },
            humi2: { id: "humi-fill-2", len: setupGauge("humi-fill-2"), max: 100,  unit: "%",  selector: ".area-lb .gauge-box:nth-of-type(2) .gauge-value" },
            co2:   { id: "co2-fill",    len: setupGauge("co2-fill"),    max: 425,  unit: "<small>ppm</small>", selector: ".area-mid-b .gauge-box:nth-of-type(1) .gauge-value" },
            pm:    { id: "pm-fill",     len: setupGauge("pm-fill"),     max: 500,   unit: "<small>μg</small>",  selector: ".area-mid-b .gauge-box:nth-of-type(2) .gauge-value" }, 
            power: { id: "power-fill",  len: setupGauge("power-fill"),  max: 50,   unit: "<small>kW</small>",  selector: ".area-power .gauge-value" }
        };

        if (!timerInterval) {
            timerInterval = setInterval(updateTimerDisplay, 200);
        }

        const refreshData = async () => {
            const [dAll, dTH, dCircuit, dCO2, dPM25, dPlc, dCountMetal, dCountNonMetal] = await Promise.all([
                fetchJson(ENDPOINTS.ALL), fetchJson(ENDPOINTS.TH),
                fetchJson(ENDPOINTS.CIRCUIT), fetchJson(ENDPOINTS.CO2_DATA),
                fetchJson(ENDPOINTS.PM25_DATA), fetchJson(ENDPOINTS.PLC_STATE),
                fetchJson(ENDPOINTS.COUNT_METAL), fetchJson(ENDPOINTS.COUNT_NONMETAL)
            ]);

            const isAnyOk = !!(dAll || dTH || dCircuit || dCO2 || dPM25 || dPlc || dCountMetal || dCountNonMetal);
            
            let validPlcReply = null;
            if (dPlc) {
                if (dPlc.reply !== undefined) {
                    validPlcReply = dPlc.reply;
                } else if (dPlc.state !== undefined) {
                    validPlcReply = dPlc.state;
                } else {
                    validPlcReply = dPlc;
                }
            }

            updateBottomDevices(validPlcReply);
            
            // 取得運轉狀態結果 (除了 S50 或沒抓到外，皆回傳 true 顯示 yes)
            const isRunYes = processProcessTimer(validPlcReply);
            
            updateProductionCounts(dCountMetal, dCountNonMetal);

            // 更新 UI：連線正常為 yes，運轉狀態依據 isRunYes 決定
            updateStatusUI(isAnyOk, isRunYes);

            const thArr = Array.isArray(dTH) ? dTH : [dTH];
            const cir = Array.isArray(dCircuit) ? dCircuit[0] : dCircuit;
            const co2Obj = Array.isArray(dCO2) ? dCO2[0] : dCO2;
            const pmObj = Array.isArray(dPM25) ? dPM25[0] : dPM25;

            updateLampStatus("lamp-1", !!(thArr[0] || dAll));
            updateLampStatus("lamp-2", !!(thArr[1]));
            updateLampStatus("lamp-co2", !!(co2Obj || dAll));
            updateLampStatus("lamp-pm", !!(pmObj || dAll));
            updateLampStatus("lamp-power", !!(cir || dAll));

            if (isAnyOk) {
                const finalData = {
                    temp1: thArr[0]?.temperature ?? dAll?.temperature ?? 0,
                    humi1: thArr[0]?.humidity ?? dAll?.humidity ?? 0,
                    temp2: thArr[1]?.temperature ?? 0, 
                    humi2: thArr[1]?.humidity ?? 0,
                    power: cir?.power ?? dAll?.power ?? 0,
                    co2:   co2Obj?.airPollution ?? dAll?.co2Value ?? 0,
                    pm:    pmObj?.pm2_5 ?? dAll?.pm25 ?? 0
                };

                saveToHistory(finalData);

                Object.keys(gaugeConfigs).forEach(key => {
                    const cfg = gaugeConfigs[key];
                    updateTextBySelector(cfg.selector, finalData[key], cfg.unit);
                    if (cfg.len) {
                        updateGauge(cfg.id, finalData[key], cfg.max, cfg.len);
                    }
                });
            }
        };

        setTimeout(refreshData, 300);
        setInterval(refreshData, 500); 
    }

    initDashboard();
});