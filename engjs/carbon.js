document.addEventListener('DOMContentLoaded', () => {
    
    // ===== 1. Initialize Chart.js Chart (Dual-Axis Line Chart) =====
    const ctx = document.getElementById('predictionChart').getContext('2d');

    const predictionChart = new Chart(ctx, {
        type: 'line', // Line chart
        data: {
            labels: [], // Time labels for X-axis
            datasets: [
                {
                    label: 'Total Power (W)',
                    data: [], 
                    borderColor: '#e67e22', // Orange line
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: '#e67e22',
                    yAxisID: 'y', // Left Y-axis
                    tension: 0.3, // Smooth line curves
                    fill: true
                },
                {
                    label: 'Carbon Emissions (g CO₂e)',
                    data: [], 
                    borderColor: '#27ae60', // Green line
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: '#27ae60',
                    yAxisID: 'y1', // Right Y-axis
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false, // Display values for both lines on hover
            },
            plugins: {
                legend: {
                    position: 'bottom', 
                    labels: { font: { size: 16, weight: 'bold' } }
                },
                tooltip: { enabled: true }
            },
            scales: {
                x: {
                    display: true,
                    grid: { display: false },
                    ticks: { font: { size: 14, weight: 'bold' } }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left', // Left Y-axis
                    title: { 
                        display: true, 
                        text: 'Total Power (W)', 
                        font: { size: 14, weight: 'bold' },
                        color: '#e67e22'
                    },
                    grid: { color: 'rgba(0,0,0,0.1)' },
                    ticks: { font: { size: 14, weight: 'bold' } }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right', // Right Y-axis
                    title: { 
                        display: true, 
                        text: 'Carbon Emissions (g CO₂e)', 
                        font: { size: 14, weight: 'bold' },
                        color: '#27ae60'
                    },
                    grid: { drawOnChartArea: false }, // Hide right grid lines to prevent clutter
                    ticks: { font: { size: 14, weight: 'bold' } }
                }
            }
        }
    });

    // ===== 2. Carbon Footprint Calculation Logic (5-second polling) =====
    async function fetchCarbonFootprint() {
        try {
            // Logic for A, B, C, D, E remains unchanged
            const cirRes = await fetch('http://192.168.3.85:9090/circuitData/');
            if (!cirRes.ok) return;
            
            const cirData = await cirRes.json();
            const deviceList = Array.isArray(cirData) ? cirData : (cirData.data || cirData.reply || cirData.response || []);
            
            if (!deviceList || deviceList.length === 0) return;

            const targetDevice = deviceList[0];
            const deviceId = targetDevice.deviceId;
            const currentTimestamp = targetDevice.timestamp;

            const payload = { deviceId: deviceId, start: 0, end: currentTimestamp };

            const historyRes = await fetch('http://192.168.3.85:9090/history/circuitHistory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'accept': '*/*' },
                body: JSON.stringify(payload)
            });

            if (!historyRes.ok) return;
            
            let historyData = await historyRes.json();
            let records = [];

            if (typeof historyData === 'string') {
                try { historyData = JSON.parse(historyData); } catch (e) {}
            }

            if (Array.isArray(historyData)) { records = historyData; } 
            else if (historyData && Array.isArray(historyData.response)) { records = historyData.response; } 
            else if (historyData && Array.isArray(historyData.data)) { records = historyData.data; } 
            else if (historyData && Array.isArray(historyData.reply)) { records = historyData.reply; }

            if (records && records.length > 0) {
                let totalPower = 0;
                for (let i = 0; i < records.length; i++) {
                    const powerVal = parseFloat(records[i].power || 0);
                    totalPower += powerVal;
                }

                const carbonKg = (totalPower / 60000) * 0.467;
                const carbonGrams = carbonKg * 1000;

                const powerEl = document.getElementById('power-display');
                const carbonEl = document.getElementById('carbon-display');
                if (powerEl) powerEl.innerText = totalPower.toFixed(1);
                if (carbonEl) carbonEl.innerText = carbonKg.toFixed(4);

                // ===== F. Update Dual-Axis Line Chart =====
                
                // Get current time (Format: HH:mm:ss) as X-axis label
                const now = new Date();
                const timeLabel = now.toLocaleTimeString('en-US', { hour12: false });

                // 1. Push new timestamp and values to the end of data arrays
                predictionChart.data.labels.push(timeLabel);
                predictionChart.data.datasets[0].data.push(totalPower);
                predictionChart.data.datasets[1].data.push(carbonGrams);

                // 2. Limit maximum displayed points (e.g., 20) to prevent browser slowdown or chart clutter
                const maxPoints = 20;
                if (predictionChart.data.labels.length > maxPoints) {
                    predictionChart.data.labels.shift(); // Remove oldest X-axis label
                    predictionChart.data.datasets[0].data.shift(); // Remove oldest Power data
                    predictionChart.data.datasets[1].data.shift(); // Remove oldest Carbon data
                }

                // 3. Render updated chart
                predictionChart.update();

            } else {
                console.warn("⚠️ Number of parsed history records is 0");
            }
        } catch (error) {
            console.error("❌ Program error while updating carbon footprint:", error);
        }
    }

    // ===== 3. Initialization and Timer Setup =====
    fetchCarbonFootprint();
    setInterval(fetchCarbonFootprint, 5000);
});