document.addEventListener('DOMContentLoaded', () => {
    initTheme();           // 1. Initialize theme
    initErrorModal();      // 2. Initialize full-screen alert (Top alert)
    initToastModal();      // 3. Initialize bottom-right toast (Bottom warning)
    initLoginModal();      
    initTimeoutModal();    
    initSettingsSidebar(); 
    initControlButtons();  // 4. Dynamically inject and initialize Header left STOP / START buttons
    checkLoginStatus();
    
    // Start global background monitoring (integrating Webcam, API sensors, PLC, Log, and Backend status)
    startGlobalMonitor();

    // Automatically check if login expired every minute
    setInterval(checkLoginStatus, 60000); 
});

// --- Global Settings: Direct request to physical backend API address ---
const CONFIG = {
    API_BASE: "http://192.168.3.85:9090",
    AUTH_KEY: "admin_token", 
    TIME_KEY: "login_timestamp",
    EXPIRE_TIME: 24 * 60 * 60 * 1000,
    ALERT_COOLDOWN: 10000 
};

// Global Fetch Interceptor: Automatically append Token
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    let [resource, config] = args;
    
    const token = localStorage.getItem(CONFIG.AUTH_KEY);
    if (token && typeof resource === 'string' && resource.startsWith(CONFIG.API_BASE)) {
        config = config || {};
        config.headers = {
            ...config.headers,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }
    return originalFetch(resource, config);
};

window.fetchWithAuth = async function(url, options = {}) {
    const token = localStorage.getItem(CONFIG.AUTH_KEY);
    const authHeaders = { 'Content-Type': 'application/json', ...options.headers };
    if (token) authHeaders['Authorization'] = `Bearer ${token}`;
    return fetch(url, { ...options, headers: authHeaders });
};

// --- Global state variables ---
let isAlertActive = false;    // Control full-screen alert
let lastAlertTime = 0;        
let isToastActive = false;    // Control bottom-right toast
let lastToastTime = 0;

// State variables to track if a step is stagnant for too long
let lastPlcState = null;
let stateChangeTimestamp = Date.now();
const STATE_STAGNATE_LIMIT = 30000; // Considered stagnant if step doesn't change for over 30 seconds

/**
 * Dark mode logic
 */
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateDarkModeBtnUI(); 
}

function toggleDarkMode() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const targetTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', targetTheme);
    localStorage.setItem('theme', targetTheme);
    updateDarkModeBtnUI(); 
}

function updateDarkModeBtnUI() {
    const darkModeBtn = document.getElementById('sidebar-dark-mode-btn');
    if (darkModeBtn) {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        if (isEnglishPage()) {
            darkModeBtn.innerText = currentTheme === 'dark' ? ' Light Mode' : ' Dark Mode';
        } else {
            darkModeBtn.innerText = currentTheme === 'dark' ? ' Switch to Light Mode' : ' Switch to Dark Mode';
        }
    }
}

/* ==============================================================
 * Multi-language: Cross-folder (html <-> enghtml) routing mechanism
 * ============================================================== */

function isEnglishPage() {
    return window.location.pathname.includes('/enghtml/');
}

function toggleLanguage() {
    const path = window.location.pathname;
    let newPath = '';

    if (isEnglishPage()) {
        newPath = path.replace('/enghtml/', '/html/');
    } else if (path.includes('/html/')) {
        newPath = path.replace('/html/', '/enghtml/');
    } else {
        newPath = isEnglishPage() ? '../html/index.html' : '../enghtml/index.html';
    }

    window.location.href = newPath;
}

function updateLangBtnUI() {
    const langBtn = document.getElementById('sidebar-lang-btn');
    if (langBtn) {
        if (isEnglishPage()) {
            langBtn.innerText = ' Language: Switch to Chinese';
        } else {
            langBtn.innerText = ' Language: Switch to English';
        }
    }
}

/* ==============================================================
 * ⚡ Do Not Disturb (DND) mode control logic
 * ============================================================== */
function toggleDNDMode() {
    let isDND = localStorage.getItem('dnd_mode') === 'true';
    isDND = !isDND;
    localStorage.setItem('dnd_mode', isDND);
    updateDNDBtnUI();
}

function updateDNDBtnUI() {
    const dndBtn = document.getElementById('sidebar-dnd-btn');
    if (dndBtn) {
        const isDND = localStorage.getItem('dnd_mode') === 'true';
        if (isEnglishPage()) {
            dndBtn.innerHTML = `<span style="font-size: 22px; margin-right: 10px;">${isDND ? '🔕' : '✋'}</span> ${isDND ? 'DND Mode (ON)' : 'DND Mode'}`;
        } else {
            dndBtn.innerHTML = `<span style="font-size: 22px; margin-right: 10px;">${isDND ? '🔕' : '✋'}</span> ${isDND ? 'DND Mode (ON)' : 'DND Mode'}`;
        }
        dndBtn.style.color = isDND ? '#e74c3c' : 'var(--text-color)';
    }
}

