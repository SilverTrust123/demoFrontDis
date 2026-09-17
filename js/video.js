document.addEventListener('DOMContentLoaded', () => {
    // 取得當前網址的 IP (支援 localhost 或 192.168.3.85)
    const HOST = window.location.hostname || "192.168.3.85";
    
    // ⚡ 直接使用你提供的串流與紀錄 API
    const VIDEO_STREAM_URL = `http://192.168.3.85:5000/video_feed`;
    const CAM_API_URL = `${typeof CONFIG !== 'undefined' && CONFIG.API_BASE ? CONFIG.API_BASE : `http://192.168.3.85:9090`}/camData/`;

    const contentWrapper = document.querySelector('.content-wrapper');
    if (!contentWrapper) return;

    // 1. 動態生成左右雙欄 HTML 結構 (⚡ 將兩顆按鈕改為單一 Toggle 按鈕)
    contentWrapper.innerHTML = `
        <div class="video-content-layout">
            <!-- 左側影像預覽與控制 -->
            <div class="video-left-pane">
                <div class="video-controls-group">
                    <!-- ⚡ 這裡改成單一一顆按鈕 -->
                    <button class="vid-action-btn btn-show" id="btn-toggle-video">畫面顯示</button>
                </div>
                <div class="video-display-box" id="videoBox">
                    <span class="video-placeholder-text" id="placeholderText">影像串流已關閉</span>
                    <img id="camStreamImg" alt="Camera" />
                </div>
            </div>

            <!-- 右側闖入紀錄面板 -->
            <div class="video-right-pane" id="logContainer">
                <!-- 動態生成的日誌會塞在這裡 -->
            </div>
        </div>
    `;

    const toggleBtn = document.getElementById('btn-toggle-video');
    const camImg = document.getElementById('camStreamImg');
    const placeholder = document.getElementById('placeholderText');
    const logContainer = document.getElementById('logContainer');

    let isVideoShowing = false; // 紀錄目前是否正在顯示影像

    // 2. ⚡ 單一按鈕切換邏輯
    toggleBtn.addEventListener('click', () => {
        isVideoShowing = !isVideoShowing; // 反轉狀態

        if (isVideoShowing) {
            // 開啟影像
            camImg.src = VIDEO_STREAM_URL; 
            camImg.style.display = 'block';
            placeholder.style.display = 'none';
            // 更改按鈕外觀為「關閉」
            toggleBtn.textContent = '畫面關閉';
            toggleBtn.classList.remove('btn-show');
            toggleBtn.classList.add('btn-hide');
        } else {
            // 關閉影像
            camImg.src = ""; // 清空 src 停止連線
            camImg.style.display = 'none';
            placeholder.style.display = 'block';
            // 更改按鈕外觀為「顯示」
            toggleBtn.textContent = '畫面顯示';
            toggleBtn.classList.remove('btn-hide');
            toggleBtn.classList.add('btn-show');
        }
    });

    // 4. 定期向後端請求 API 取得闖入紀錄並渲染至右側面板
    async function fetchCamLogs() {
        try {
            const response = await fetch(CAM_API_URL);
            if (!response.ok) return;
            const data = await response.json();
            
            // 支援陣列或單一物件格式
            const records = Array.isArray(data) ? data : [data];
            
            // 清空舊紀錄並重新渲染
            logContainer.innerHTML = '';

            records.forEach(item => {
                const deviceName = item.deviceId || "CAM";
                const isDanger = item.danger ? "是" : "否";
                const personCount = item.personCount || 0;
                
                // 將 timestamp 轉為易讀的時間格式 (例如 8/31 14:28)
                const dateObj = item.timestamp ? new Date(item.timestamp * 1000) : new Date();
                const month = dateObj.getMonth() + 1;
                const day = dateObj.getDate();
                const hours = String(dateObj.getHours()).padStart(2, '0');
                const mins = String(dateObj.getMinutes()).padStart(2, '0');
                const timeStr = `${month}/${day} ${hours}:${mins}`;

                // ⚡ 完全依照圖片排版的 HTML
                const logItemHTML = `
                    <div class="log-entry">
                        <div>裝置名稱：${deviceName}</div>
                        <div>是否有人闖入：${isDanger}</div>
                        <div>闖入人數：${personCount}</div>
                        <div>闖入時間點：${timeStr}</div>
                    </div>
                `;
                logContainer.insertAdjacentHTML('beforeend', logItemHTML);
            });

            // 如果沒有資料，顯示提示
            if (records.length === 0) {
                logContainer.innerHTML = '<div style="color: #666; text-align: center; padding: 20px; font-size: 24px;">目前尚無闖入紀錄</div>';
            }

        } catch (err) {
            console.warn("無法取得攝影機 API 紀錄", err);
        }
    }

    // 初始化抓取一次，並每 3 秒自動同步一次右側紀錄
    fetchCamLogs();
    setInterval(fetchCamLogs, 3000);
});