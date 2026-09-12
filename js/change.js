document.addEventListener('DOMContentLoaded', () => {
    const textArea = document.getElementById('main-textarea');
    const saveStatus = document.getElementById('save-status');

    const HOST = window.location.hostname || "192.168.3.85";
    const GET_URL = `http://192.168.3.85:9090/todo/getMessage`; 
    const POST_URL = `http://192.168.3.85:9090/todo/saveMessage`;          

    let debounceTimer = null;

    // 1. 取得歷史交接事項 (GET)
    async function fetchMessages() {
        try {
            saveStatus.textContent = "載入中...";
            const response = await fetch(GET_URL, {
                method: 'GET',
                headers: { 'accept': '*/*' }
            });

            if (!response.ok) throw new Error('Network response was not ok');

            const dataArray = await response.json();
            
            // 抓取最後一筆資料顯示在畫布上
            if (dataArray && dataArray.length > 0) {
                const latestMessage = dataArray[dataArray.length - 1].message || "";
                textArea.value = latestMessage;
            }

            saveStatus.textContent = "已載入最新內容";
            saveStatus.style.color = '#888';
            setTimeout(() => { if (saveStatus.textContent === "已載入最新內容") saveStatus.textContent = ""; }, 2000);

        } catch (error) {
            console.error("無法取得交接事項:", error);
            saveStatus.textContent = '載入失敗';
            saveStatus.style.color = '#e74c3c';
        }
    }

    // 2. 發送新的交接事項 (POST)
    async function sendMessage() {
        const text = textArea.value;

        saveStatus.textContent = "儲存中...";
        saveStatus.style.color = '#888';

        try {
            const payload = { message: text };

            const response = await fetch(POST_URL, {
                method: 'POST',
                headers: {
                    'accept': '*/*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload) 
            });

            if (response.ok) {
                saveStatus.textContent = "已自動儲存 ✓";
                saveStatus.style.color = '#2ecc71'; // 成功綠色
                
                // 3秒後隱藏提示
                setTimeout(() => {
                    if (saveStatus.textContent === "已自動儲存 ✓") saveStatus.textContent = "";
                }, 3000);
            } else {
                saveStatus.textContent = "儲存失敗 ✕";
                saveStatus.style.color = '#e74c3c';
            }
        } catch (error) {
            console.error("發送訊息錯誤:", error);
            saveStatus.textContent = "網路錯誤，儲存失敗 ✕";
            saveStatus.style.color = '#e74c3c';
        }
    }

    // --- 綁定事件 (自動儲存機制) ---
    // 監聽鍵盤輸入事件，只要有打字就會觸發
    textArea.addEventListener('input', () => {
        saveStatus.textContent = "編輯中...";
        saveStatus.style.color = '#888';
        
        // 每次打字先清除前一個倒數計時器
        clearTimeout(debounceTimer);
        
        // 設定新的倒數計時器，停手 1000 毫秒 (1秒) 後自動呼叫 sendMessage()
        debounceTimer = setTimeout(() => {
            sendMessage();
        }, 1000);
    });

    // 頁面載入時立刻抓取歷史內容
    fetchMessages();
});