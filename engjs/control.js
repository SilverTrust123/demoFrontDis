document.addEventListener('DOMContentLoaded', () => {
    const boardContent = document.querySelector('.board-content');
    const controlRows = document.querySelectorAll('.control-row');
    const resetBtn = document.getElementById('reset-btn');
    
    const HOST = window.location.hostname || "192.168.3.85";
    const API_BASE = `http://192.168.3.85:9090`;
    
    const WRITE_D_URL = `${API_BASE}/plc/writeDPoint`;
    const READ_ALL_URL = `${API_BASE}/plc/AllDPointData`; 
    const READ_SINGLE_URL = `${API_BASE}/plc/DPointData`; 
    const WRITE_M_URL = `${API_BASE}/plc/writeMPoint`;

    // ⚡ 1. Add unified DEFAULT_PARAMS to align with other page standards
    const DEFAULT_PARAMS = {
        "T14": 5.0, "T0": 0.5, "T7": 1.0,
        "T30": 1.0, "T3": 1.0, "T4": 1.0, "T31": 1.0, "T5": 1.0, "T6": 1.0, "T15": 5.0,
        "T8": 1.0, "T9": 1.0, "T32": 1.0, "T10": 1.0, "T11": 1.0,
        "T40": 1.0, "T12": 1.0, "T13": 1.0
    };

    // 2. PLC state dictionary and action duration
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

    // Define dual-track arrays for metal and non-metal
    const seqMetalFull = [1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
    const seqNonMetalFull = [1, 30, 31, 32, 33, 34, 35, 36, 37];
    
    let cachedPLCData = {}; 

    // Create confirmation button bar
    let confirmBar = document.querySelector('.floating-confirm-bar');
    if (!confirmBar) {
        confirmBar = document.createElement('div');
        confirmBar.className = 'floating-confirm-bar';
        confirmBar.innerHTML = `
            <span class="confirm-text" style="color:white; font-size:16px; font-weight:bold;">Values Changed&nbsp;&nbsp;Projected Throughput ➔ Metal: <span id="new-metal-uph" style="color: #f1c40f; font-size: 18px;">--</span> | Non-metal: <span id="new-nonmetal-uph" style="color: #ff0800; font-size: 18px;">--</span></span>
            <button class="confirm-btn">Confirm Save (SET)</button>
        `;
        boardContent.appendChild(confirmBar);
    }
    const confirmBtn = confirmBar.querySelector('.confirm-btn');

    const controllers = [];
    const paramNames = ["T14", "T0"];

    controlRows.forEach((row, index) => {
        const timeDisplay = row.querySelector('.time-box');
        const minusBtn = row.querySelector('.control-adjust button:first-child');
        const plusBtn = row.querySelector('.control-adjust button:last-child');
        
        const paramKey = paramNames[index] || `T${index}`;
        // ⚡ Fix: Initial value fetched from DEFAULT_PARAMS instead of 0.0
        let initialVal = DEFAULT_PARAMS[paramKey] !== undefined ? DEFAULT_PARAMS[paramKey] : 1.0;

        const ctrl = {
            param: paramKey,
            original: initialVal, 
            current: initialVal,  
            display: timeDisplay,
            update: (val) => {
                ctrl.current = val;
                timeDisplay.textContent = `${ctrl.current.toFixed(1)} sec`;
                checkChanges();
            },
            commit: () => {
                ctrl.original = ctrl.current;
            }
        };

        // Write seconds on initial UI rendering
        timeDisplay.textContent = `${ctrl.current.toFixed(1)} sec`;

        minusBtn.addEventListener('click', () => {
            let nextVal = Math.round((ctrl.current - 0.5) * 10) / 10;
            if (nextVal >= 0) ctrl.update(nextVal);
        });

        plusBtn.addEventListener('click', () => {
            let nextVal = Math.round((ctrl.current + 0.5) * 10) / 10;
            if (nextVal <= 10) ctrl.update(nextVal);
        });

        controllers.push(ctrl);
    });

    // Calculate precise cycle time
    function calculateCycleTime(sequence, useCurrent = false) {
        let totalTime = 0;
        sequence.forEach(state => {
            const step = PLC_STATES[state];
            if (step) {
                totalTime += step.animTime || 0; 
                
                if (step.waitParam) {
                    // ⚡ Fix: Fallback to DEFAULT_PARAMS if parameter is not found
                    let waitSec = DEFAULT_PARAMS[step.waitParam] !== undefined ? DEFAULT_PARAMS[step.waitParam] : 1.0; 

                    let ctrl = controllers.find(c => c.param === step.waitParam);
                    if (ctrl) {
                        waitSec = useCurrent ? ctrl.current : ctrl.original;
                    } 
                    else if (cachedPLCData[step.waitParam] !== undefined) {
                        waitSec = cachedPLCData[step.waitParam] / 10;
                    }

                    if (waitSec < 99) {
                        totalTime += waitSec;
                    }
                }
            }
        });
        return totalTime;
    }

    // Update current UI actual throughput
    function updateUPH() {
        let metalCycle = calculateCycleTime(seqMetalFull, false);
        let nonMetalCycle = calculateCycleTime(seqNonMetalFull, false);

        let metalUPH = metalCycle > 0 ? Math.round(3600 / metalCycle) : 0;
        let nonMetalUPH = nonMetalCycle > 0 ? Math.round(3600 / nonMetalCycle) : 0;

        const metalUphEl = document.getElementById('current-metal-uph');
        const nonMetalUphEl = document.getElementById('current-nonmetal-uph');

        if (metalUphEl) metalUphEl.innerText = metalUPH;
        if (nonMetalUphEl) nonMetalUphEl.innerText = nonMetalUPH;
    }

    // Check for value changes
    function checkChanges() {
        const hasChanged = controllers.some(c => c.current !== c.original);
        if (hasChanged) {
            confirmBar.classList.add('show');
            controllers.forEach(c => {
                c.display.style.color = (c.current !== c.original) ? "#d9534f" : "#f08519";
            });

            let newMetalCycle = calculateCycleTime(seqMetalFull, true);
            let newNonMetalCycle = calculateCycleTime(seqNonMetalFull, true);

            let newMetalUPH = newMetalCycle > 0 ? Math.round(3600 / newMetalCycle) : 0;
            let newNonMetalUPH = newNonMetalCycle > 0 ? Math.round(3600 / newNonMetalCycle) : 0;

            const newMetalUphEl = document.getElementById('new-metal-uph');
            const newNonMetalUphEl = document.getElementById('new-nonmetal-uph');

            if (newMetalUphEl) newMetalUphEl.innerText = newMetalUPH;
            if (newNonMetalUphEl) newNonMetalUphEl.innerText = newNonMetalUPH;

        } else {
            confirmBar.classList.remove('show');
            controllers.forEach(c => c.display.style.color = "#f08519");
        }
        return hasChanged;
    }

    async function fetchSingleParamData(ctrl) {
        try {
            const response = await fetch(`${READ_SINGLE_URL}?param=${ctrl.param}`);
            if (!response.ok) return;
            
            let resData = await response.json();
            if (resData && resData.reply) {
                resData = resData.reply;
            }

            let rawVal;
            if (typeof resData === 'number') {
                rawVal = resData;
            } else if (resData && resData.value !== undefined) {
                rawVal = resData.value;
            } else if (resData && resData[ctrl.param] !== undefined) {
                rawVal = resData[ctrl.param];
            }

            if (rawVal !== undefined && rawVal !== null && !isNaN(rawVal)) {
                const valFromPLC = Number(rawVal) / 10;
                ctrl.original = valFromPLC;
                ctrl.current = valFromPLC;
                ctrl.display.textContent = `${valFromPLC.toFixed(1)} sec`;
                
                cachedPLCData[ctrl.param] = rawVal;
            }
        } catch (err) {
            console.log(`[Fallback] Failed to read single parameter ${ctrl.param}`, err);
        }
    }

    async function fetchLatestData() {
        let allData = null;
        try {
            const response = await fetch(READ_ALL_URL);
            if (response.ok) {
                const resJson = await response.json();
                allData = resJson.reply || resJson;
                cachedPLCData = Object.assign({}, cachedPLCData, allData); 
            }
        } catch (err) {
            console.log("ALL API request failed, switching to single API fallback...");
        }

        for (const ctrl of controllers) {
            const rawVal = allData ? allData[ctrl.param] : undefined;

            if (rawVal !== undefined && rawVal !== null && !isNaN(rawVal)) {
                const valFromPLC = Number(rawVal) / 10;
                ctrl.original = valFromPLC;
                
                if (!confirmBar.classList.contains('show')) {
                    ctrl.current = valFromPLC;
                    ctrl.display.textContent = `${valFromPLC.toFixed(1)} sec`;
                }
            } else {
                await fetchSingleParamData(ctrl);
            }
        }

        updateUPH();
        checkChanges();
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            if (!confirm("Are you sure you want to send the reset command?")) return;
            try {
                const payload = { "param": "RESET_ALL_TIMERELAY", "value": true };
                const response = await fetch(WRITE_M_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    alert("Reset command sent successfully!");
                    fetchLatestData();
                } else {
                    const errText = await response.text();
                    alert(`Reset failed (${response.status}): ${errText}`);
                }
            } catch (err) {
                console.error("Failed to send reset request:", err);
                alert(`Connection failed: ${err.message}`);
            }
        });
    }

    confirmBtn.addEventListener('click', async () => {
        const changedItems = controllers.filter(c => c.current !== c.original);
        if (changedItems.length === 0) return;

        confirmBtn.disabled = true;
        confirmBtn.textContent = "Saving...";

        try {
            const requests = changedItems.map(item => {
                const payload = {
                    param: item.param,
                    value: Math.round(item.current * 10)
                };
                return fetch(WRITE_D_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            });

            const responses = await Promise.all(requests);
            const allSuccess = responses.every(r => r.ok);

            if (allSuccess) {
                alert("PLC updated successfully!");
                changedItems.forEach(c => {
                    c.commit();
                    cachedPLCData[c.param] = c.original * 10;
                });
                updateUPH();
                checkChanges();
            } else {
                throw new Error("Failed to write some parameters");
            }
        } catch (err) {
            alert(`Update failed: ${err.message}`);
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = "Confirm Save (SET)";
        }
    });

    fetchLatestData();
});