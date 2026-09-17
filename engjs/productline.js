const states = {
    "S1": { light: 0, text: "S1 Waiting for Material" },
    "S10": { light: 1, text: "S10 Gantry Moving Right to Pre-position" },
    "S11": { light: 1, text: "S11 Gantry Moving Down to Pre-position" },
    "S12": { light: 1, text: "S12 Clamping Workpiece, Gantry Moving Up" },
    "S13": { light: 1, text: "S13 Gantry Moving Left" },
    "S14": { light: 1, text: "S14 Gantry Moving Down" },
    "S15": { light: 1, text: "S15 Releasing Clamp" },
    "S16": { light: 1, text: "S16 Gantry Moving Up" },
    "S17": { light: 2, text: "S17 Conveyor 2" },
    "S18": { light: 3, text: "S18 Rotary Arm Moving Down" },
    "S19": { light: 3, text: "S19 Vacuum Suction Workpiece" },
    "S20": { light: 3, text: "S20 Suction Cup Moving Up" },
    "S21": { light: 3, text: "S21 Suction Cup Rotating Down" },
    "S22": { light: 3, text: "S22 Release Vacuum" },
    "S23": { light: 3, text: "S23 Suction Cup Moving Up" },
    "S24": { light: 3, text: "S24 Suction Cup Returning to Home" },
    "S30": { light: 4, text: "S30 Slide Table Moving Left" },
    "S31": { light: 4, text: "S31 Slide Table Moving Down" },
    "S32": { light: 4, text: "S32 Clamping Workpiece" },
    "S33": { light: 4, text: "S33 Slide Table Moving Up" },
    "S34": { light: 4, text: "S34 Slide Table Moving Right" },
    "S35": { light: 4, text: "S35 Slide Table Moving Down" },
    "S36": { light: 4, text: "S36 Releasing Workpiece" },
    "S37": { light: 4, text: "S37 Slide Table Moving Up" }
};

// ✨ Unified dynamic IP retrieval logic (defaults to localhost if opened on localhost, otherwise uses 192.168.3.85)
const HOST = (window.location.hostname && window.location.hostname !== "") ? window.location.hostname : "192.168.3.85";
const STATE_URL = `http://192.168.3.85:9090/plc/state`;
const RESET_URL = `http://192.168.3.85:9090/plc/writeMPoint`;
const ESTOP_URL = `http://192.168.3.85:9090/plc/EStop`;

// Tracks step keys already completed by the current workpiece
let completedSteps = new Set();
let lastStateKey = "";

const lights = document.querySelectorAll('.indicator-light');
const boardContent = document.querySelector('.board-content');

/**
 * Update right-side dashboard
 * @param {string} currentStateKey Current step key (e.g., "S10")
 */
function updateBoard(currentStateKey) {
    if (!states[currentStateKey]) return;

    const currentLightIndex = states[currentStateKey].light;

    // Add current step to completed set
    completedSteps.add(currentStateKey);

    // Filter all steps belonging to the current device (indicator light)
    let htmlLines = Object.keys(states)
        .filter(key => states[key].light === currentLightIndex)
        .map(key => {
            const isActive = (key === currentStateKey);
            const isDone = completedSteps.has(key);
            const icon = isDone ? "○" : "✖";
            
            const activeClass = isActive ? "active-text" : "";
            return `<p class="${activeClass}">${icon} ${states[key].text}</p>`;
        }).join("");

    // Re-render dashboard content
    boardContent.innerHTML = `
        <div class="status-container">
            <h2>STEP</h2>
            <div class="steps-list">
                ${htmlLines}
            </div>
        </div>
    `;
}

/**
 * Reset production line function
 */
async function resetProductionLine() {
    const btn = document.getElementById('reset-btn');
    
    try {
        if (btn) btn.disabled = true;

        console.log("Sending reset request to:", RESET_URL);

        // Send payload as a single JSON object (not an array)
        const payload = {
            "param": "RESTART",
            "value": true
        };

        const response = await fetch(RESET_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            alert("Production line reset command sent!");
        } else {
            // Read error details returned by backend to help identify 400 status cause
            const errorText = await response.text();
            console.error("Backend error response:", errorText);
            alert(`Reset failed (${response.status}):\n${errorText || 'Please check backend logs'}`);
        }
    } catch (err) {
        console.error("Error occurred while sending reset request:", err);
        alert(`Cannot connect to server to reset!\nTarget URL: ${RESET_URL}\nError message: ${err.message}`);
    } finally {
        if (btn) btn.disabled = false;
    }
}

/**
 * Emergency Stop (EStop) function
 */
async function emergencyStop() {
    const btn = document.getElementById('estop-btn');
    
    // Show confirmation dialog to prevent accidental triggers
    if (!confirm("Are you sure you want to execute Emergency Stop?")) {
        return;
    }

    try {
        if (btn) btn.disabled = true;

        console.log("Sending Emergency Stop request to:", ESTOP_URL);

        // Send GET request to /plc/EStop
        const response = await fetch(ESTOP_URL, {
            method: 'GET',
            headers: {
                'accept': '*/*'
            }
        });

        if (response.ok) {
            alert("Emergency Stop command sent successfully!");
        } else {
            const errorText = await response.text();
            console.error("Emergency Stop response error:", errorText);
            alert(`Emergency Stop failed (${response.status}):\n${errorText || 'Please check backend logs'}`);
        }
    } catch (err) {
        console.error("Error occurred while sending Emergency Stop request:", err);
        alert(`Cannot connect to server to execute Emergency Stop!\nTarget URL: ${ESTOP_URL}\nError message: ${err.message}`);
    } finally {
        if (btn) btn.disabled = false;
    }
}

/**
 * Fetch latest status from backend API and update UI
 */
async function fetchStateFromPLC() {
    try {
        const response = await fetch(STATE_URL);
        if (!response.ok) throw new Error("Network connection error");

        const data = await response.json();
        
        // Get reply value (e.g., "10") and combine into "S10"
        const rawState = data.reply;
        const stateKey = `S${rawState}`;

        // Skip if retrieved status is not defined in states
        if (!states[stateKey]) {
            console.warn(`Unknown state code: ${stateKey}`);
            return;
        }

        // Check if a new process starts: reset records when status returns to S1 from another state
        if (stateKey === "S1" && lastStateKey !== "S1") {
            completedSteps.clear();
        }
        lastStateKey = stateKey;

        // 1. Update indicator lights (illuminate corresponding device light)
        const currentLightIndex = states[stateKey].light;
        lights.forEach(light => light.classList.remove('active'));
        if (lights[currentLightIndex]) {
            lights[currentLightIndex].classList.add('active');
        }

        // 2. Update right-side dashboard
        updateBoard(stateKey);

    } catch (err) {
        console.error("Failed to retrieve PLC status:", err);
        // Prompt when API connection fails
        boardContent.innerHTML = `
            <div class="status-container">
                <h2>Offline</h2>
                <p style="color: red;">Unable to connect to PLC Server</p>
            </div>
        `;
    }
}

// Poll latest status from backend every 500 ms (0.5s)
setInterval(fetchStateFromPLC, 500);

// Execute once immediately after page load
fetchStateFromPLC();