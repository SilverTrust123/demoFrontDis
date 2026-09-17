document.addEventListener('DOMContentLoaded', () => {
    // Configured based on the backend service address and port in your screenshot
    const BASE_URL = 'http://192.168.3.85:9090/report/pdf';

    // Get HTML elements
    const allTimeSelect = document.getElementById('all-time-select');
    const partTimeSelect = document.getElementById('part-time-select');
    const btnDownloadAll = document.getElementById('btn-download-all');
    const btnDownloadPart = document.getElementById('btn-download-part');
    const startTimeInput = document.getElementById('start-time');
    const endTimeInput = document.getElementById('end-time');

    // 1. Download report for all time ranges
    btnDownloadAll.addEventListener('click', () => {
        const reportType = allTimeSelect.value;
        if (!reportType) {
            alert('Please select a report type for all time ranges to download!');
            return;
        }

        const url = `${BASE_URL}/${reportType}`;
        triggerDirectDownload(url);
    });

    // 2. Download report for specific time range
    btnDownloadPart.addEventListener('click', () => {
        const reportType = partTimeSelect.value;
        const startTimeVal = startTimeInput.value;
        const endTimeVal = endTimeInput.value;

        if (!reportType) {
            alert('Please select a report type for the specific time range to download!');
            return;
        }

        if (!startTimeVal || !endTimeVal) {
            alert('Please select both the start time and end time!');
            return;
        }

        // Convert input time to Unix Timestamp (10 digits in seconds)
        // end=1786684704 in the screenshot is 10 digits (seconds), so use Math.floor( / 1000)
        const startTimestamp = Math.floor(new Date(startTimeVal).getTime() / 1000);
        const endTimestamp = Math.floor(new Date(endTimeVal).getTime() / 1000);

        if (startTimestamp >= endTimestamp) {
            alert('Start time must be earlier than end time!');
            return;
        }

        const url = `${BASE_URL}/${reportType}/betweenTimes?start=${startTimestamp}&end=${endTimestamp}`;
        triggerDirectDownload(url);
    });

    /**
     * Trigger direct browser download
     * When the backend response header contains Content-Disposition, the browser will automatically pop up the download dialog with the default filename.
     */
    function triggerDirectDownload(url) {
        const a = document.createElement('a');
        a.href = url;
        // Even if a.download is not explicitly set, the browser will prioritize using the filename returned in the backend Header
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
});