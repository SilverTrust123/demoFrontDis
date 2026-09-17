// --- PLC Settings and Sequence Data (Inheriting calculation logic from capacity forecasting) ---
const DEFAULT_PARAMS = {
    "T14": 5.0, "T0": 0.5, "T7": 1.0,
    "T30": 1.0, "T3": 1.0, "T4": 1.0, "T31": 1.0, "T5": 1.0, "T6": 1.0, "T15": 5.0,
    "T8": 1.0, "T9": 1.0, "T32": 1.0, "T10": 1.0, "T11": 1.0,
    "T40": 1.0, "T12": 1.0, "T13": 1.0
};

const PLC_STATES = {
    1:  { animTime: 1.62, waitParam: "T14" },
    10: { animTime: 3.68, waitParam: "T30" },
    11: { animTime: 1.27, waitParam: "T3" },
    12: { animTime: 2.47, waitParam: "T4" },
    13: { animTime: 4.64, waitParam: "T31" },
    14: { animTime: 2.36, waitParam: "T5" },
    15: { animTime: 0.17, waitParam: "T6" },
    16: { animTime: 1.56, waitParam: "T15" },
    17: { animTime: 1.21, waitParam: "T7" },
    18: { animTime: 0.62, waitParam: "T8" },
    19: { animTime: 0.49, waitParam: "T9" },
    20: { animTime: 0.10, waitParam: "T32" }, 
    21: { animTime: 1.62, waitParam: "T10" },
    22: { animTime: 0.10, waitParam: "T11" },
    23: { animTime: 0.59 }, 
    24: { animTime: 0.83 },
    30: { animTime: 1.00 },
    31: { animTime: 0.20, waitParam: "T40" },
    32: { animTime: 0.30, waitParam: "T12" },
    33: { animTime: 0.50 },
    34: { animTime: 1.00 },
    35: { animTime: 0.50 },
    36: { animTime: 0.30, waitParam: "T13" },
    37: { animTime: 0.50 }
};

const seqMetalFull = [1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
const seqNonMetalFull = [1, 30, 31, 32, 33, 34, 35, 36, 37];

const API_BASE = window.location.hostname ? `http://${window.location.hostname}:9090` : 'http://192.168.3.85:9090';
const PLC_STATE_API = `${API_BASE}/plc/state`;
const PLC_DPOINT_API = `${API_BASE}/plc/AllDPointData`;

const tracker = {
    metal: {
        startTime: null,
        isTiming: false,
        timerInterval: null, 
        cycles: [],          
        lastState: null,
        normalCycleTime: 0 // ⚡ Added: Stores calculated normal cycle time
    },
    nonmetal: {
        startTime: null,
        isTiming: false,
        timerInterval: null, 
        cycles: [],          
        lastState: null,
        normalCycleTime: 0 // ⚡ Added: Stores calculated normal cycle time
    }
};

/**
 * Formats seconds into MM:SS format
 */
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60); // Round down to integer, omit decimals
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Updates UI: Dynamic cycle title, normal cycle time, and history list
 */
function updateUI(lineKey) {
    const data = tracker[lineKey];
    const listEl = document.getElementById(`${lineKey}-cycle-list`);
    const avgEl = document.getElementById(`${lineKey}-avg-time`); 
    const titleEl = document.getElementById(`${lineKey}-cycle-title`);

    if (!listEl || !avgEl) return;

    const currentCycleNum = data.isTiming ? data.cycles.length + 1 : data.cycles.length;

    // 1. Dynamically update title and real-time timer
    if (titleEl) {
        if (data.isTiming) {
            const elapsedSecs = Math.floor((Date.now() - data.startTime) / 1000);
            titleEl.innerText = `Cycle ${currentCycleNum} Time: ${formatDuration(elapsedSecs)}`;
        } else if (data.cycles.length > 0) {
            titleEl.innerText = `Cycle ${data.cycles.length} Time: `;
        } else {
            titleEl.innerText = 'Current Cycle * Time: ';
        }
    }

    // ⚡ 2. Display theoretical normal cycle time calculated dynamically via API
    if (data.normalCycleTime > 0) {
        avgEl.innerText = formatDuration(data.normalCycleTime);
    } else {
        avgEl.innerText = '00:00';
    }

    // 3. Render historical list (displaying top 5 most recent actual cycle times)
    if (data.cycles.length > 0) {
        listEl.innerHTML = data.cycles
            .map((sec, idx) => `<li>${idx + 1}. ${formatDuration(sec)}</li>`)
            .slice(-5)
            .reverse()
            .join('');
    } else {
        listEl.innerHTML = '';
    }
}

