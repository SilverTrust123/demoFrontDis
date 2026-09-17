document.addEventListener('DOMContentLoaded', () => {
    // Backend Excel base URL (Adjust IP/Port based on environment)
    const BASE_URL = 'http://192.168.3.85:9090/report/excel';

    // Get DOM elements
    const allSelect = document.getElementById('excel-all-select');
    const partSelect = document.getElementById('excel-part-select');
    const btnAll = document.getElementById('btn-excel-all');
    const btnPart = document.getElementById('btn-excel-part');

    // Initialize Flatpickr date-time picker (supports YYYY-MM-DD HH:mm:SS format)
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

    // 1. Download full time range Excel report
    btnAll.addEventListener('click', () => {
        const reportType = allSelect.value;
        if (!reportType) {
            alert('Please select an Excel report type to download for the full time range!');
            return;
        }

        const url = `${BASE_URL}/${reportType}`;
        triggerDirectDownload(url);
    });

    // 2. Download partial time range Excel report
    btnPart.addEventListener('click', () => {
        const reportType = partSelect.value;
        const startDates = fpStart.selectedDates;
        const endDates = fpEnd.selectedDates;

        if (!reportType) {
            alert('Please select an Excel report type to download for the partial time range!');
            return;
        }

        if (startDates.length === 0 || endDates.length === 0) {
            alert('Please select both start and end times!');
            return;
        }

        // Convert to 10-digit (seconds) Unix Timestamp
        const startTimestamp = Math.floor(startDates[0].getTime() / 1000);
        const endTimestamp = Math.floor(endDates[0].getTime() / 1000);

        if (startTimestamp >= endTimestamp) {
            alert('Start time must be earlier than end time!');
            return;
        }

        const url = `${BASE_URL}/${reportType}/betweenTimes?start=${startTimestamp}&end=${endTimestamp}`;
        triggerDirectDownload(url);
    });

    /**
     * Triggers direct Excel file download in the browser
     */
    function triggerDirectDownload(url) {
        const a = document.createElement('a');
        a.href = url;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
});