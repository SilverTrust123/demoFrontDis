document.addEventListener('DOMContentLoaded', () => {
    const boardContent = document.querySelector('.board-content');
    const controlRows = document.querySelectorAll('.control-row');
    const resetBtn = document.getElementById('reset-btn');
    
    const HOST = window.location.hostname || "192.168.3.85";
    const API_BASE = `http://192.168.3.85:9090`;
    
    // API 端點設定
    const WRITE_D_URL = `${API_BASE}/plc/writeDPoint`;
    const READ_ALL_URL = `${API_BASE}/plc/AllDPointData`; // 優先使用
    const READ_SINGLE_URL = `${API_BASE}/plc/DPointData`; // 備援使用
    const WRITE_M_URL = `${API_BASE}/plc/writeMPoint`;

    // ⚡ 1. 補上統一的 DEFAULT_PARAMS，對齊其他頁面基準 (解決算出 99 的問題)
    const DEFAULT_PARAMS = {
        "T14": 5.0, "T0": 0.5, "T7": 1.0,
        "T30": 1.0, "T3": 1.0, "T4": 1.0, "T31": 1.0, "T5": 1.0, "T6": 1.0, "T15": 5.0,
        "T8": 1.0, "T9": 1.0, "T32": 1.0, "T10": 1.0, "T11": 1.0,
        "T40": 1.0, "T12": 1.0, "T13": 1.0
    };

    // 2. PLC 狀態字典與序列
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

    // ⚡ 僅保留金屬序列 (S1~S24) 進行產能計算
    const seqMetalFull = [1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
    let cachedPLCData = {}; 

    // 建立確認按鈕列 (加入預測產能的文字)
    let confirmBar = document.querySelector('.floating-confirm-bar');
    if (!confirmBar) {
        confirmBar = document.createElement('div');
        confirmBar.className = 'floating-confirm-bar';
        confirmBar.innerHTML = `
            <span class="confirm-text" style="color:white; font-size:16px; font-weight:bold;">數值已變更&nbsp;&nbsp;&nbsp;每小時產量更動為 ➔ <span id="new-uph" style="color: #00ff88; font-size: 18px;">--</span></span>
            <button class="confirm-btn" id="save-btn">確認儲存 (SET)</button>
        `;
        boardContent.appendChild(confirmBar);
    }
    const confirmBtn = confirmBar.querySelector('.confirm-btn');

    const controllers = [];
    // 專屬 control4 (旋轉缸) 的 5 個參數
    const paramNames = ["T8", "T9", "T32", "T10", "T11"];

    controlRows.forEach((row, index) => {
        const timeDisplay = row.querySelector('.time-box');
        const minusBtn = row.querySelector('.control-adjust button:first-child');
        const plusBtn = row.querySelector('.control-adjust button:last-child');

        const paramKey = paramNames[index];
        // ⚡ 修正：初始值改抓 DEFAULT_PARAMS，避免算成 99
        let initialVal = DEFAULT_PARAMS[paramKey] !== undefined ? DEFAULT_PARAMS[paramKey] : 1.0;

        const ctrl = {
            param: paramKey,
            original: initialVal, 
            current: initialVal,  
            display: timeDisplay,
            update: (val) => {
                ctrl.current = val;
                // 原封不動保留你的秒數顯示排版
                timeDisplay.textContent = `${ctrl.current.toFixed(1)} sec`;
                checkChanges();
            },
            commit: () => {
                ctrl.original = ctrl.current;
            }
        };

        timeDisplay.textContent = `${ctrl.current.toFixed(1)} sec`;

        minusBtn.addEventListener('click', () => {
            if (ctrl.current === null) return;
            let nextVal = Math.round((ctrl.current - 0.5) * 10) / 10;
            if (nextVal >= 0) ctrl.update(nextVal);
        });

        plusBtn.addEventListener('click', () => {
            if (ctrl.current === null) return;
            let nextVal = Math.round((ctrl.current + 0.5) * 10) / 10;
            if (nextVal <= 10) ctrl.update(nextVal);
        });

        controllers.push(ctrl);
    });

    // ⚡ 僅以金屬序列計算循環時間
    function calculateCycleTime(useCurrent = false) {
        let totalTime = 0;
        seqMetalFull.forEach(state => {
            const step = PLC_STATES[state];
            if (step) {
                totalTime += step.animTime || 0; 
                
                if (step.waitParam) {
                    // ⚡ 修正：找不到參數時，優先套用 DEFAULT_PARAMS 作為備援
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

    // ⚡ 僅更新金屬每小時產量
    function updateUPH() {
        let cycleTime = calculateCycleTime(false);
        let currentUPH = cycleTime > 0 ? Math.round(3600 / cycleTime) : 0;
        const uphElement = document.getElementById('current-uph');
        if (uphElement) uphElement.innerText = currentUPH;
    }

    // 檢查是否有數值被變更，決定是否顯示提示列，並更新金屬新產量
    function checkChanges() {
        const hasChanged = controllers.some(c => c.current !== null && c.current !== c.original);
        if (hasChanged) {
            confirmBar.classList.add('show');
            controllers.forEach(c => {
                c.display.style.color = (c.current !== c.original) ? "#d9534f" : "#f08519";
            });

            // ⚡ 更新預覽的金屬新產能
            let newCycleTime = calculateCycleTime(true);
            let newUPH = newCycleTime > 0 ? Math.round(3600 / newCycleTime) : 0;
            const newUphEl = document.getElementById('new-uph');
            if (newUphEl) newUphEl.innerText = newUPH;

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
            console.log(`[Fallback] 讀取單一參數 ${ctrl.param} 失敗`);
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
            console.log("ALL API 請求失敗，轉為單一 API 備援...");
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
            if (!confirm("確定要發送重置指令嗎？")) return;

            try {
                const payload = { "param": "RESET_ALL_TIMERELAY", "value": true };
                const response = await fetch(WRITE_M_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    alert("重置指令發送成功！");
                    fetchLatestData();
                } else {
                    const errText = await response.text();
                    alert(`重置失敗 (${response.status}): ${errText}`);
                }
            } catch (err) {
                console.error("發送重置請求失敗:", err);
                alert(`連線失敗: ${err.message}`);
            }
        });
    }

    confirmBtn.addEventListener('click', async () => {
        const changedItems = controllers.filter(c => c.current !== null && c.current !== c.original);
        if (changedItems.length === 0) return;

        confirmBtn.disabled = true;
        confirmBtn.textContent = "寫入中...";

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
                alert("PLC 更新成功！");
                changedItems.forEach(c => {
                    c.commit();
                    cachedPLCData[c.param] = c.original * 10;
                });
                updateUPH();
                checkChanges();
            } else {
                throw new Error("部分參數寫入失敗");
            }
        } catch (err) {
            alert(`更新失敗: ${err.message}`);
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = "確認儲存 (SET)";
        }
    });

    fetchLatestData();
    setInterval(fetchLatestData, 2000); 
});