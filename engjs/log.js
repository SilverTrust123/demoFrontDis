/**
 * js/log.js - Log processor compatible with plain text and JSON formats
 * Integrated with CONFIG.API_BASE for global IP management
 */

document.addEventListener('DOMContentLoaded', () => {
    const logListElement = document.getElementById('log-list');
    const infoBtn = document.getElementById('btn-info');
    
    // Globally store currently fetched raw logs for frontend time filtering
    let currentLogs = [];

    // --- 1. Configure API Endpoints (from global.js CONFIG) ---
    const endpoints = {
        all: `${CONFIG.API_BASE}/log/all`,
        warn: `${CONFIG.API_BASE}/log/warn`,
        error: `${CONFIG.API_BASE}/log/error`,
        info: `${CONFIG.API_BASE}/fullLog`,
        truncate: `${CONFIG.API_BASE}/log/truncateAllLog` // Clear log API
    };

    window.refreshLogUI = function() {
        const token = localStorage.getItem(CONFIG.AUTH_KEY); // Use CONFIG KEY
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

        // Get time picker group and related input controls
        const timePickerGroup = document.querySelector('.time-picker-group');
        const startInput = document.getElementById('filter-start');
        const endInput = document.getElementById('filter-end');

        // ✨ Control directly with style.display
        if (type === 'info') {
            if (startInput) startInput.value = ''; 
            if (endInput) endInput.value = '';
            if (timePickerGroup) {
                timePickerGroup.style.display = 'none'; // Hide directly
            }
        } else {
            if (timePickerGroup) {
                timePickerGroup.style.display = 'flex'; // Restore display
            }
        }

        logListElement.innerHTML = `<li>Retrieving data [${type.toUpperCase()}]...</li>`;

        try {
            const endpointUrl = endpoints[type];
            const response = await window.fetchWithAuth(endpointUrl, { method: 'GET' });

            if (response.status === 403) throw new Error("Insufficient access permissions");
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

            const rawData = await response.text();
            console.log(`📥 Received ${type} raw data content`);

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
            logListElement.innerHTML = `<li style="color:#e74c3c">Load failed: ${error.message}</li>`;
        }
    }

    /**
     * Filter and render logs based on the time picker
     */
    function filterAndRenderLogs() {
        // If currently in Information mode, skip time filtering (display all loaded data)
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
            if (!log.timestamp) return true; // If no timestamp, do not filter
            
            const logTimeMs = log.timestamp < 10000000000 ? log.timestamp * 1000 : log.timestamp;
            return logTimeMs >= startTimeTs && logTimeMs <= endTimeTs;
        });

        renderLogs(filteredLogs);
    }

    /**
     * Execute clear log API
     */
    async function clearAllLogs() {
        if (!confirm("Are you sure you want to clear all system logs? This action cannot be undone!")) {
            return;
        }

        try {
            logListElement.innerHTML = `<li>Clearing log data...</li>`;
            const response = await window.fetchWithAuth(endpoints.truncate, { method: 'GET' });

            if (response.status === 403) throw new Error("Insufficient access permissions");
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

            alert("System logs cleared successfully!");
            
            // Reload list after clearing is complete
            const activeBtn = document.querySelector('.log-btn.active');
            fetchLogs(activeBtn ? activeBtn.id.replace('btn-', '') : 'all');

        } catch (error) {
            console.error("Clear Log Error:", error);
            alert(`Clear failed: ${error.message}`);
            filterAndRenderLogs();
        }
    }

    /**
     * Convert plain text Log to object format
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
            logListElement.innerHTML = "<li>No log data matches the specified time range.</li>";
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
                    timeStr = new Date(timeMs).toLocaleString('en-US', { hour12: false });
                }

                const levelClass = `level-${(log.log_level || 'info').toLowerCase()}`;
                li.innerHTML = `
                    <span style="color: #888; font-size: 0.85rem; min-width: 160px;">[${timeStr}]</span>
                    <b class="${levelClass}" style="min-width: 70px; display: inline-block;">[${log.log_level || 'INFO'}]</b>
                    <span style="color: #2980b9; font-weight: bold; min-width: 100px;">[${log.source || 'SYS'}]</span>
                    <span class="log-msg">${log.message || 'No content'}</span>
                `;
            }
            logListElement.appendChild(li);
        });
    }

    // Event binding
    ['all', 'warn', 'error', 'info'].forEach(type => {
        const btn = document.getElementById(`btn-${type}`);
        if(btn) btn.addEventListener('click', () => fetchLogs(type));
    });

    // Perform time filtering on current logs when "Search" button is clicked
    const searchBtn = document.getElementById('btn-search-time');
    if(searchBtn) {
        searchBtn.addEventListener('click', () => {
            filterAndRenderLogs();
        });
    }

    // Bind clear log button click event
    const clearBtn = document.getElementById('btn-clear-log');
    if(clearBtn) {
        clearBtn.addEventListener('click', clearAllLogs);
    }

    window.refreshLogUI(); 
    fetchLogs('all');      
});