/**
 * Processes PLC states and timing logic
 */
function processPLCState(lineKey, currentState) {
    const t = tracker[lineKey];
    const stateStr = String(currentState).trim().toUpperCase();

    // Determine start condition based on production line type
    const isStartCondition = (lineKey === 'metal' && (stateStr === '10' || stateStr === 'S10')) ||
                             (lineKey === 'nonmetal' && (stateStr === '30' || stateStr === 'S30'));

    // End condition: Return to 1 (or S1) with state transition
    const isEndCondition = (stateStr === '1' || stateStr === 'S1') && t.lastState !== stateStr;

    // Start timing
    if (!t.isTiming && isStartCondition) {
        t.isTiming = true;
        t.startTime = Date.now();

        if (t.timerInterval) clearInterval(t.timerInterval);
        t.timerInterval = setInterval(() => {
            updateUI(lineKey);
        }, 1000);
    } 
    // End timing
    else if (t.isTiming && isEndCondition) {
        t.isTiming = false;

        if (t.timerInterval) {
            clearInterval(t.timerInterval);
            t.timerInterval = null;
        }

        const durationSecs = Math.round((Date.now() - t.startTime) / 1000);
        
        if (durationSecs > 1) {
            t.cycles.push(durationSecs);
        }

        updateUI(lineKey);
    }

    t.lastState = stateStr;
}

/**
 * Calculates total cycle time for a specific sequence (theoretical seconds)
 */
function calculateSequenceCycleTime(sequence, params) {
    let totalTime = 0;
    sequence.forEach(state => {
        const step = PLC_STATES[state];
        if (step) {
            totalTime += step.animTime || 0; 
            
            if (step.waitParam && params[step.waitParam] !== undefined) {
                let waitSec = params[step.waitParam];
                if (waitSec < 99) { 
                    totalTime += waitSec;
                }
            }
        }
    });
    return totalTime;
}

/**
 * Polls backend for PLC status (for timing) and DPointData (for calculating normal cycle time)
 */
async function fetchPLCData() {
    try {
        const [stateRes, dpointRes] = await Promise.all([
            fetch(PLC_STATE_API).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch(PLC_DPOINT_API).then(r => r.ok ? r.json() : null).catch(() => null)
        ]);

        // --- 1. Process state timing logic ---
        if (stateRes && stateRes.reply !== undefined) {
            const plcState = stateRes.reply;
            processPLCState('metal', plcState);
            processPLCState('nonmetal', plcState);
        }

        // --- ⚡ 2. Dynamically calculate normal cycle time ---
        let currentParams = { ...DEFAULT_PARAMS };
        if (dpointRes && dpointRes.reply) {
            const reply = dpointRes.reply;
            Object.keys(DEFAULT_PARAMS).forEach(key => {
                if (reply[key] !== undefined) {
                    currentParams[key] = reply[key] / 10;
                }
            });
        }

        // Calculate and write theoretical cycle seconds for metal and non-metal lines
        tracker.metal.normalCycleTime = calculateSequenceCycleTime(seqMetalFull, currentParams);
        tracker.nonmetal.normalCycleTime = calculateSequenceCycleTime(seqNonMetalFull, currentParams);

        // Update UI
        updateUI('metal');
        updateUI('nonmetal');

    } catch (err) {
        console.error('[PLC API Error]:', err);
    }
}

// Initialize UI display
updateUI('metal');
updateUI('nonmetal');

// Start polling API every second
setInterval(fetchPLCData, 1000);