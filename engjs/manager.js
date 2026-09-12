// manager.js

// --- 1. Default Time Parameters and PLC State Table ---
const TARGET_YIELD = 1000;

const DEFAULT_PARAMS = {
    "T14": 5.0, "T0": 0.5, "T7": 1.0,
    "T30": 1.0, "T3": 1.0, "T4": 1.0, "T31": 1.0, "T5": 1.0, "T6": 1.0, "T15": 5.0,
    "T8": 1.0, "T9": 1.0, "T32": 1.0, "T10": 1.0, "T11": 1.0,
    "T40": 1.0, "T12": 1.0, "T13": 1.0
};

const PLC_STATES = {
    1:  { text: "S1 Waiting for Material", animTime: 1.62, waitParam: "T14" },
    10: { text: "S10 Gantry Right Pre-position", animTime: 3.68, waitParam: "T30" },
    11: { text: "S11 Gantry Down Pre-position", animTime: 1.27, waitParam: "T3" },
    12: { text: "S12 Clamping Workpiece, Gantry Up", animTime: 2.47, waitParam: "T4" },
    13: { text: "S13 Gantry Left", animTime: 4.64, waitParam: "T31" },
    14: { text: "S14 Gantry Down", animTime: 2.36, waitParam: "T5" },
    15: { text: "S15 Release Gripper", animTime: 0.17, waitParam: "T6" },
    16: { text: "S16 Gantry Up", animTime: 1.56, waitParam: "T15" },
    17: { text: "S17 Conveyor 2", animTime: 1.21, waitParam: "T7" },
    18: { text: "S18 Rotary Arm Down", animTime: 0.62, waitParam: "T8" },
    19: { text: "S19 Suction Workpiece", animTime: 0.49, waitParam: "T9" },
    20: { text: "S20 Suction Cup Up", animTime: 0.10, waitParam: "T32" },
    21: { text: "S21 Suction Cup Rotate Down", animTime: 1.62, waitParam: "T10" },
    22: { text: "S22 Vacuum Release", animTime: 0.10, waitParam: "T11" },
    23: { text: "S23 Suction Cup Up", animTime: 0.59 },
    24: { text: "S24 Suction Cup Return", animTime: 0.83 },
    30: { text: "S30 Slide Table Left", animTime: 1.00 },
    31: { text: "S31 Slide Table Down", animTime: 0.20, waitParam: "T40" },
    32: { text: "S32 Clamping Workpiece", animTime: 0.30, waitParam: "T12" },
    33: { text: "S33 Slide Table Up", animTime: 0.5 },
    34: { text: "S34 Slide Table Right", animTime: 1.00 },
    35: { text: "S35 Slide Table Down", animTime: 0.50 },
    36: { text: "S36 Release Workpiece", animTime: 0.30, waitParam: "T13" },
    37: { text: "S37 Slide Table Up", animTime: 0.5 },
    50: { text: "S50 System Emergency Stop", animTime: 0.1 }
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

let baselineMetalCount = null;
let baselineNonMetalCount = null;
let productionStartTime = Date.now();

// --- 2. Production Capacity Calculation Logic ---
async function fetchAndCalculateProduction() {
    try {
        const [resMetal, resNonMetal] = await Promise.all([
            fetch('http://192.168.3.85:9090/plc/getCountMetal').then(r => r.json()).catch(() => ({ count: 0 })),
            fetch('http://192.168.3.85:9090/plc/getCountNonMetal').then(r => r.json()).catch(() => ({ count: 0 }))
        ]);

        const currentMetal = resMetal.count || 0;
        const currentNonMetal = resNonMetal.count || 0;

        if (baselineMetalCount === null) {
            baselineMetalCount = currentMetal;
        }
        if (baselineNonMetalCount === null) {
            baselineNonMetalCount = currentNonMetal;
        }

        let elapsedSec = (Date.now() - productionStartTime) / 1000;

        if (elapsedSec >= 3600) {
            baselineMetalCount = currentMetal;
            baselineNonMetalCount = currentNonMetal;
            productionStartTime = Date.now();
            elapsedSec = 0;
        }

        if (currentMetal < baselineMetalCount) baselineMetalCount = currentMetal;
        if (currentNonMetal < baselineNonMetalCount) baselineNonMetalCount = currentNonMetal;

        const deltaMetal = currentMetal - baselineMetalCount;
        const deltaNonMetal = currentNonMetal - baselineNonMetalCount;
        const totalDelta = deltaMetal + deltaNonMetal;

        const standard = getStandardUPH();
        const totalStandardUPH = standard.total;

        const expectedYieldSoFar = (totalStandardUPH / 3600) * elapsedSec;
        let efficiency = 0;
        
        if (expectedYieldSoFar > 0) {
            efficiency = (totalDelta / expectedYieldSoFar) * 100;
        }
        efficiency = Math.min(Math.max(efficiency, 0), 100);

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
            efficiency: efficiency.toFixed(1),
            metalRatio: metalRatio.toFixed(2),
            metalRemaining: metalRemaining.toFixed(2),
            nonMetalRatio: nonMetalRatio.toFixed(2),
            nonMetalRemaining: nonMetalRemaining.toFixed(2)
        });

    } catch (error) {
        console.error("Failed to update data:", error);
    }
}

