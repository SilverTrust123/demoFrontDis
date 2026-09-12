// --- 1. 預設時間參數與 PLC 狀態表 ---
const TARGET_YIELD = 1000;

const DEFAULT_PARAMS = {
    "T14": 5.0, "T0": 0.5, "T7": 1.0,
    "T30": 1.0, "T3": 1.0, "T4": 1.0, "T31": 1.0, "T5": 1.0, "T6": 1.0, "T15": 5.0,
    "T8": 1.0, "T9": 1.0, "T32": 1.0, "T10": 1.0, "T11": 1.0,
    "T40": 1.0, "T12": 1.0, "T13": 1.0
};

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

const seqMetalFull = [1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
const seqNonMetalFull = [1, 30, 31, 32, 33, 34, 35, 36, 37];

const controllers = {};
Object.keys(DEFAULT_PARAMS).forEach(key => {
    controllers[key] = {
        original: DEFAULT_PARAMS[key],
        current: DEFAULT_PARAMS[key]
    };
});

function calculateSequenceCycleTime(sequence) {
    let totalTime = 0;
    sequence.forEach(state => {
        const step = PLC_STATES[state];
        if (step) {
            totalTime += step.animTime || 0;
            if (step.waitParam && controllers[step.waitParam]) {
                const waitSec = controllers[step.waitParam].original;
                if (waitSec < 99) {
                    totalTime += waitSec;
                }
            }
        }
    });
    return totalTime;
}

function getStandardUPH() {
    const cycleTimeMetal = calculateSequenceCycleTime(seqMetalFull);
    const cycleTimeNonMetal = calculateSequenceCycleTime(seqNonMetalFull);
    
    const uphMetal = cycleTimeMetal > 0 ? (3600 / cycleTimeMetal) : 0;
    const uphNonMetal = cycleTimeNonMetal > 0 ? (3600 / cycleTimeNonMetal) : 0;
    
    return {
        metal: uphMetal,
        nonMetal: uphNonMetal,
        total: uphMetal + uphNonMetal
    };
}

// --- 2. 產能與效率計算邏輯 (基於累積產量) ---
let baselineMetalCount = null;
let baselineNonMetalCount = null;
let productionStartTime = Date.now(); // 記錄本週期的起跑時間
// --- 2. 產能計算邏輯 ---
async function fetchAndCalculateProduction() {
    try {
        const [resMetal, resNonMetal] = await Promise.all([
            fetch('http://192.168.3.85:9090/plc/getCountMetal').then(r => r.json()).catch(() => ({ count: 0 })),
            fetch('http://192.168.3.85:9090/plc/getCountNonMetal').then(r => r.json()).catch(() => ({ count: 0 }))
        ]);

        const currentMetal = resMetal.count || 0;
        const currentNonMetal = resNonMetal.count || 0;

        // 記錄剛打開網頁時的初始數量
        if (baselineMetalCount === null) baselineMetalCount = currentMetal;
        if (baselineNonMetalCount === null) baselineNonMetalCount = currentNonMetal;

        let elapsedSec = (Date.now() - productionStartTime) / 1000;

        // 每小時重新結算一次基準
        if (elapsedSec >= 3600) {
            baselineMetalCount = currentMetal;
            baselineNonMetalCount = currentNonMetal;
            productionStartTime = Date.now();
            elapsedSec = 0.1; 
        }

        // 1. 實際增加產量
        const deltaMetal = Math.max(0, currentMetal - baselineMetalCount);
        const deltaNonMetal = Math.max(0, currentNonMetal - baselineNonMetalCount);

        // 2. 理論單件標準時間
        const cycleTimeMetal = calculateSequenceCycleTime(seqMetalFull) || 45;
        const cycleTimeNonMetal = calculateSequenceCycleTime(seqNonMetalFull) || 12;

        // 3. 理論應有產量
        const expectedMetal = elapsedSec / cycleTimeMetal;
        const expectedNonMetal = elapsedSec / cycleTimeNonMetal;

        // 4. ⚡ 全新效率計算邏輯：真實反映，拔除強制 100% 的暖機機制
        let effMetal = 0;
        if (expectedMetal > 0) {
            effMetal = (deltaMetal / expectedMetal) * 100;
        }

        let effNonMetal = 0;
        if (expectedNonMetal > 0) {
            effNonMetal = (deltaNonMetal / expectedNonMetal) * 100;
        }

        // ⚡ 防暴衝機制：如果剛開網頁不到一週期的時間內就剛好掉出一顆，限制最高為 100%
        if (expectedMetal < 1 && deltaMetal > 0) effMetal = 100;
        if (expectedNonMetal < 1 && deltaNonMetal > 0) effNonMetal = 100;

        // 確保數值在 0 ~ 100 之間
        effMetal = Math.min(Math.max(effMetal, 0), 100);
        effNonMetal = Math.min(Math.max(effNonMetal, 0), 100);

        // 更新 UI 效率條
        updateEffUI('metal', effMetal);
        updateEffUI('nonmetal', effNonMetal);

        // --- 下方處理儀表板、目標量、UPH 的 UI 更新 ---
        const standard = getStandardUPH();
        const metalRatio = Math.min((currentMetal / TARGET_YIELD) * 100, 100);
        const metalRemaining = Math.max(100 - metalRatio, 0);

        const nonMetalRatio = Math.min((currentNonMetal / TARGET_YIELD) * 100, 100);
        const nonMetalRemaining = Math.max(100 - nonMetalRatio, 0);

        updateDashboardUI({
            actualMetal: currentMetal,       
            actualNonMetal: currentNonMetal, 
            targetMetal: TARGET_YIELD,
            targetNonMetal: TARGET_YIELD,
            uphMetal: Math.round(standard.metal),     
            uphNonMetal: Math.round(standard.nonMetal), 
            metalRatio: metalRatio.toFixed(2),
            metalRemaining: metalRemaining.toFixed(2),
            nonMetalRatio: nonMetalRatio.toFixed(2),
            nonMetalRemaining: nonMetalRemaining.toFixed(2)
        });

    } catch (error) {
        console.error("更新數據失敗:", error);
    }
}

function updateDashboardUI(data) {
    const metalUph = document.getElementById('metal-uph');
    const nonmetalUph = document.getElementById('nonmetal-uph');
    
    if (metalUph) metalUph.innerText = `目前每小時產量 : ${data.uphMetal}`;
    if (nonmetalUph) nonmetalUph.innerText = `目前每小時產量 : ${data.uphNonMetal}`;

    const metalCurrent = document.getElementById('metal-current');
    const metalTarget = document.getElementById('metal-target');
    const metalRatio1 = document.getElementById('metal-ratio-1');
    const metalRatio2 = document.getElementById('metal-ratio-2');

    if (metalCurrent) metalCurrent.innerText = data.actualMetal;
    if (metalTarget) metalTarget.innerText = data.targetMetal;
    if (metalRatio1) metalRatio1.innerText = `${data.metalRatio}%`;
    if (metalRatio2) metalRatio2.innerText = `${data.metalRemaining}%`;

    const metalGauge = document.querySelector('.semi-circle-bg-orange');
    if (metalGauge) {
        const deg = (parseFloat(data.metalRatio) / 100) * 180;
        metalGauge.style.background = `conic-gradient(from 270deg, #f8a577 0deg, #f8a577 ${deg}deg, #d3d3d3 ${deg}deg, #d3d3d3 180deg, transparent 180deg)`;
    }

    const nonMetalCurrent = document.getElementById('nonmetal-current');
    const nonMetalTarget = document.getElementById('nonmetal-target');
    const nonMetalRatio1 = document.getElementById('nonmetal-ratio-1');
    const nonMetalRatio2 = document.getElementById('nonmetal-ratio-2');

    if (nonMetalCurrent) nonMetalCurrent.innerText = data.actualNonMetal;
    if (nonMetalTarget) nonMetalTarget.innerText = data.targetNonMetal;
    if (nonMetalRatio1) nonMetalRatio1.innerText = `${data.nonMetalRatio}%`;
    if (nonMetalRatio2) nonMetalRatio2.innerText = `${data.nonMetalRemaining}%`;

    const nonMetalGauge = document.querySelector('.semi-circle-bg-pink');
    if (nonMetalGauge) {
        const deg = (parseFloat(data.nonMetalRatio) / 100) * 180;
        nonMetalGauge.style.background = `conic-gradient(from 270deg, #f49ac2 0deg, #f49ac2 ${deg}deg, #d3d3d3 ${deg}deg, #d3d3d3 180deg, transparent 180deg)`;
    }
}

// ⚡ 3. 雙產線效率條更新函數
function updateEffUI(type, val) {
    const fill = document.getElementById(`eff-${type}-fill`);
    const text = document.getElementById(`eff-${type}-text`);
    if (fill) fill.style.width = `${val.toFixed(1)}%`;
    if (text) text.innerText = `${val.toFixed(1)}%`;
}

// --- 4. 稼動率計算與水波圖更新 ---
let downtimeSec = 0;
let lastStatePollTime = Date.now();
const EXPECTED_RUNTIME_SEC = 8 * 3600; 

async function pollAvailability() {
    const now = Date.now();
    const deltaSec = (now - lastStatePollTime) / 1000;
    lastStatePollTime = now;

    try {
        const res = await fetch('http://192.168.3.85:9090/plc/state');
        if (!res.ok) return;
        
        const data = await res.json();
        let rawState = data;
        if (data && typeof data === 'object') {
            rawState = data.state !== undefined ? data.state : (data.reply !== undefined ? data.reply : null);
        }
        const stateNum = parseInt(rawState, 10);
        
        if (!isNaN(stateNum)) {
            // -- 稼動率邏輯 (只要是 50 就視為停機) --
            if (stateNum === 50 || stateNum === 0) {
                downtimeSec += deltaSec;
            }

            let availability = ((EXPECTED_RUNTIME_SEC - downtimeSec) / EXPECTED_RUNTIME_SEC) * 100;
            availability = Math.max(0, Math.min(100, availability)); 

            const waveText = document.getElementById('waveText');
            if (waveText) {
                waveText.innerText = availability.toFixed(1) + '%';
            }

            const waveContainer = document.querySelector('.wave-container');
            if (waveContainer) {
                waveContainer.style.setProperty('--fill-percent', availability);
            }
        }
    } catch (error) {
        console.error("更新稼動率失敗:", error);
    }
}

// --- 5. 碳足跡計算與耗電量顯示 ---
let lastCarbonValue = null; 

async function fetchCarbonFootprint() {
    try {
        const cirRes = await fetch('http://192.168.3.85:9090/circuitData/');
        if (!cirRes.ok) return;
        
        const cirData = await cirRes.json();
        const deviceList = Array.isArray(cirData) ? cirData : (cirData.data || cirData.reply || cirData.response || []);
        
        if (!deviceList || deviceList.length === 0) return;

        const targetDevice = deviceList[0];
        const deviceId = targetDevice.deviceId;
        const currentTimestamp = targetDevice.timestamp;

        const payload = {
            deviceId: deviceId,
            start: 0,
            end: currentTimestamp
        };

        const historyRes = await fetch('http://192.168.3.85:9090/history/circuitHistory', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'accept': '*/*'
            },
            body: JSON.stringify(payload)
        });

        if (!historyRes.ok) return;
        
        let historyData = await historyRes.json();
        let records = [];

        if (typeof historyData === 'string') {
            try {
                historyData = JSON.parse(historyData); 
            } catch (e) {
                console.log("JSON 解析失敗:", e);
            }
        }

        if (Array.isArray(historyData)) {
            records = historyData;
        } else if (historyData && Array.isArray(historyData.response)) {
            records = historyData.response; 
        } else if (historyData && Array.isArray(historyData.data)) {
            records = historyData.data;
        } else if (historyData && Array.isArray(historyData.reply)) {
            records = historyData.reply;
        }

        if (records && records.length > 0) {
            let totalPower = 0;
            for (let i = 0; i < records.length; i++) {
                const powerVal = parseFloat(records[i].power || 0);
                totalPower += powerVal;
            }

            const carbon = (totalPower / 60000) * 0.467;
            const formattedCarbon = carbon.toFixed(4); 

            const powerEl = document.getElementById('power-val');
            if (powerEl) {
                powerEl.innerText = totalPower.toFixed(2) + ' W';
            }

            if (lastCarbonValue !== formattedCarbon) {
                lastCarbonValue = formattedCarbon;

                const carbonEl = document.getElementById('carbon-val');
                if (carbonEl) {
                    carbonEl.innerText = formattedCarbon + ' kg';
                }

                const leafIcon = document.getElementById('carbon-leaf-icon');
                if (leafIcon) {
                    leafIcon.classList.remove('blink-anim');
                    setTimeout(() => {
                        leafIcon.classList.add('blink-anim');
                    }, 50); 
                }
            }
        }
    } catch (error) {
        console.error("❌ 更新碳足跡時發生程式錯誤:", error);
    }
}

