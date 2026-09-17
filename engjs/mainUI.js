document.addEventListener("DOMContentLoaded", () => {
    
    // --- 1. Configurations and API Endpoints ---
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

    // Mapping between PLC status codes and bottom 5 devices (0~4)
    const stateToDeviceMap = {
        "S1": 0,  // Conveyor Belt 1
        "S10": 2, "S11": 2, "S12": 2, "S13": 2, "S14": 2, "S15": 2, "S16": 2, // Gantry Robotic Arm (Metal)
        "S17": 3, // Conveyor Belt 2
        "S18": 4, "S19": 4, "S20": 4, "S21": 4, "S22": 4, "S23": 4, "S24": 4, // Rotary Cylinder Arm (Non-Metal)
        "S30": 1, "S31": 1, "S32": 1, "S33": 1, "S34": 1, "S35": 1, "S36": 1, "S37": 1  // Slide Cylinder Arm
    };

    let gaugeConfigs = {};

    // --- Process Time and Timer Control Variables ---
    let currentMode = null;      // 'metal' | 'nonmetal' | null
    let isRunning = false;       // Record whether currently in a valid S-step operational state
    let lastActiveTime = null;   // Timestamp for calculating active intervals
    let metalElapsed = 0;        // Metal accumulated seconds
    let nonmetalElapsed = 0;     // Non-metal accumulated seconds
    let timerInterval = null;
    let lastState = null;

    // --- 2. Core Data Processing ---

    async function fetchJson(url) {
        try {
            const res = await fetch(url, { 
                method: 'GET', 
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(500) 
            });
            if (res.ok) return await res.json();
        } catch (e) {
            console.warn(`Request failed: ${url}`);
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

    // --- 3. UI Utility Functions and Time Formatting ---

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
     * Update device connection and operational status text
     * @param {boolean} isConnected Device connection status
     * @param {boolean} isRunningState Whether currently in valid processing step (isRunning)
     */
    function updateStatusUI(isConnected, isRunningState) {
        const connEl = document.getElementById("conn-status");
        const runEl = document.getElementById("run-status");

        if (connEl) {
            connEl.innerText = isConnected ? "yes" : "no";
            connEl.className = isConnected ? "v-green" : "v-red";
        }

        if (runEl) {
            runEl.innerText = isRunningState ? "yes" : "no";
            runEl.className = isRunningState ? "v-green" : "v-red";
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
     * Process timer state machine logic
     * @param {string|null} rawState State returned by PLC (e.g., "1", "10", "18" or null)
     */
    function processProcessTimer(rawState) {
        // 1. If no value passed, or passed "0" or null -> treat as stopped
        if (!rawState || rawState === "0") {
            stopTimer();
            return;
        }

        const stateNum = parseInt(rawState, 10);

        // 2. Strict evaluation: Only "Metal steps (10~24)" or "Non-metal steps (30~37)" count as valid processing timing
        const isMetalStep = (stateNum >= 10 && stateNum <= 24);
        const isNonMetalStep = (stateNum >= 30 && stateNum <= 37);

        // If not a processing step (e.g., S1 Conveyor or Standby step), pause timing
        if (!isMetalStep && !isNonMetalStep) {
            stopTimer();
            return;
        }

        // 3. Update mode
        if (isMetalStep) {
            currentMode = 'metal';
        } else if (isNonMetalStep) {
            currentMode = 'nonmetal';
        }

        // 4. Start timing benchmark
        if (!isRunning) {
            isRunning = true;
            lastActiveTime = Date.now();
        }

        lastState = `S${rawState}`;
    }

    // Helper function: Stop timing and reset benchmark time
    function stopTimer() {
        isRunning = false;
        lastActiveTime = null;
        lastState = null;
    }

    /**
     * Update accumulated time and display (triggered by setInterval every 200ms)
     */
    function updateTimerDisplay() {
        const now = Date.now();

        // Only calculate and accumulate delta time when isRunning is true and valid timestamp exists
        if (isRunning && lastActiveTime) {
            const deltaSeconds = (now - lastActiveTime) / 1000;

            if (currentMode === 'metal') {
                metalElapsed += deltaSeconds;
            } else if (currentMode === 'nonmetal') {
                nonmetalElapsed += deltaSeconds;
            }

            // Update benchmark time
            lastActiveTime = now;
        }

        // Refresh UI display
        const metalEl = document.getElementById("metal-timer");
        const nonmetalEl = document.getElementById("nonmetal-timer");

        if (metalEl) metalEl.innerText = formatTime(metalElapsed);
        if (nonmetalEl) nonmetalEl.innerText = formatTime(nonmetalElapsed);
    }

    /**
     * Update current metal and non-metal production counts
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

    // --- 4. Initialization and Main Loop ---
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

        // Independent UI rendering and timer (Refreshes every 200ms)
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
            
            // Check if PLC returned a valid reply
            const validPlcReply = (dPlc && dPlc.reply) ? dPlc.reply : null;

            // 1. Real-time update for bottom device indicator lamps, timer state machine, and production counts
            updateBottomDevices(validPlcReply);
            processProcessTimer(validPlcReply);
            updateProductionCounts(dCountMetal, dCountNonMetal);

            // 2. Update UI connection status and operational status (Run status shows yes only when isRunning is true)
            updateStatusUI(isAnyOk, isRunning);

            // 3. Normalize sensor data
            const thArr = Array.isArray(dTH) ? dTH : [dTH];
            const cir = Array.isArray(dCircuit) ? dCircuit[0] : dCircuit;
            const co2Obj = Array.isArray(dCO2) ? dCO2[0] : dCO2;
            const pmObj = Array.isArray(dPM25) ? dPM25[0] : dPM25;

            // 4. Update status lamps for each module
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