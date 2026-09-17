const states = {
    "S1": { light: 0, text: "S1 等待物料" },
    "S10": { light: 1, text: "S10 龍門向右預位" },
    "S11": { light: 1, text: "S11 龍門向下預位" },
    "S12": { light: 1, text: "S12 夾持工作, 龍門向上" },
    "S13": { light: 1, text: "S13 龍門向左" },
    "S14": { light: 1, text: "S14 龍門向下" },
    "S15": { light: 1, text: "S15 放開夾爪" },
    "S16": { light: 1, text: "S16 龍門向上" },
    "S17": { light: 2, text: "S17 輸送帶2" },
    "S18": { light: 3, text: "S18 轉臂向下" },
    "S19": { light: 3, text: "S19 吸附工件" },
    "S20": { light: 3, text: "S20 吸盤向上" },
    "S21": { light: 3, text: "S21 吸盤旋轉向下" },
    "S22": { light: 3, text: "S22 解真空" },
    "S23": { light: 3, text: "S23 吸盤向上" },
    "S24": { light: 3, text: "S24 吸盤歸位" },
    "S30": { light: 4, text: "S30 滑台向左" },
    "S31": { light: 4, text: "S31 滑台向下" },
    "S32": { light: 4, text: "S32 夾持工件" },
    "S33": { light: 4, text: "S33 滑台向上" },
    "S34": { light: 4, text: "S34 滑台向右" },
    "S35": { light: 4, text: "S35 滑台向下" },
    "S36": { light: 4, text: "S36 放開工件" },
    "S37": { light: 4, text: "S37 滑台向上" }
};

// ✨ 統一 IP 動態抓取邏輯 (如果是 localhost 開啟就自動綁 localhost，否則用 192.168.3.85)
const HOST = (window.location.hostname && window.location.hostname !== "") ? window.location.hostname : "192.168.3.85";
const STATE_URL = `http://192.168.3.85:9090/plc/state`;
const RESET_URL = `http://192.168.3.85:9090/plc/writeMPoint`;
const ESTOP_URL = `http://192.168.3.85:9090/plc/EStop`;

// 用於記錄目前工件「已經跑過」的步驟 Key
let completedSteps = new Set();
let lastStateKey = "";

const lights = document.querySelectorAll('.indicator-light');
const boardContent = document.querySelector('.board-content');

/**
 * 更新右側看板
 * @param {string} currentStateKey 目前所在的步驟 Key (例如: "S10")
 */
function updateBoard(currentStateKey) {
    if (!states[currentStateKey]) return;

    const currentLightIndex = states[currentStateKey].light;

    // 將當前步驟加入已完成集合
    completedSteps.add(currentStateKey);

    // 篩選出屬於當前設備（燈號）的所有步驟
    let htmlLines = Object.keys(states)
        .filter(key => states[key].light === currentLightIndex)
        .map(key => {
            const isActive = (key === currentStateKey);
            const isDone = completedSteps.has(key);
            const icon = isDone ? "○" : "✖";
            
            const activeClass = isActive ? "active-text" : "";
            return `<p class="${activeClass}">${icon} ${states[key].text}</p>`;
        }).join("");

    // 重新渲染看板內容
    boardContent.innerHTML = `
        <div class="status-container">
            <h2>STEP</h2>
            <div class="steps-list">
                ${htmlLines}
            </div>
        </div>
    `;
}

/**
 * 重置生產線函式
 */
async function resetProductionLine() {
    const btn = document.getElementById('reset-btn');
    
    try {
        if (btn) btn.disabled = true;

        console.log("正在發送重置請求至:", RESET_URL);

        // 改為傳送單一 JSON 物件 (非陣列)
        const payload = {
            "param": "RTESTART",
            "value": true
        };

        const response = await fetch(RESET_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            alert("生產線已發送重置指令！");
        } else {
            // 讀取後端回傳的錯誤細節，協助釐清 400 原因
            const errorText = await response.text();
            console.error("後端回應錯誤內容:", errorText);
            alert(`重置失敗 請檢查是否已登入`);
        }
    } catch (err) {
        console.error("發送重置請求時發生錯誤:", err);
        alert(`無法連線至伺服器進行重置！\n目標網址：${RESET_URL}\n錯誤訊息：${err.message}`);
    } finally {
        if (btn) btn.disabled = false;
    }
}

/**
 * 強制停機 (EStop) 函式
 */
async function emergencyStop() {
    const btn = document.getElementById('estop-btn');
    
    // 彈出確認視窗，防止誤觸
    if (!confirm("確定要執行【強制停機】嗎？")) {
        return;
    }

    try {
        if (btn) btn.disabled = true;

        console.log("正在發送強制停機請求至:", ESTOP_URL);

        // 發送 GET 請求至 /plc/EStop
        const response = await fetch(ESTOP_URL, {
            method: 'GET',
            headers: {
                'accept': '*/*'
            }
        });

        if (response.ok) {
            alert("已成功發送【強制停機】指令！");
        } else {
            const errorText = await response.text();
            console.error("急停回應錯誤:", errorText);
            alert(`強制停機失敗 (${response.status})：\n${errorText || '請檢查後端日誌'}`);
        }
    } catch (err) {
        console.error("發送強制停機請求時發生錯誤:", err);
        alert(`無法連線至伺服器執行強制停機！\n目標網址：${ESTOP_URL}\n錯誤訊息：${err.message}`);
    } finally {
        if (btn) btn.disabled = false;
    }
}

/**
 * 向後端 API 取得最新狀態並更新 UI
 */
async function fetchStateFromPLC() {
    try {
        const response = await fetch(STATE_URL);
        if (!response.ok) throw new Error("網路連線錯誤");

        const data = await response.json();
        
        // 取得 reply 值 (如 "10") 並組合為 "S10"
        const rawState = data.reply;
        const stateKey = `S${rawState}`;

        // 如果連線取得的狀態沒有定義在 states 中則跳過
        if (!states[stateKey]) {
            console.warn(`未知的狀態碼: ${stateKey}`);
            return;
        }

        // 判斷是否開啟新流程：當狀態回到 S1，且上一次不是 S1 時，重置紀錄
        if (stateKey === "S1" && lastStateKey !== "S1") {
            completedSteps.clear();
        }
        lastStateKey = stateKey;

        // 1. 更新燈號 (亮起當前設備對應燈號)
        const currentLightIndex = states[stateKey].light;
        lights.forEach(light => light.classList.remove('active'));
        if (lights[currentLightIndex]) {
            lights[currentLightIndex].classList.add('active');
        }

        // 2. 更新右側看板
        updateBoard(stateKey);

    } catch (err) {
        console.error("無法取得 PLC 狀態:", err);
        // 當 API 連線失敗時的提示
        boardContent.innerHTML = `
            <div class="status-container">
                <h2>離線中</h2>
                <p style="color: red;">無法連線至 PLC Server</p>
            </div>
        `;
    }
}

// 設定每 500 毫秒 (0.5秒) 向後端輪詢一次最新狀態
setInterval(fetchStateFromPLC, 500);

// 頁面載入後立即執行一次
fetchStateFromPLC();