/* ==============================================================
 * Machine control: Dynamically inject E-Stop and Resume buttons left to the "Home" title in the top left
 * ============================================================== */
function initControlButtons() {
    let btnStop = document.getElementById('btn-estop');
    let btnStart = document.getElementById('btn-start');

    if (!btnStop || !btnStart) {
        const brandLogo = document.querySelector('.brand-logo');
        const headerRow = document.querySelector('.header-main-row');

        if (brandLogo && headerRow) {
            const isEng = isEnglishPage();
            const stopText = isEng ? 'STOP' : 'E-STOP';
            const startText = isEng ? 'START' : 'RESUME';

            const controlContainer = document.createElement('div');
            controlContainer.id = 'global-header-controls';
            controlContainer.style.cssText = 'display: inline-flex; gap: 10px; align-items: center; margin-right: 15px;';

            controlContainer.innerHTML = `
                <button id="btn-estop" title="${stopText}" style="
                    width: 80px; height: 80px; border-radius: 50%;
                    background: linear-gradient(135deg, #ff4d4d, #c00000);
                    color: white; border: 2px solid #ffffff; font-weight: bold; font-size: 20px;
                    cursor: pointer; box-shadow: 0 4px 8px rgba(192, 0, 0, 0.4);
                    transition: transform 0.15s ease, box-shadow 0.15s ease;
                    display: flex; align-items: center; justify-content: center; outline: none;
                ">${stopText}</button>
                
                <button id="btn-start" title="${startText}" style="
                    width: 80px; height: 80px; border-radius: 50%;
                    background: linear-gradient(135deg, #2ecc71, #27ae60);
                    color: white; border: 2px solid #ffffff; font-weight: bold; font-size: 20px;
                    cursor: pointer; box-shadow: 0 4px 8px rgba(39, 174, 96, 0.4);
                    transition: transform 0.15s ease, box-shadow 0.15s ease;
                    display: flex; align-items: center; justify-content: center; outline: none;
                ">${startText}</button>
            `;

            headerRow.insertBefore(controlContainer, brandLogo);

            const addHoverEffect = (btn, normalShadow, hoverShadow) => {
                btn.onmouseover = () => { btn.style.transform = 'scale(1.08)'; btn.style.boxShadow = hoverShadow; };
                btn.onmouseout = () => { btn.style.transform = 'scale(1)'; btn.style.boxShadow = normalShadow; };
                btn.onmousedown = () => btn.style.transform = 'scale(0.95)';
                btn.onmouseup = () => btn.style.transform = 'scale(1.08)';
            };

            const newStop = document.getElementById('btn-estop');
            const newStart = document.getElementById('btn-start');
            if (newStop) addHoverEffect(newStop, '0 4px 8px rgba(192, 0, 0, 0.4)', '0 6px 12px rgba(192, 0, 0, 0.6)');
            if (newStart) addHoverEffect(newStart, '0 4px 8px rgba(39, 174, 96, 0.4)', '0 6px 12px rgba(39, 174, 96, 0.6)');
        }

        btnStop = document.getElementById('btn-estop');
        btnStart = document.getElementById('btn-start');
    }

    if (btnStop) btnStop.onclick = handleEStop;
    if (btnStart) btnStart.onclick = handleResumeStart;
}

async function handleEStop() {
    if (!confirm(isEnglishPage() ? "Are you sure you want to execute Emergency Stop?" : "Are you sure you want to execute Emergency Stop?")) return;
    try {
        const response = await fetchWithAuth(`${CONFIG.API_BASE}/plc/EStop`, { method: 'GET' });
        if (response.ok) {
            const result = await response.json();
            alert(`[${isEnglishPage() ? 'E-STOP Success' : 'E-STOP Success'}] ${result.reply || 'Machine has been emergency stopped'}`);
        } else {
            const errData = await response.json().catch(() => ({}));
            alert(`[${isEnglishPage() ? 'E-STOP Failed' : 'E-STOP Failed'}] ${errData.message || response.statusText}`);
        }
    } catch (error) {
        console.error("E-Stop request error:", error);
        window.showError("Backend connection error: Cannot send E-Stop command!");
    }
}

