// Sensor Image and Text Database: Added deviceId for comparing API response data
const sensorGroups = {
    1: [
        { 
            name: "Temp & Humidity Sensor B", 
            img: "../picture/sensor_temp_b.jpg", 
            deviceId: "8266_2" // Corresponding temperature & humidity device ID
        },
        { 
            name: "Dust Sensor", 
            img: "../picture/sensor_dust.jpg", 
            deviceId: "8266_3" // Corresponding air quality/dust device ID
        },
        { 
            name: "Air Quality Sensor", 
            img: "../picture/sensor_air.jpg", 
            deviceId: "8266_3" // Corresponding air quality device ID
        }
    ],
    2: [
        { 
            name: "Temp & Humidity Sensor A", 
            img: "../picture/sensor_temp_a.jpg", 
            deviceId: "8266_4" // Corresponding temperature & humidity device ID
        },
        { 
            name: "Power Sensor", 
            img: "../picture/sensor_power.jpg", 
            deviceId: "8266_5" // Corresponding power device ID (cir)
        }
    ]
};

/**
 * Query API and check if a specific deviceId is active
 * @param {string} targetDeviceId - The device ID to query
 * @returns {Promise<boolean>} - Whether it exists in the API list and returns data properly
 */
async function checkSensorStatus(targetDeviceId) {
    try {
        const response = await fetch("http://192.168.3.85:9090/allData/allSenosrData");
        if (!response.ok) return false;

        const data = await response.json();

        // Iterate through all arrays in the API response JSON object (e.g., temp, cir, aq, etc.)
        for (const categoryKey in data) {
            const deviceList = data[categoryKey];
            if (Array.isArray(deviceList)) {
                const foundDevice = deviceList.find(device => device.deviceId === targetDeviceId);
                if (foundDevice) {
                    return true; // Found matching deviceId, device is active
                }
            }
        }
        return false; // Device not found
    } catch (error) {
        console.error("Failed to retrieve sensor API data:", error);
        return false;
    }
}

/**
 * Triggered when clicking an orange hotspot:
 * 1. Remove map centering class to allow the map to slide to the right
 * 2. Asynchronously request data from API and render card status
 * @param {number} groupId - 1 for bottom-left hotspot, 2 for top-right hotspot
 */
async function showGroup(groupId) {
    const layoutContainer = document.getElementById("layout-container");
    const detailsContainer = document.getElementById("sensor-details");
    const groupData = sensorGroups[groupId];

    if (!detailsContainer || !groupData) return;

    // 1. Remove center mode to trigger sliding animation to the right
    if (layoutContainer) {
        layoutContainer.classList.remove("is-centered");
    }

    // Display loading message first
    detailsContainer.innerHTML = '<div style="font-size:20px; font-weight:bold; color:#666;">Loading sensor status...</div>';

    // 2. Concurrently check the status of all sensors in the group
    const cardsHtml = await Promise.all(
        groupData.map(async (sensor) => {
            const isOnline = await checkSensorStatus(sensor.deviceId);
            const statusText = isOnline ? "Status: Active" : "Status: Inactive";
            const statusColorStyle = isOnline ? "color: #2e7d32;" : "color: #d32f2f;"; // Green for Active, Red for Inactive

            return `
                <div class="sensor-card">
                    <img src="${sensor.img}" alt="${sensor.name}" onerror="this.src='../picture/sensorplace.png'">
                    <h3>${sensor.name}</h3>
                    <p class="status" style="${statusColorStyle}">${statusText}</p>
                </div>
            `;
        })
    );

    // 3. Render to the left section
    detailsContainer.innerHTML = `<div class="card-list">${cardsHtml.join("")}</div>`;
}