// --- 6. 伺服器壓力計算 ---
async function fetchServerPressure() {
    try {
        const res = await fetch('http://192.168.3.85:9090/Load/allFilterLoadStats');
        if (!res.ok) return;

        const data = await res.json();
        const threadStats = data.threadStats || {};

        const utilization = threadStats.utilization || 0;
        const busy = threadStats.busy_thread || 0;
        const blocked = threadStats.blocked_thread || 0;
        const total = threadStats.total_thread || 1; 
        const queueSize = data.queueSize || 0;

        const p1 = 0.4 * utilization; 
        const p2 = 0.3 * (((busy + 1.5 * blocked) / total) / 3 * 100);
        const p3 = 0.3 * ((queueSize / 50) * 100);

        let pressure = p1 + p2 + p3;
        pressure = Math.max(0, Math.min(100, Math.round(pressure)));

        const pressureVal = document.getElementById('server-pressure-val');
        if (pressureVal) {
            pressureVal.innerText = pressure;
            if (pressure <= 33) {
                pressureVal.style.color = '#28a745'; 
            } else if (pressure <= 66) {
                pressureVal.style.color = '#ffcc00'; 
            } else {
                pressureVal.style.color = '#ff4d4d'; 
            }
        }

        const faceImg = document.getElementById('pressure-face');
        if (faceImg) {
            if (pressure <= 33) {
                faceImg.src = '../picture/goodmood.png';
            } else if (pressure <= 66) {
                faceImg.src = '../picture/normalmood.png';
            } else {
                faceImg.src = '../picture/badmood.png';
            }
        }

        const marker = document.querySelector('.slider-marker');
        if (marker) {
            marker.style.left = `${pressure}%`;
        }

    } catch (error) {
        console.error("更新伺服器壓力失敗:", error);
    }
}

// --- 7. 系統初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    fetchAndCalculateProduction();
    setInterval(fetchAndCalculateProduction, 5000);

    pollAvailability();
    setInterval(pollAvailability, 1000);

    fetchCarbonFootprint();
    setInterval(fetchCarbonFootprint, 5000);
    
    fetchServerPressure();
    setInterval(fetchServerPressure, 2000);
});