async function handleResumeStart() {
    const token = localStorage.getItem(CONFIG.AUTH_KEY);
    if (!token) {
        alert(isEnglishPage() ? "Access Denied: Please log in as Administrator first to control the machine." : "Access Denied: Please log in as Administrator first to control the machine.");
        document.getElementById('login-modal-overlay').style.display = 'block';
        return;
    }

    if (!confirm(isEnglishPage() ? "Are you sure you want to release E-Stop and resume machine operation?" : "Are you sure you want to release E-Stop and resume machine operation?")) return;

    const payload = { param: "EndEStop", value: true };
    try {
        const response = await fetchWithAuth(`${CONFIG.API_BASE}/plc/writeMPoint`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const result = await response.json();
            alert(`[${isEnglishPage() ? 'Resume Success' : 'Resume Success'}] ${result.message || result.reply || 'Command sent successfully'}`);
        } else {
            const errData = await response.json().catch(() => ({}));
            alert(`[${isEnglishPage() ? 'Resume Failed' : 'Resume Failed'}] ${errData.message || response.statusText}`);
        }
    } catch (error) {
        console.error("Resume request error:", error);
    }
}

/* ==============================================================
 * ⚡ Global monitor main program: Integrate API to get dynamic Sensor Border limit values
 * ============================================================== */
