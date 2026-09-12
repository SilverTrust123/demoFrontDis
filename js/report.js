document.addEventListener('DOMContentLoaded', () => {
    // 根據您截圖中的後端服務地址與 Port 進行設定
    const BASE_URL = 'http://192.168.3.85:9090/report/pdf';

    // 取得 HTML 元素
    const allTimeSelect = document.getElementById('all-time-select');
    const partTimeSelect = document.getElementById('part-time-select');
    const btnDownloadAll = document.getElementById('btn-download-all');
    const btnDownloadPart = document.getElementById('btn-download-part');
    const startTimeInput = document.getElementById('start-time');
    const endTimeInput = document.getElementById('end-time');

    // 1. 下載全部時間段報表
    btnDownloadAll.addEventListener('click', () => {
        const reportType = allTimeSelect.value;
        if (!reportType) {
            alert('請選擇要下載的全部時間段報表類型！');
            return;
        }

        const url = `${BASE_URL}/${reportType}`;
        triggerDirectDownload(url);
    });

    // 2. 下載部分時間段報表
    btnDownloadPart.addEventListener('click', () => {
        const reportType = partTimeSelect.value;
        const startTimeVal = startTimeInput.value;
        const endTimeVal = endTimeInput.value;

        if (!reportType) {
            alert('請選擇要下載的部分時間段報表類型！');
            return;
        }

        if (!startTimeVal || !endTimeVal) {
            alert('請完整選擇開始時間與結束時間！');
            return;
        }

        // 將 input 的時間轉為 Unix Timestamp (秒 / 10 位數)
        // 截圖中的 end=1786684704 為 10 位數（秒級），因此使用 Math.floor( / 1000)
        const startTimestamp = Math.floor(new Date(startTimeVal).getTime() / 1000);
        const endTimestamp = Math.floor(new Date(endTimeVal).getTime() / 1000);

        if (startTimestamp >= endTimestamp) {
            alert('開始時間必須早於結束時間！');
            return;
        }

        const url = `${BASE_URL}/${reportType}/betweenTimes?start=${startTimestamp}&end=${endTimestamp}`;
        triggerDirectDownload(url);
    });

    /**
     * 觸發瀏覽器直接下載
     * 後端回應 Header 包含 Content-Disposition 時，瀏覽器會自動彈出下載並帶入預設檔名
     */
    function triggerDirectDownload(url) {
        const a = document.createElement('a');
        a.href = url;
        // 即使不設 a.download，瀏覽器也會優先使用後端 Header 回傳的 filename
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
});