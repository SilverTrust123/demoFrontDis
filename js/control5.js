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
        30: { animTime: 1.00 },
        31: { animTime: 0.20, waitParam: "T40" },
        32: { animTime: 0.30, waitParam: "T12" },
        33: { animTime: 0.50 },
        34: { animTime: 1.00 },
        35: { animTime: 0.50 },
        36: { animTime: 0.30, waitParam: "T13" },
        37: { animTime: 0.50 }
    };
    
    // ⚡ control5 (滑台缸) 屬於非金屬專屬製程：S1 + S30 ~ S37
    const seqNonMetalFull = [1, 30, 31, 32, 33, 34, 35, 36, 37];
    let cachedPLCData = {}; 

    // 建立確認按鈕列
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
    // 對應點位參數：T40 (向下停止), T12 (夾取後等待), T13 (放開後等待)
    const paramNames = ["T40", "T12", "T13"];

    controlRows.forEach((row, index) => {
        const timeDisplay = row.querySelector('.time-box');
        const minusBtn = row.querySelector('.control-adjust button:first-child');
        const plusBtn = row.querySelector('.control-adjust button:last-child');

        const paramKey = paramNames[index] || `T${index}`;
        // ⚡ 修正：初始值改抓 DEFAULT_PARAMS，避免一開始讀不到算成 99
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

    // ⚡ 僅以非金屬序列 (S1+S30~S37) 計算循環時間
    function calculateCycleTime(useCurrent = false) {
        let totalTime = 0;
        seqNonMetalFull.forEach(state => {
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

    // ⚡ 僅更新非金屬每小時產量
    function updateUPH() {
        let cycleTime = calculateCycleTime(false);
        let currentUPH = cycleTime > 0 ? Math.round(3600 / cycleTime) : 0;
        const uphElement = document.getElementById('current-uph');
        if (uphElement) uphElement.innerText = currentUPH;
    }

    // 檢查是否有數值被變更，決定是否顯示提示列，並更新非金屬預期新產量
    function checkChanges() {
        const hasChanged = controllers.some(c => c.current !== null && c.current !== c.original);
        if (hasChanged) {
            confirmBar.classList.add('show');
            controllers.forEach(c => {
                c.display.style.color = (c.current !== c.original) ? "#d9534f" : "#f08519";
            });

            // ⚡ 更新預覽的新非金屬產能
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

    // 發送單一參數 API 做備援 (處理 reply 物件)
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
            console.log(`[Fallback] 讀取單一參數 ${ctrl.param} 亦失敗`, err);
        }
    }

    // 核心邏輯：解包 reply 並即時更新畫面與產能
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
            console.log("ALL API 請求失敗，準備轉為單一 API 備援...");
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

    // 重置按鈕邏輯
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            if (!confirm("確定要發送重置指令嗎？")) return;

            try {
                const payload = {
                    "param": "RESET_ALL_TIMERELAY",
                    "value": true
                };

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

    // 儲存 (SET) 邏輯
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

    // 頁面初次載入立即抓取後端資料，並啟動背景輪詢
    fetchLatestData();
    setInterval(fetchLatestData, 2000); 
});