async function startGlobalMonitor() {
    const CAM_ENDPOINT = `${CONFIG.API_BASE}/camData/`;
    const SENSOR_ENDPOINT = `${CONFIG.API_BASE}/allData/allSenosrData`;
    const PLC_STATE_ENDPOINT = `${CONFIG.API_BASE}/plc/state`;
    const LOAD_ENDPOINT = `${CONFIG.API_BASE}/Load/allFilterLoadStats`;
    const LOG_ERROR_ENDPOINT = `${CONFIG.API_BASE}/log/error`;
    const SENSOR_BORDER_ENDPOINT = `${CONFIG.API_BASE}/sensorBorder/getCurrentSensorBorder`; // ⚡ Added limits API
    
    let lastMetalCount = null;
    let lastNonMetalCount = null;

    const performChecks = async () => {
        const now = Date.now();

        try {
            const [camRes, sensorRes, plcRes, loadRes, logErrorRes, borderRes] = await Promise.all([
                fetch(CAM_ENDPOINT).then(r => { if (!r.ok) throw new Error(); return r.json(); }).catch(() => "DISCONNECTED"),
                fetch(SENSOR_ENDPOINT).then(r => { if (!r.ok) throw new Error(); return r.json(); }).catch(() => "DISCONNECTED"),
                fetch(PLC_STATE_ENDPOINT).then(r => { if (!r.ok) throw new Error(); return r.json(); }).catch(() => "DISCONNECTED"),
                fetch(LOAD_ENDPOINT).then(r => { if (!r.ok) throw new Error(); return r.json(); }).catch(() => "DISCONNECTED"),
                fetch(LOG_ERROR_ENDPOINT).then(r => { if (!r.ok) throw new Error(); return r.json(); }).catch(() => null),
                fetch(SENSOR_BORDER_ENDPOINT).then(r => { if (!r.ok) throw new Error(); return r.json(); }).catch(() => null)
            ]);

            // ==========================================
            // 🛑 Alert (Full Cover / Pop-up full-screen alert)
            // ==========================================
            if (!isAlertActive && (now - lastAlertTime > CONFIG.ALERT_COOLDOWN)) {
                
                // 1. Backend connection exception
                if (loadRes === "DISCONNECTED" || sensorRes === "DISCONNECTED") {
                    window.showError("Backend connection error: Server disconnected or timed out!");
                    return;
                }
                // 2. At least one block in backend
                if (loadRes && loadRes.block === true) {
                    window.showError("Backend protection error: Backend Block state triggered!");
                    return;
                }
                // 3. PLC Offline
                if (plcRes === "DISCONNECTED") {
                    window.showError("PLC Offline: Cannot communicate with the controller!");
                    return;
                }
                // 4. Sensor exception / offline
                if (sensorRes && typeof sensorRes === 'object') {
                    if (sensorRes.temp && Array.isArray(sensorRes.temp)) {
                        for (const item of sensorRes.temp) {
                            if (item.status === "offline" || item.error) {
                                window.showError(`Sensor exception: Temperature sensor ${item.deviceId} offline or malfunctioning!`);
                                return;
                            }
                        }
                    }
                }
                // 5. Production line stability unstable
                if (loadRes && loadRes.stability && loadRes.stability < 70) {
                    window.showError(`Production line unstable! Current stability is only ${loadRes.stability}%`);
                    return;
                }
                // 6. Single step stagnant for too long
                if (plcRes) {
                    let currentState = plcRes.reply !== undefined ? plcRes.reply : (plcRes.state !== undefined ? plcRes.state : plcRes);
                    if (currentState !== null && currentState !== undefined) {
                        if (currentState === lastPlcState) {
                            if (now - stateChangeTimestamp > STATE_STAGNATE_LIMIT) {
                                window.showError(`Equipment exception: Single step (State: ${currentState}) stagnant for too long without switching!`);
                                return;
                            }
                        } else {
                            lastPlcState = currentState;
                            stateChangeTimestamp = now;
                        }
                    }
                }
                // 7. Error reported in log
                if (logErrorRes) {
                    const hasError = Array.isArray(logErrorRes) ? logErrorRes.length > 0 : Object.keys(logErrorRes).length > 0;
                    if (hasError) {
                        window.showError("System exception: Error message detected from /log/error endpoint!");
                        return;
                    }
                }
            }

            // ==========================================
            // ⚠️ Warning (Toast / Bottom-right warning)
            // ==========================================
            if (!isToastActive && (now - lastToastTime > CONFIG.ALERT_COOLDOWN)) {
                
                // 1. Someone approaching the production line
                const camInfo = Array.isArray(camRes) ? camRes[0] : camRes;
                if (camInfo && camInfo.personCount > 0) {
                    window.showToast(`Warning: Personnel approach detected on the production line!\n(Current count: ${camInfo.personCount})`);
                    return;
                }

                // 2. Processing target quantity reached
                try {
                    const [resMetal, resNonMetal] = await Promise.all([
                        fetch(`${CONFIG.API_BASE}/plc/getCountMetal`).then(r => r.json()).catch(() => ({ count: 0 })),
                        fetch(`${CONFIG.API_BASE}/plc/getCountNonMetal`).then(r => r.json()).catch(() => ({ count: 0 }))
                    ]);
                    const curMetal = resMetal.count || 0;
                    const curNonMetal = resNonMetal.count || 0;

                    if (lastMetalCount !== null && curMetal >= 1000 && lastMetalCount < 1000) {
                        window.showToast("Warning: Metal line has reached the target processing quantity (1000)!");
                        return;
                    }
                    if (lastNonMetalCount !== null && curNonMetal >= 1000 && lastNonMetalCount < 1000) {
                        window.showToast("Warning: Non-metal line has reached the target processing quantity (1000)!");
                        return;
                    }
                    lastMetalCount = curMetal;
                    lastNonMetalCount = curNonMetal;
                } catch (e) {}

                // 3. ⚡ Temperature setting exception (Changed to read temp_1 and temp_2 limits from /sensorBorder/getCurrentSensorBorder)
                if (sensorRes && sensorRes.temp && borderRes) {
                    const maxTemp1 = borderRes.temp_1 !== undefined ? borderRes.temp_1 : 999;
                    const maxTemp2 = borderRes.temp_2 !== undefined ? borderRes.temp_2 : 999;

                    for (const item of sensorRes.temp) {
                        // Assume matching by deviceId or index (e.g., temp_1 corresponds to the first group, temp_2 to the second)
                        let currentMax = maxTemp1;
                        if (item.deviceId && item.deviceId.includes('2')) {
                            currentMax = maxTemp2;
                        }

                        if (item.temperature > currentMax) {
                            window.showToast(`Warning: ${item.deviceId || 'Sensor'} temperature setting abnormally exceeded!\nCurrent: ${item.temperature}°C (Limit: ${currentMax}°C)`);
                            return;
                        }
                    }
                }

                // 4. Operation time adjustment exception
                if (sensorRes && sensorRes.timeError) {
                    window.showToast("Warning: Operation time parameter adjustment exception!");
                    return;
                }

                // 5. General Alarm interception
                if (sensorRes && sensorRes.alarm) {
                    window.showToast(`Warning (Alarm): Received warning message reported by the system!`);
                    return;
                }
            }

        } catch (error) {
            console.warn("Global monitoring error:", error);
        }
    };

    setInterval(performChecks, 2000);
}

/* ==============================================================
 * Alert UI: Full-screen overlay (Top alert)
 * ============================================================== */