function updateDashboardUI(data) {
    const metalUph = document.getElementById('metal-uph');
    const nonmetalUph = document.getElementById('nonmetal-uph');
    
    if (metalUph) metalUph.innerText = `Current UPH : ${data.uphMetal}`;
    if (nonmetalUph) nonmetalUph.innerText = `Current UPH : ${data.uphNonMetal}`;

    const fillBar = document.getElementById('efficiency-fill');
    const effText = document.getElementById('efficiency-text');
    if (fillBar) {
        fillBar.style.width = `${data.efficiency}%`;
    }
    if (effText) {
        effText.innerText = `${data.efficiency}%`;
    }

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

// --- 6. Availability Calculation and Water Wave Animation ---
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
            if (stateNum === 50) {
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
        console.error("Failed to update availability:", error);
    }
}

// --- ⚡ 7. Carbon Footprint Calculation and Blinking Logic (with Power Consumption) ---
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
                console.log("JSON parsing failed:", e);
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

            // Update accumulated power consumption (W) on screen
            const powerEl = document.getElementById('power-val');
            if (powerEl) {
                powerEl.innerText = totalPower.toFixed(2) + ' W';
            }

            // ⚡ Check if carbon footprint has changed; only blink if it has
            if (lastCarbonValue !== formattedCarbon) {
                lastCarbonValue = formattedCarbon;

                const carbonEl = document.getElementById('carbon-val');
                if (carbonEl) {
                    carbonEl.innerText = formattedCarbon + ' kg';
                }

                // ⚡ More forced way to restart animation (setTimeout ensures browser rendering logic takes effect)
                const leafIcon = document.getElementById('carbon-leaf-icon');
                if (leafIcon) {
                    leafIcon.classList.remove('blink-anim');
                    setTimeout(() => {
                        leafIcon.classList.add('blink-anim');
                    }, 50); // Delay 50ms before adding the animation class back
                }
            }
        }
    } catch (error) {
        console.error("❌ Error occurred while updating carbon footprint:", error);
    }
}

// --- 8. Server Pressure Calculation ---
async function fetchServerPressure() {
    try {
        const res = await fetch('http://192.168.3.85:9090/Load/allFilterLoadStats');
        if (!res.ok) return;

        const data = await res.json();
        const threadStats = data.threadStats || {};

        const utilization = threadStats.utilization || 0;
        const busy = threadStats.busy_thread || 0;
        const blocked = threadStats.blocked_thread || 0;
        const total = threadStats.total_thread || 1; // Prevent division by 0
        const queueSize = data.queueSize || 0;

        // Calculation formula
        const p1 = 0.4 * utilization; 
        const p2 = 0.3 * (((busy + 1.5 * blocked) / total) / 3 * 100);
        const p3 = 0.3 * ((queueSize / 50) * 100);

        let pressure = p1 + p2 + p3;
        pressure = Math.max(0, Math.min(100, Math.round(pressure)));

        // Update UI
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
        console.error("Failed to update server pressure:", error);
    }
}

// --- 9. System Initialization ---
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