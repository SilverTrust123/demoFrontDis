/**
 * js/log.js - 兼容純文字與 JSON 格式的日誌處理器
 * 已整合 CONFIG.API_BASE 實現全域 IP 管理
 */

document.addEventListener('DOMContentLoaded', () => {
    const logListElement = document.getElementById('log-list');
    const infoBtn = document.getElementById('btn-info');
    
    // 全域儲存當前獲取的原始 logs，方便進行前端時間篩選
    let currentLogs = [];

    // --- 1. 配置 API 端點 (引用 global.js 的 CONFIG) ---
    const endpoints = {
        all: `${CONFIG.API_BASE}/log/all`,
        warn: `${CONFIG.API_BASE}/log/warn`,
        error: `${CONFIG.API_BASE}/log/error`,
        info: `${CONFIG.API_BASE}/fullLog`,
        truncate: `${CONFIG.API_BASE}/log/truncateAllLog` // 清理日誌 API
    };

    window.refreshLogUI = function() {
        const token = localStorage.getItem(CONFIG.AUTH_KEY); // 使用 CONFIG 的 KEY
        if (token) {
            infoBtn.classList.remove('locked');
            infoBtn.innerHTML = "Information";
        } else {
            infoBtn.classList.add('locked');
            infoBtn.innerHTML = "Information 🔒";
        }
    };

   async function fetchLogs(type) {
        document.querySelectorAll('.log-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(`btn-${type}`);
        if(activeBtn) activeBtn.classList.add('active');

        // 取得時間區間群組與相關輸入控制項
        const timePickerGroup = document.querySelector('.time-picker-group');
        const startInput = document.getElementById('filter-start');
        const endInput = document.getElementById('filter-end');

        // ✨ 直接用 style.display 控制，簡單暴力且絕對有效
        if (type === 'info') {
            if (startInput) startInput.value = ''; 
            if (endInput) endInput.value = '';
            if (timePickerGroup) {
                timePickerGroup.style.display = 'none'; // 直接隱藏
            }
        } else {
            if (timePickerGroup) {
                timePickerGroup.style.display = 'flex'; // 恢復顯示
            }
        }

        logListElement.innerHTML = `<li>正在檢索數據 [${type.toUpperCase()}]...</li>`;

        try {
            const endpointUrl = endpoints[type];
            const response = await window.fetchWithAuth(endpointUrl, { method: 'GET' });

            if (response.status === 403) throw new Error("存取權限不足");
            if (!response.ok) throw new Error(`HTTP 錯誤: ${response.status}`);

            const rawData = await response.text();
            console.log(`📥 收到 ${type} 原始數據內容`);

            let logs = [];
            if (rawData.trim().startsWith('[') || rawData.trim().startsWith('{')) {
                try {
                    const jsonData = JSON.parse(rawData);
                    logs = Array.isArray(jsonData) ? jsonData : (jsonData.response || [jsonData]);
                } catch (e) {
                    logs = parseRawTextToLogs(rawData);
                }
            } else {
                logs = parseRawTextToLogs(rawData);
            }

            currentLogs = logs; 
            filterAndRenderLogs(); 
        } catch (error) {
            console.error("Fetch Error:", error);
            logListElement.innerHTML = `<li style="color:#e74c3c">載入失敗: ${error.message}</li>`;
        }
    }
    /**
     * 根據時間選擇器過濾並渲染日誌
     */
    function filterAndRenderLogs() {
        // 如果當前是 Information 模式，直接略過時間篩選（顯示全部載入的資料）
        const activeBtn = document.querySelector('.log-btn.active');
        if (activeBtn && activeBtn.id === 'btn-info') {
            renderLogs(currentLogs);
            return;
        }

        const startVal = document.getElementById('filter-start').value;
        const endVal = document.getElementById('filter-end').value;

        const startTimeTs = startVal ? new Date(startVal).getTime() : 0;
        const endTimeTs = endVal ? new Date(endVal).getTime() : Infinity;

        const filteredLogs = currentLogs.filter(log => {
            if (!log.timestamp) return true; // 若無時間戳則不進行篩選
            
            const logTimeMs = log.timestamp < 10000000000 ? log.timestamp * 1000 : log.timestamp;
            return logTimeMs >= startTimeTs && logTimeMs <= endTimeTs;
        });

        renderLogs(filteredLogs);
    }

    /**
     * 執行清理日誌 API
     */
    async function clearAllLogs() {
        if (!confirm("確定要清空所有系統日誌嗎？此動作無法復原！")) {
            return;
        }

        try {
            logListElement.innerHTML = `<li>正在清理日誌數據...</li>`;
            const response = await window.fetchWithAuth(endpoints.truncate, { method: 'GET' });

            if (response.status === 403) throw new Error("存取權限不足");
            if (!response.ok) throw new Error(`HTTP 錯誤: ${response.status}`);

            alert("系統日誌已成功清空！");
            
            // 清理完成後重新載入列表
            const activeBtn = document.querySelector('.log-btn.active');
            fetchLogs(activeBtn ? activeBtn.id.replace('btn-', '') : 'all');

        } catch (error) {
            console.error("Clear Log Error:", error);
            alert(`清理失敗: ${error.message}`);
            filterAndRenderLogs();
        }
    }

    /**
     * 將純文字 Log 轉換為物件格式
     */
    function parseRawTextToLogs(text) {
        const lines = text.split(/\n/); 
        return lines.filter(line => line.trim() !== "").map(line => {
            let level = 'INFO';
            if (line.includes('WARN')) level = 'WARN';
            if (line.includes('ERROR')) level = 'ERROR';

            return {
                timestamp: null, 
                log_level: level,
                source: 'RAW',
                message: line,
                isRawText: true 
            };
        });
    }

    function renderLogs(logs) {
        logListElement.innerHTML = "";
        if (!logs || logs.length === 0) {
            logListElement.innerHTML = "<li>目前無符合區間的日誌數據。</li>";
            return;
        }

        logs.forEach(log => {
            const li = document.createElement('li');
            li.className = "log-item";
            
            if (log.log_level === 'ERROR') li.classList.add('log-warning-row');

            if (log.isRawText) {
                li.innerHTML = `<span class="log-msg-raw" style="white-space: pre-wrap; font-family: monospace; font-size: 0.9rem;">${log.message}</span>`;
            } else {
                let timeStr = 'N/A';
                if (log.timestamp) {
                    const timeMs = log.timestamp < 10000000000 ? log.timestamp * 1000 : log.timestamp;
                    timeStr = new Date(timeMs).toLocaleString('zh-TW', { hour12: false });
                }

                const levelClass = `level-${(log.log_level || 'info').toLowerCase()}`;
                li.innerHTML = `
                    <span style="color: #888; font-size: 0.85rem; min-width: 160px;">[${timeStr}]</span>
                    <b class="${levelClass}" style="min-width: 70px; display: inline-block;">[${log.log_level || 'INFO'}]</b>
                    <span style="color: #2980b9; font-weight: bold; min-width: 100px;">[${log.source || 'SYS'}]</span>
                    <span class="log-msg">${log.message || '無內容'}</span>
                `;
            }
            logListElement.appendChild(li);
        });
    }

    // 事件綁定
    ['all', 'warn', 'error', 'info'].forEach(type => {
        const btn = document.getElementById(`btn-${type}`);
        if(btn) btn.addEventListener('click', () => fetchLogs(type));
    });

    // 點擊「執行查詢」按鈕時對當前日誌進行時間過濾
    const searchBtn = document.getElementById('btn-search-time');
    if(searchBtn) {
        searchBtn.addEventListener('click', () => {
            filterAndRenderLogs();
        });
    }

    // 綁定清理 Log 按鈕點擊事件
    const clearBtn = document.getElementById('btn-clear-log');
    if(clearBtn) {
        clearBtn.addEventListener('click', clearAllLogs);
    }

    window.refreshLogUI(); 
    fetchLogs('all');      
});