function initErrorModal() {
    if (document.getElementById('error-overlay')) return;
    document.body.insertAdjacentHTML('beforeend',`
    <div id="error-overlay" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:11000;justify-content:center;align-items:center;backdrop-filter:blur(6px);">
        <div style="background:#b09090;width:800px;max-width:95%;border-radius:15px;overflow:hidden;box-shadow:0 0 100px rgba(0,0,0,0.8);text-align:center;border:4px solid #333;">
            <div style="background:#b09090;padding:25px 10px 10px;display:flex;justify-content:center;">
                <div style="width:0;height:0;border-left:50px solid transparent;border-right:50px solid transparent;border-bottom:85px solid #c00000;position:relative;">
                    <span style="position:absolute;top:15px;left:-8px;color:white;font-size:55px;font-weight:bold;font-family:Arial;">!</span>
                </div>
            </div>
            <div style="height:35px;background:repeating-linear-gradient(45deg,#f1c40f,#f1c40f 20px,#222 20px,#222 40px);border-top:3px solid #333;border-bottom:3px solid #333;"></div>
            <div style="padding:60px 30px;min-height:150px;display:flex;align-items:center;justify-content:center;">
                <p id="error-message" style="font-size:38px;font-weight:bold;color:white;margin:0;text-shadow:2px 2px 8px rgba(0,0,0,0.6);letter-spacing:2px;">SEVERE EQUIPMENT EXCEPTION!</p>
            </div>
            <div style="height:35px;background:repeating-linear-gradient(45deg,#f1c40f,#f1c40f 20px,#222 20px,#222 40px);border-top:3px solid #333;border-bottom:3px solid #333;"></div>
            <button class="close-error" onclick="hideError()" style="width:100%;padding:30px;border:none;background:#E9CFCF;font-size:32px;font-weight:bold;cursor:pointer;color:#c00000;letter-spacing:4px;border-top:2px solid #333;">CONFIRM & CLOSE</button>
        </div>
    </div>`);
}

window.showError = (msg) => {
    if (localStorage.getItem('dnd_mode') === 'true') return;

    const overlay = document.getElementById('error-overlay');
    const message = document.getElementById('error-message');
    if (overlay && message) { 
        isAlertActive = true; 
        message.innerText = msg; 
        overlay.style.display = 'flex'; 
    }
};

window.hideError = () => {
    const overlay = document.getElementById('error-overlay');
    if (overlay) {
        overlay.style.display = 'none';
        isAlertActive = false;      
        lastAlertTime = Date.now(); 
    }
};

/* ==============================================================
 * Warning UI: Bottom-right pop-up toast (Bottom warning)
 * ============================================================== */
