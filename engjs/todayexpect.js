document.addEventListener('DOMContentLoaded', () => {
    const ctx = document.getElementById('predictionChart').getContext('2d');

    // 1. PLC Default Parameters (Unit: Seconds)
    const DEFAULT_PARAMS = {
        "T14": 5.0, "T0": 0.5, "T7": 1.0,
        "T30": 1.0, "T3": 1.0, "T4": 1.0, "T31": 1.0, "T5": 1.0, "T6": 1.0, "T15": 5.0,
        "T8": 1.0, "T9": 1.0, "T32": 1.0, "T10": 1.0, "T11": 1.0,
        "T40": 1.0, "T12": 1.0, "T13": 1.0
    };

    // 2. PLC States Dictionary & Action Time
    const PLC_STATES = {
        1:  { text: "S1 Wait for Material", animTime: 1.62, waitParam: "T14" },
        10: { text: "S10 Gantry Right Pre-position", animTime: 3.68, waitParam: "T30" },
        11: { text: "S11 Gantry Down Pre-position", animTime: 1.27, waitParam: "T3" },
        12: { text: "S12 Clamp Workpiece, Gantry Up", animTime: 2.47, waitParam: "T4" },
        13: { text: "S13 Gantry Left", animTime: 4.64, waitParam: "T31" },
        14: { text: "S14 Gantry Down", animTime: 2.36, waitParam: "T5" },
        15: { text: "S15 Release Clamp", animTime: 0.17, waitParam: "T6" },
        16: { text: "S16 Gantry Up", animTime: 1.56, waitParam: "T15" },
        17: { text: "S17 Conveyor 2", animTime: 1.21, waitParam: "T7" },
        18: { text: "S18 Rotary Arm Down", animTime: 0.62, waitParam: "T8" },
        19: { text: "S19 Suction Workpiece", animTime: 0.49, waitParam: "T9" },
        20: { text: "S20 Suction Cup Up", animTime: 0.10, waitParam: "T32" }, 
        21: { text: "S21 Suction Cup Rotate Down", animTime: 1.62, waitParam: "T10" },
        22: { text: "S22 Vacuum Release", animTime: 0.10, waitParam: "T11" },
        23: { text: "S23 Suction Cup Up", animTime: 0.59 }, 
        24: { text: "S24 Suction Cup Home", animTime: 0.83 },
        30: { text: "S30 Slide Table Left", animTime: 1.00 },
        31: { text: "S31 Slide Table Down", animTime: 0.20, waitParam: "T40" },
        32: { text: "S32 Clamp Workpiece", animTime: 0.30, waitParam: "T12" },
        33: { text: "S33 Slide Table Up", animTime: 0.5 },
        34: { text: "S34 Slide Table Right", animTime: 1.00 },
        35: { text: "S35 Slide Table Down", animTime: 0.50 },
        36: { text: "S36 Release Workpiece", animTime: 0.30, waitParam: "T13" },
        37: { text: "S37 Slide Table Up", animTime: 0.5 },
        50: { text: "S50 System E-Stop", animTime: 0.1 } 
    };

    // 3. Strict alignment instruction: S1 (including T14) is included in both sides
    // Metal Sequence: S1 ~ S24
    const seqMetalFull = [1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
    // Non-Metal Sequence: S1 + S30 ~ S37
    const seqNonMetalFull = [1, 30, 31, 32, 33, 34, 35, 36, 37];

    let currentParams = { ...DEFAULT_PARAMS };

    // Function to calculate total cycle time for a specific sequence
    function calculateSequenceCycleTime(sequence, params) {
        let totalTime = 0;
        sequence.forEach(state => {
            const step = PLC_STATES[state];
            if (step) {
                totalTime += step.animTime || 0; // Accumulate hardware action time
                
                if (step.waitParam && params[step.waitParam] !== undefined) {
                    let waitSec = params[step.waitParam];
                    if (waitSec < 99) { // Foolproof: Exclude abnormal or downtime wait values
                        totalTime += waitSec;
                    }
                }
            }
        });
        return totalTime;
    }

    // Initialize Chart.js
    const predictionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Daily Capacity Eval (8hr)'],
            datasets: [
                {
                    label: 'Predicted Total Daily Output',
                    data: [0],
                    backgroundColor: '#3498db',
                    barThickness: 60
                },
                {
                    label: 'Current Accumulated Actual Output',
                    data: [0],
                    backgroundColor: '#e67e22',
                    barThickness: 60
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { font: { size: 16, weight: 'bold' } }
                },
                tooltip: { enabled: true }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { display: false },
                    ticks: { font: { size: 14, weight: 'bold' } }
                },
                y: {
                    grid: { display: false },
                    ticks: { font: { size: 18, weight: 'bold' } }
                }
            }
        }
    });

    // 4. Fetch real-time data from three APIs to calculate "Predicted" and "Actual"
    async function fetchAndUpdateData() {
        let actualCount = 0;
        let dailyPrediction = 0;

        try {
            // Simultaneously request three APIs: Parameters, Metal Output, Non-Metal Output
            const [resDPoint, resMetal, resNonMetal] = await Promise.all([
                fetch('http://192.168.3.85:9090/plc/AllDPointData').then(r => r.ok ? r.json() : null).catch(() => null),
                fetch('http://192.168.3.85:9090/plc/getCountMetal').then(r => r.ok ? r.json() : { count: 0 }).catch(() => ({ count: 0 })),
                fetch('http://192.168.3.85:9090/plc/getCountNonMetal').then(r => r.ok ? r.json() : { count: 0 }).catch(() => ({ count: 0 }))
            ]);

            // Combine actual metal and non-metal quantities
            actualCount = (resMetal.count || 0) + (resNonMetal.count || 0);

            if (resDPoint && resDPoint.reply) {
                const reply = resDPoint.reply;

                // API time value unit is 0.1 seconds, convert to seconds (e.g. 50 -> 5.0s)
                Object.keys(DEFAULT_PARAMS).forEach(key => {
                    if (reply[key] !== undefined) {
                        currentParams[key] = reply[key] / 10;
                    }
                });

                // Calculate metal and non-metal cycle times separately
                const metalCycleTime = calculateSequenceCycleTime(seqMetalFull, currentParams);
                const nonMetalCycleTime = calculateSequenceCycleTime(seqNonMetalFull, currentParams);

                // Calculate respective UPH (Units Per Hour), and add them up
                const metalUPH = metalCycleTime > 0 ? (3600 / metalCycleTime) : 0;
                const nonMetalUPH = nonMetalCycleTime > 0 ? (3600 / nonMetalCycleTime) : 0;
                const totalUPH = metalUPH + nonMetalUPH;
                
                // Predicted daily output: UPH multiplied by 8 hours
                dailyPrediction = Math.round(totalUPH * 8);

                // --- Dynamically update numbers in the blue formula panel ---
                const metalEl = document.getElementById('metal-ct');
                const nonmetalEl = document.getElementById('nonmetal-ct');
                const predictEl = document.getElementById('predict-total');
                
                if (metalEl) metalEl.innerText = metalCycleTime.toFixed(1);
                if (nonmetalEl) nonmetalEl.innerText = nonMetalCycleTime.toFixed(1);
                if (predictEl) predictEl.innerText = dailyPrediction;

            } else {
                throw new Error("Unable to get real-time machine time parameters");
            }
        } catch (error) {
            console.error('API data fetch failed, using default values for calculation:', error);

            // Offline fallback: Use default values to calculate predicted output
            const metalCycleTime = calculateSequenceCycleTime(seqMetalFull, DEFAULT_PARAMS);
            const nonMetalCycleTime = calculateSequenceCycleTime(seqNonMetalFull, DEFAULT_PARAMS);
            const metalUPH = metalCycleTime > 0 ? (3600 / metalCycleTime) : 0;
            const nonMetalUPH = nonMetalCycleTime > 0 ? (3600 / nonMetalCycleTime) : 0;
            dailyPrediction = Math.round((metalUPH + nonMetalUPH) * 8);

            const metalEl = document.getElementById('metal-ct');
            const nonmetalEl = document.getElementById('nonmetal-ct');
            const predictEl = document.getElementById('predict-total');
            if (metalEl) metalEl.innerText = metalCycleTime.toFixed(1);
            if (nonmetalEl) nonmetalEl.innerText = nonMetalCycleTime.toFixed(1);
            if (predictEl) predictEl.innerText = dailyPrediction;
        } finally {
            // --- Whether calculation succeeds or uses defaults, update chart at the end ---
            predictionChart.data.datasets[0].data = [dailyPrediction];
            predictionChart.data.datasets[1].data = [actualCount];
            predictionChart.update();
        }
    }

    // Initial load and set to auto-refresh every 5 seconds
    fetchAndUpdateData();
    setInterval(fetchAndUpdateData, 5000);
});