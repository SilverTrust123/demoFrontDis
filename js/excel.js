document.addEventListener('DOMContentLoaded', () => {
    // 後端 Excel 基礎路徑 (可依實際 IP/Port 微調)
    const BASE_URL = 'http://192.168.3.85:9090/report/excel';

    // 取得 DOM 元素
    const allSelect = document.getElementById('excel-all-select');
    const partSelect = document.getElementById('excel-part-select');
    const btnAll = document.getElementById('btn-excel-all');
    const btnPart = document.getElementById('btn-excel-part');

    // 初始化 Flatpickr 時間選擇器 (使用可含時分秒的格式)
    const fpStart = flatpickr("#excel-start-time", {
        enableTime: true,
        dateFormat: "Y-m-d H:i:S",
        defaultDate: new Date().setHours(0, 0, 0, 0)
    });

    const fpEnd = flatpickr("#excel-end-time", {
        enableTime: true,
        dateFormat: "Y-m-d H:i:S",
        defaultDate: new Date()
    });

    // 1. 下載全部時間段 Excel
    btnAll.addEventListener('click', () => {
        const reportType = allSelect.value;
        if (!reportType) {
            alert('請選擇要下載的全部時間段 Excel 類型！');
            return;
        }

        const url = `${BASE_URL}/${reportType}`;
        triggerDirectDownload(url);
    });

    // 2. 下載部分時間段 Excel
    btnPart.addEventListener('click', () => {
        const reportType = partSelect.value;
        const startDates = fpStart.selectedDates;
        const endDates = fpEnd.selectedDates;

        if (!reportType) {
            alert('請選擇要下載的部分時間段 Excel 類型！');
            return;
        }

        if (startDates.length === 0 || endDates.length === 0) {
            alert('請完整選擇開始時間與結束時間！');
            return;
        }

        // 轉為 10 位數 (秒級) Unix Timestamp
        const startTimestamp = Math.floor(startDates[0].getTime() / 1000);
        const endTimestamp = Math.floor(endDates[0].getTime() / 1000);

        if (startTimestamp >= endTimestamp) {
            alert('開始時間必須早於結束時間！');
            return;
        }

        const url = `${BASE_URL}/${reportType}/betweenTimes?start=${startTimestamp}&end=${endTimestamp}`;
        triggerDirectDownload(url);
    });

    /**
     * 觸發瀏覽器直接下載 Excel
     */
    function triggerDirectDownload(url) {
        const a = document.createElement('a');
        a.href = url;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
});