function initToastModal() {
    if (document.getElementById('error-toast')) return;
    
    const toastHTML = `
    <div id="error-toast" style="position: fixed; bottom: 30px; right: -450px; width: 380px; background: #b09090; border-radius: 12px; border: 3px solid #333; box-shadow: 0 10px 25px rgba(0,0,0,0.5); z-index: 12000; transition: right 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55); display: flex; flex-direction: column; overflow: hidden; pointer-events: auto;">
        <div style="background:#b09090; padding: 15px; display:flex; justify-content:center;">
            <div style="width:0; height:0; border-left:25px solid transparent; border-right:25px solid transparent; border-bottom:45px solid #c00000; position:relative;">
                <span style="position:absolute; top:8px; left:-4px; color:white; font-size:28px; font-weight:bold; font-family:Arial;">!</span>
            </div>
        </div>
        <div style="height: 15px; background: repeating-linear-gradient(45deg, #f1c40f, #f1c40f 15px, #222 15px, #222 30px); border-top: 2px solid #333; border-bottom: 2px solid #333;"></div>
        <div style="padding: 20px 15px; min-height: 100px; display:flex; align-items:center; justify-content:center; text-align: center;">
            <p id="toast-message" style="font-size: 20px; font-weight: bold; color: white; margin: 0; text-shadow: 1px 1px 4px rgba(0,0,0,0.5); line-height: 1.4; white-space: pre-wrap;"></p>
        </div>
        <div style="height: 15px; background: repeating-linear-gradient(45deg, #f1c40f, #f1c40f 15px, #222 15px, #222 30px); border-top: 2px solid #333; border-bottom: 2px solid #333;"></div>
        <button onclick="hideToast()" style="width: 100%; padding: 15px; border: none; background: #E9CFCF; font-size: 20px; font-weight: bold; cursor: pointer; color: #c00000; letter-spacing: 2px; transition: background 0.2s;">CLOSE</button>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', toastHTML);
}

window.showToast = (msg) => {
    if (localStorage.getItem('dnd_mode') === 'true') return;

    const toast = document.getElementById('error-toast');
    const message = document.getElementById('toast-message'); 
    if (toast && message) { 
        isToastActive = true; 
        message.innerText = msg; 
        toast.style.right = '30px'; 
    }
};

window.hideToast = () => {
    const toast = document.getElementById('error-toast');
    if (toast) {
        toast.style.right = '-450px'; 
        setTimeout(() => {
            isToastActive = false;      
            lastToastTime = Date.now(); 
        }, 400); 
    }
};

// ==============================================================
// Login and UI operation settings
// ==============================================================

function initLoginModal() {
    if (document.getElementById('login-modal-overlay')) return;

    const modalHTML = `
    <div id="login-modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; z-index:9999; background:rgba(0,0,0,0.5); backdrop-filter: blur(5px);">
        <div class="login-card" style="background: rgba(255, 255, 255, 0.85); width: 350px; padding: 40px 30px; border-radius: 30px; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); box-shadow: 0 15px 35px rgba(0,0,0,0.2); text-align: center; border: 1px solid rgba(255,255,255,0.3);">
            <div style="margin-bottom: 10px;"><img src="../picture/login_icon.png" style="width: 200px; opacity: 0.8;" alt="LoginIcon"></div>
            <h2 style="margin: 0; color: #333; font-size: 24px; letter-spacing: 2px;">Account & Password Login</h2>
            <p style="margin: 5px 0 25px; color: #333; font-size: 28px; font-weight: bold;">LOG IN</p>
            <div class="input-container" style="position: relative; margin-bottom: 15px;">
                <span style="position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: #1a5a7a; font-size: 20px;">👤</span>
                <input type="text" id="input-username" placeholder="Account" style="width: 100%; padding: 12px 12px 12px 45px; border-radius: 25px; border: 2px solid #5a9fb3; background: #e6f1f4; box-sizing: border-box; font-size: 16px;">
            </div>
            <div class="input-container" style="position: relative; margin-bottom: 10px;">
                <span style="position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: #1a5a7a; font-size: 20px;">🔒</span>
                <input type="password" id="input-password" placeholder="Password" style="width: 100%; padding: 12px 12px 12px 45px; border-radius: 25px; border: 2px solid #5a9fb3; background: #e6f1f4; box-sizing: border-box; font-size: 16px;">
            </div>
            <div id="login-modal-msg" style="font-size:12px; color:#e74c3c; margin-bottom:10px; min-height:15px;"></div>
            <button id="btn-login-submit" style="width: 100%; padding: 12px; background: #418d9e; color: white; border: none; border-radius: 25px; font-size: 20px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 10px rgba(65, 141, 158, 0.3); transition: background 0.3s;">Login</button>
            <button id="btn-login-cancel" style="margin-top: 15px; background: none; border: none; color: #888; cursor: pointer; font-size: 14px; text-decoration: underline;">Cancel Login</button>
        </div>
    </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.getElementById('btn-login-cancel').onclick = () => {
        document.getElementById('login-modal-overlay').style.display = 'none';
    };
    document.getElementById('btn-login-submit').onclick = handleLoginSubmit;
}

