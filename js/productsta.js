// --- PLC 設定與序列資料 ---
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

const API_BASE = window.location.hostname ? `http://192.168.3.85:9090` : 'http://192.168.3.85:9090';
const PLC_STATE_API = `${API_BASE}/plc/state`;
const PLC_DPOINT_API = `${API_BASE}/plc/AllDPointData`;

let currentGlobalParams = { ...DEFAULT_PARAMS };

const tracker = {
    metal: {
        startTime: null,
        isTiming: false,
        timerInterval: null, 
        cycles: [],          
        lastState: null,
        normalCycleTime: 0 
    },
    nonmetal: {
        startTime: null,
        isTiming: false,
        timerInterval: null, 
        cycles: [],          
        lastState: null,
        normalCycleTime: 0 
    }
};

/**
 * 將秒數轉為 MM:SS 格式
 */
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60); 
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * 更新 UI：動態圈數標題、正常作業時間與歷史列表
 */
function updateUI(lineKey) {
    const data = tracker[lineKey];
    const listEl = document.getElementById(`${lineKey}-cycle-list`);
    const avgEl = document.getElementById(`${lineKey}-avg-time`); 
    const titleEl = document.getElementById(`${lineKey}-cycle-title`);

    if (!listEl || !avgEl) return;

    const currentCycleNum = data.isTiming ? data.cycles.length + 1 : data.cycles.length;

    // 1. 動態更新標題與即時計時
    if (titleEl) {
        if (data.isTiming) {
            const elapsedSecs = Math.floor((Date.now() - data.startTime) / 1000);
            titleEl.innerText = `第${currentCycleNum}圈時間：${formatDuration(elapsedSecs)}`;
        } else if (data.cycles.length > 0) {
            titleEl.innerText = `第${data.cycles.length}圈時間：`;
        } else {
            titleEl.innerText = '目前第*圈時間：';
        }
    }

    // 2. 顯示正常作業時間
    if (data.normalCycleTime > 0) {
        avgEl.innerText = formatDuration(data.normalCycleTime);
    } else {
        avgEl.innerText = '00:00';
    }

    // 3. 渲染歷史清單 (顯示最新 5 筆實際圈數時間)
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
 * 處理 PLC 狀態與計時邏輯
 */
function processPLCState(lineKey, currentState) {
    const t = tracker[lineKey];
    const stateStr = String(currentState).trim().toUpperCase();

    if (lineKey === 'metal') {
        // --- 金屬產線邏輯 ---
        const isStart = stateStr === '10' || stateStr === 'S10';
        const isEnd = (stateStr === '1' || stateStr === 'S1') && (t.lastState !== '1' && t.lastState !== 'S1' && t.lastState !== null);

        if (!t.isTiming && isStart) {
            t.isTiming = true;
            // ⚡ 預留 2 秒 (將起始時間往前推 2000ms)
            t.startTime = Date.now() - 2000;

            if (t.timerInterval) clearInterval(t.timerInterval);
            t.timerInterval = setInterval(() => {
                updateUI('metal');
            }, 1000);
        } else if (t.isTiming && (t.lastState === '1' || t.lastState === 'S1') && stateStr !== '1' && stateStr !== 'S1') {
            t.isTiming = false;

            if (t.timerInterval) {
                clearInterval(t.timerInterval);
                t.timerInterval = null;
            }

            const durationSecs = Math.round((Date.now() - t.startTime) / 1000);
            if (durationSecs > 1) {
                t.cycles.push(durationSecs);
            }
            updateUI('metal');
        }

    } else if (lineKey === 'nonmetal') {
        // --- 非金屬產線邏輯 ---
        const isStart = stateStr === '30' || stateStr === 'S30';
        const isEnd = stateStr === '37' || stateStr === 'S37'; // 跑到 S37 停止計時

        if (!t.isTiming && isStart) {
            t.isTiming = true;
            // ⚡ 預留 2 秒 (將起始時間往前推 2000ms)
            t.startTime = Date.now() - 2000;

            if (t.timerInterval) clearInterval(t.timerInterval);
            t.timerInterval = setInterval(() => {
                updateUI('nonmetal');
            }, 1000);
        } else if (t.isTiming && isEnd && t.lastState !== '37' && t.lastState !== 'S37') {
            t.isTiming = false;

            if (t.timerInterval) {
                clearInterval(t.timerInterval);
                t.timerInterval = null;
            }

            const durationSecs = Math.round((Date.now() - t.startTime) / 1000);
            if (durationSecs > 1) {
                t.cycles.push(durationSecs);
            }
            updateUI('nonmetal');
        }
    }

    t.lastState = stateStr;
}

/**
 * 計算特定序列的總循環時間 (理論秒數)
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
 * ⚡ 1. 僅在頁面初始化時執行一次，取得 AllDPointData 並計算正常作業時間
 */
async function initCycleTimes() {
    try {
        const res = await fetch(PLC_DPOINT_API);
        if (!res.ok) return;
        const dpointRes = await res.json();

        const reply = (dpointRes && dpointRes.reply) ? dpointRes.reply : dpointRes;
        if (reply && typeof reply === 'object') {
            Object.keys(DEFAULT_PARAMS).forEach(key => {
                if (reply[key] !== undefined) {
                    currentGlobalParams[key] = reply[key] / 10;
                }
            });
        }

        tracker.metal.normalCycleTime = calculateSequenceCycleTime(seqMetalFull, currentGlobalParams);
        tracker.nonmetal.normalCycleTime = calculateSequenceCycleTime(seqNonMetalFull, currentGlobalParams);

        updateUI('metal');
        updateUI('nonmetal');
    } catch (err) {
        console.error('[Init DPoint Error]:', err);
    }
}

/**
 * ⚡ 2. 後續僅持續輪詢 PLC state 取得即時步驟
 */
async function fetchPLCStateOnly() {
    try {
        const res = await fetch(PLC_STATE_API);
        if (!res.ok) return;
        const stateRes = await res.json();

        let plcState = stateRes.reply !== undefined ? stateRes.reply : (stateRes.state !== undefined ? stateRes.state : stateRes);
        if (plcState !== null && plcState !== undefined) {
            processPLCState('metal', plcState);
            processPLCState('nonmetal', plcState);
        }

        updateUI('metal');
        updateUI('nonmetal');
    } catch (err) {
        console.warn('[PLC State API Error]:', err);
    }
}

// 初始化 UI 畫面
updateUI('metal');
updateUI('nonmetal');

// ⚡ 執行一次性參數初始化
initCycleTimes();

// ⚡ 後續每秒僅輪詢 state API
setInterval(fetchPLCStateOnly, 1000);