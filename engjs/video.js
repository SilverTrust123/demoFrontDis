document.addEventListener('DOMContentLoaded', () => {
    // Get the current URL hostname (supports localhost or 192.168.3.85)
    const HOST = window.location.hostname || "192.168.3.85";
    
    // ⚡ Directly use the provided stream and log API endpoints
    const VIDEO_STREAM_URL = `http://192.168.3.85:5000/video_feed`;
    const CAM_API_URL = `${typeof CONFIG !== 'undefined' && CONFIG.API_BASE ? CONFIG.API_BASE : `http://192.168.3.85:9090`}/camData/`;

    const contentWrapper = document.querySelector('.content-wrapper');
    if (!contentWrapper) return;

    // 1. Dynamically generate two-column HTML layout (⚡ Changed two buttons to a single Toggle button)
    contentWrapper.innerHTML = `
        <div class="video-content-layout">
            <!-- Left Pane: Video Preview and Controls -->
            <div class="video-left-pane">
                <div class="video-controls-group">
                    <!-- ⚡ Changed to a single button here -->
                    <button class="vid-action-btn btn-show" id="btn-toggle-video">Show Video</button>
                </div>
                <div class="video-display-box" id="videoBox">
                    <span class="video-placeholder-text" id="placeholderText">Video stream closed</span>
                    <img id="camStreamImg" alt="Camera" />
                </div>
            </div>

            <!-- Right Pane: Intrusion Log Panel -->
            <div class="video-right-pane" id="logContainer">
                <!-- Dynamically generated logs will be inserted here -->
            </div>
        </div>
    `;

    const toggleBtn = document.getElementById('btn-toggle-video');
    const camImg = document.getElementById('camStreamImg');
    const placeholder = document.getElementById('placeholderText');
    const logContainer = document.getElementById('logContainer');

    let isVideoShowing = false; // Tracks whether video is currently displaying

    // 2. ⚡ Single button toggle logic
    toggleBtn.addEventListener('click', () => {
        isVideoShowing = !isVideoShowing; // Toggle state

        if (isVideoShowing) {
            // Turn on video
            camImg.src = VIDEO_STREAM_URL; 
            camImg.style.display = 'block';
            placeholder.style.display = 'none';
            // Update button appearance to "Hide"
            toggleBtn.textContent = 'Hide Video';
            toggleBtn.classList.remove('btn-show');
            toggleBtn.classList.add('btn-hide');
        } else {
            // Turn off video
            camImg.src = ""; // Clear src to stop connection
            camImg.style.display = 'none';
            placeholder.style.display = 'block';
            // Update button appearance to "Show"
            toggleBtn.textContent = 'Show Video';
            toggleBtn.classList.remove('btn-hide');
            toggleBtn.classList.add('btn-show');
        }
    });

    // 4. Periodically request backend API to fetch intrusion logs and render them in the right panel
    async function fetchCamLogs() {
        try {
            const response = await fetch(CAM_API_URL);
            if (!response.ok) return;
            const data = await response.json();
            
            // Supports both array and single object formats
            const records = Array.isArray(data) ? data : [data];
            
            // Clear old logs and re-render
            logContainer.innerHTML = '';

            records.forEach(item => {
                const deviceName = item.deviceId || "CAM";
                const isDanger = item.danger ? "Yes" : "No";
                const personCount = item.personCount || 0;
                
                // Convert timestamp to a readable time format (e.g., 8/31 14:28)
                const dateObj = item.timestamp ? new Date(item.timestamp * 1000) : new Date();
                const month = dateObj.getMonth() + 1;
                const day = dateObj.getDate();
                const hours = String(dateObj.getHours()).padStart(2, '0');
                const mins = String(dateObj.getMinutes()).padStart(2, '0');
                const timeStr = `${month}/${day} ${hours}:${mins}`;

                // ⚡ HTML formatted exactly according to the layout design
                const logItemHTML = `
                    <div class="log-entry">
                        <div>Device Name: ${deviceName}</div>
                        <div>Intrusion Detected: ${isDanger}</div>
                        <div>Intruder Count: ${personCount}</div>
                        <div>Timestamp: ${timeStr}</div>
                    </div>
                `;
                logContainer.insertAdjacentHTML('beforeend', logItemHTML);
            });

            // Display message if no records exist
            if (records.length === 0) {
                logContainer.innerHTML = '<div style="color: #666; text-align: center; padding: 20px; font-size: 24px;">No intrusion records available</div>';
            }

        } catch (err) {
            console.warn("Failed to retrieve camera API logs", err);
        }
    }

    // Fetch once on initialization, and automatically sync right-side logs every 3 seconds
    fetchCamLogs();
    setInterval(fetchCamLogs, 3000);
});