async function handleLoginSubmit() {
    const user = document.getElementById('input-username').value;
    const pass = document.getElementById('input-password').value;
    const msg = document.getElementById('login-modal-msg');

    if (!user || !pass) {
        msg.innerText = "Please enter account and password completely";
        return;
    }

    const loginPayload = { "request": { username: user, password: pass } };

    try {
        msg.style.color = "#1a5a7a";
        msg.innerText = "Verifying...";
        
        const response = await fetch(`${CONFIG.API_BASE}/login/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(loginPayload)
        });

        const result = await response.json();

        if (response.ok) {
            const token = result.token || (result.data && result.data.token) || result.accessToken;
            if (token) {
                localStorage.setItem(CONFIG.AUTH_KEY, token);
                localStorage.setItem(CONFIG.TIME_KEY, new Date().getTime());
                document.getElementById('login-modal-overlay').style.display = 'none';
                alert("Login successful!");
                checkLoginStatus(); 
                if (typeof window.refreshLogUI === 'function') window.refreshLogUI();
            } else {
                throw new Error("Authorization code not received");
            }
        } else {
            // ⚡ Incorrect account or password ➔ Trigger bottom toast warning
            window.showToast("Warning: Incorrect account or password, please try again!");
            throw new Error(result.message || "Verification failed");
        }
    } catch (error) {
        msg.style.color = "#e74c3c";
        msg.innerText = error.message;
    }
}

function checkLoginStatus() {
    const token = localStorage.getItem(CONFIG.AUTH_KEY);
    const loginTime = localStorage.getItem(CONFIG.TIME_KEY);
    const loginBtn = document.getElementById('sidebar-login-btn');
    const logoutBtn = document.getElementById('sidebar-logout-btn');
    const statusText = document.getElementById('login-status-text');
    const statusImg = document.getElementById('nav-login-status-img');

    if (token && loginTime) {
        const now = new Date().getTime();
        if (now - loginTime > CONFIG.EXPIRE_TIME) {
            localStorage.removeItem(CONFIG.AUTH_KEY);
            localStorage.removeItem(CONFIG.TIME_KEY);
            // ⚡ Login time exceeded ➔ Trigger bottom toast warning
            window.showToast("Warning: Login authorization expired, please log in again!");
            showTimeoutModal(); 
            return;
        }
    }

    if (token && loginBtn && logoutBtn) {
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'block';
        if (statusText) statusText.innerText = "Status: Authorized Administrator";
        if (statusImg) statusImg.src = "../picture/login.png";
    } else if (loginBtn && logoutBtn) {
        loginBtn.style.display = 'block';
        logoutBtn.style.display = 'none';
        if (statusText) statusText.innerText = "Status: Not Logged In";
        if (statusImg) statusImg.src = "../picture/nonlogin.png";
    }
}

function initTimeoutModal() {
    if (document.getElementById('timeout-modal-overlay')) return;
    const timeoutHTML = `
    <div id="timeout-modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; z-index:10000; background:rgba(0,0,0,0.6); backdrop-filter: blur(3px); justify-content:center; align-items:center;">
        <div style="background:white; width:320px; border-radius:20px; padding:30px 20px; text-align:center; box-shadow:0 10px 25px rgba(0,0,0,0.3);">
            <div style="margin-bottom:15px;"><img src="../picture/alert_icon.png" style="width:80px;" alt="Warning"></div>
            <h2 style="margin:0; color:#333; font-size:22px;">Notice</h2>
            <p style="margin:10px 0 20px; color:#e74c3c; font-size:18px; font-weight:bold; line-height:1.5;">Session Expired<br>Please Log In Again</p>
            <button id="btn-timeout-confirm" style="background:#bbb; color:#333; border:none; padding:8px 30px; border-radius:20px; font-size:16px; font-weight:bold; cursor:pointer;">OK</button>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', timeoutHTML);
    document.getElementById('btn-timeout-confirm').onclick = () => {
        document.getElementById('timeout-modal-overlay').style.display = 'none';
        document.getElementById('login-modal-overlay').style.display = 'block';
        checkLoginStatus();
    };
}

function showTimeoutModal() {
    const overlay = document.getElementById('timeout-modal-overlay');
    if (overlay) overlay.style.display = 'flex';
}

function initSettingsSidebar() {
    const navMenu = document.querySelector('.nav-menu');
    if (!navMenu) return;
    
    if (!document.getElementById('global-settings-btn')) {
        navMenu.insertAdjacentHTML('beforeend', `
            <div class="nav-divider" style="height: 1px; background: rgba(0,0,0,0.1); margin: 10px 0;"></div>
            <a href="javascript:void(0)" class="nav-status-icon-btn" id="login-status-icon-btn" title="Login Status" style="display: flex; align-items: center; justify-content: center; padding: 0 10px;">
                <img id="nav-login-status-img" src="../picture/nonlogin.png" alt="Login Status" style="width:50px; height:50px; object-fit:contain; transition: transform 0.3s;">
            </a>
            <a href="javascript:void(0)" class="nav-settings-btn" id="global-settings-btn" title="System Settings" style="display: flex; align-items: center; justify-content: center; padding: 10px; transition: transform 0.3s;">
                <img src="../picture/setting.png" alt="Settings" style="width:40px; height:40px;">
            </a>
        `);
    }

    if (!document.getElementById('settings-sidebar')) {
        const sidebarHTML = `
            <div id="sidebar-overlay" class="sidebar-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.3); z-index:9000;"></div>
            
            <div id="settings-sidebar" class="settings-sidebar" style="position:fixed; top:0; right:-300px; width:300px; height:100%; background: var(--sidebar-bg, white); z-index:9001; transition: 0.3s; box-shadow: -5px 0 15px rgba(0,0,0,0.1); color: var(--text-color, #333);">
                
                <div class="sidebar-header" style="padding: 20px; background: var(--sidebar-header-bg, #7f7f7f); border-bottom: 1px solid rgba(0,0,0,0.1); display: flex; align-items: center;">
                    <img src="../picture/setting.png" alt="icon" style="width:20px; margin-right: 10px;">
                    <h2 style="margin:0; font-size: 18px; color: var(--text-color, #333);">Toolbar</h2>
                </div>
                
                <div id="sidebar-dark-mode-btn" class="sidebar-menu-item" style="padding: 15px 20px; border-bottom: 1px solid rgba(0,0,0,0.05); cursor: pointer;"> Dark Mode</div>
                <div id="sidebar-lang-btn" class="sidebar-menu-item" style="padding: 15px 20px; border-bottom: 1px solid rgba(0,0,0,0.05); cursor: pointer;"> Language Toggle</div>
                <div id="sidebar-about-btn" class="sidebar-menu-item" style=" padding: 15px 20px; border-bottom: 1px solid rgba(0,0,0,0.05); cursor:pointer; text-align:left;">About</div>
                
                <div id="sidebar-login-btn" class="sidebar-menu-item" style="padding: 15px 20px; color:#2ecc71; font-weight:bold; cursor: pointer;">System Login</div>
                <div id="sidebar-logout-btn" class="sidebar-menu-item" style="padding: 15px 20px; color:#e74c3c; font-weight:bold; display:none; cursor: pointer;">System Logout</div>
                <div id="login-status-text" style="padding:0 20px; font-size:12px; color:#888; margin-top:5px;"></div>
                
                <div id="sidebar-dnd-btn" class="sidebar-menu-item" style="position: absolute; bottom: 0; left: 0; width: 100%; padding: 20px; border-top: 1px solid rgba(0,0,0,0.1); cursor: pointer; display: flex; align-items: center; box-sizing: border-box; background: var(--sidebar-bg, white);">
                </div>
            </div>
            
            <div id="about-content-page" style="display:none; position:fixed; top:40px; left:10px; right:10px; bottom:10px; background: var(--about-page-bg, #f0f2f5); z-index:8000; padding:20px; pointer-events:auto; border-radius: 15px; overflow: hidden;">
                <div style="background: var(--sidebar-bg, white); height:100%; border-radius:10px; padding:30px; box-shadow:0 2px 10px rgba(0,0,0,0.1); position:relative;">
                    <button id="close-about-page" style="position:absolute; top:20px; right:20px; border:none; background:none; font-size:32px; cursor:pointer; color: #888;">&times;</button>
                    <h1 style="font-size:48px; margin:0; color: var(--text-color, #333);">About</h1>
                    <hr style="margin: 20px 0; border: 0; border-top: 1px solid rgba(0,0,0,0.1);">
                    <p style="font-size: 18px; color: var(--text-sub-color, #666); line-height: 1.6;">Name:<br>
PLC model name - unit ID<br>
PLC model type - 5uU-64MR-ES<br>

Ethernet  IP<br>
PLC ip<br>
Fronted IP 192.168.3.85:3000<br>
backend IP 192.168.3.85:9090<br>

Backend equipment</p>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', sidebarHTML);
    }

    const btn = document.getElementById('global-settings-btn');
    const sidebar = document.getElementById('settings-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const aboutPage = document.getElementById('about-content-page');

    const openSidebar = () => {
        updateLangBtnUI();     
        updateDarkModeBtnUI(); 
        updateDNDBtnUI();      
        sidebar.style.right = '0';
        overlay.style.display = 'block';
    };

    const closeSidebar = () => {
        sidebar.style.right = '-300px';
        overlay.style.display = 'none';
    };

    if (btn) btn.onclick = openSidebar;
    if (overlay) overlay.onclick = closeSidebar;
    
    const darkModeBtn = document.getElementById('sidebar-dark-mode-btn');
    if (darkModeBtn) darkModeBtn.onclick = toggleDarkMode;

    const langBtn = document.getElementById('sidebar-lang-btn');
    if (langBtn) langBtn.onclick = toggleLanguage;

    const dndBtn = document.getElementById('sidebar-dnd-btn');
    if (dndBtn) dndBtn.onclick = toggleDNDMode;

    const aboutBtn = document.getElementById('sidebar-about-btn');
    if (aboutBtn) {
        aboutBtn.onclick = () => {
            closeSidebar();
            aboutPage.style.display = 'block';
        };
    }

    const closeAboutBtn = document.getElementById('close-about-page');
    if (closeAboutBtn) {
        closeAboutBtn.onclick = () => {
            aboutPage.style.display = 'none';
        };
    }

    const loginBtn = document.getElementById('sidebar-login-btn');
    if (loginBtn) {
        loginBtn.onclick = () => {
            closeSidebar();
            document.getElementById('login-modal-overlay').style.display = 'block';
        };
    }
    
    const logoutBtn = document.getElementById('sidebar-logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            localStorage.removeItem(CONFIG.AUTH_KEY);
            localStorage.removeItem(CONFIG.TIME_KEY);
            location.reload(); 
        };
    }
}