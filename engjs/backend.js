document.addEventListener('DOMContentLoaded', () => {

    // Register the ChartDataLabels plugin
    if (typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
    }

    // Global variable holding the filtered detail data, used by the tooltip
    let filterLoadData = {
        total_thread: 0,
        busy_thread: 0,
        idle_thread: 0,
        blocked_thread: 0
    };

    // Name and description shown in the tooltip for each status
    const statusDescriptions = {
        runnable:      { name: 'Status: runnable',      desc: 'running: Currently executing.' },
        waiting:       { name: 'Status: waiting',       desc: 'waiting: Waiting for something to happen, e.g., waiting for user input to complete. Also called "blocked".' },
        timed_waiting: { name: 'Status: timed_waiting', desc: 'ready: Scheduled, waiting for the CPU.' }
    };

    // ===== 1. Initialize the pie chart =====
    const pieCanvas = document.getElementById('statusPieChart');
    const ctx = pieCanvas.getContext('2d');

    // ⚡ Safety net: when the mouse fully leaves the canvas, force the tooltip to fade out smoothly
    pieCanvas.addEventListener('mouseleave', () => {
        const tooltipEl = document.getElementById('chartjs-external-tooltip');
        if (tooltipEl) {
            tooltipEl.style.opacity = 0;
        }
    });

    const statusPieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['runnable', 'waiting', 'blocked', 'timed_waiting'],
            datasets: [{
                data: [0, 0, 0, 0],
                backgroundColor: [
                    '#89def8',
                    '#e373fd',
                    '#ff7c7c',
                    '#7add81f9'
                ],
                borderColor: '#ffffff',
                borderWidth: 2,
                hoverOffset: 12
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                // Make the tooltip float outside the pie chart and fade out naturally
                tooltip: {
                    enabled: true,
                    position: 'average',
                    external: (context) => {
                        let tooltipEl = document.getElementById('chartjs-external-tooltip');

                        if (!tooltipEl) {
                            tooltipEl = document.createElement('div');
                            tooltipEl.id = 'chartjs-external-tooltip';
                            tooltipEl.style.position = 'absolute';
                            tooltipEl.style.background = 'rgba(255, 248, 220, 0.95)';
                            tooltipEl.style.borderColor = '#f1c40f';
                            tooltipEl.style.borderWidth = '2px';
                            tooltipEl.style.borderStyle = 'solid';
                            tooltipEl.style.borderRadius = '6px';
                            tooltipEl.style.padding = '12px';
                            tooltipEl.style.pointerEvents = 'none';

                            // ⚡ Opacity exits over 0.3s for a fade-out; position moves in 0.1s to follow the cursor
                            tooltipEl.style.transition = 'opacity 0.3s ease, left 0.1s ease, top 0.1s ease, transform 0.1s ease';

                            tooltipEl.style.fontFamily = 'monospace';
                            tooltipEl.style.fontSize = '12px';
                            tooltipEl.style.color = '#333';
                            tooltipEl.style.boxShadow = '0 4px 15px rgba(0,0,0,0.15)';
                            tooltipEl.style.zIndex = '1000';
                            document.body.appendChild(tooltipEl);
                        }

                        const tooltipModel = context.tooltip;

                        // ⚡ When the mouse leaves a slice (opacity becomes 0), fade the tooltip out
                        if (tooltipModel.opacity === 0) {
                            tooltipEl.style.opacity = 0;
                            return;
                        }

                        // Declare the status label early so it can be used for positioning below
                        let statusLabel = '';

                        // Build the tooltip content
                        if (tooltipModel.body) {
                            const dataIndex = tooltipModel.dataPoints[0].dataIndex;
                            statusLabel = context.chart.data.labels[dataIndex];
                            const info = statusDescriptions[statusLabel];

                            if (info) {
                                tooltipEl.innerHTML = `
                                    <div style="font-weight:bold; font-size:14px; margin-bottom:6px; font-family:sans-serif;">${info.name}</div>
                                    <div style="font-size:13px; font-family:sans-serif; line-height:1.5; max-width:220px;">${info.desc}</div>`;
                            } else {
                                // Statuses without a description (e.g., blocked) keep the original JSON display
                                const formattedJson = JSON.stringify(filterLoadData, null, 2);
                                tooltipEl.innerHTML = `
                                    <div style="font-weight:bold; font-size:14px; margin-bottom:6px; font-family:sans-serif;">Status: ${statusLabel}</div>
                                    <pre style="margin:0; font-family:monospace;">${formattedJson}</pre>`;
                            }
                        }

                        // Calculate the center and radius, then push the tooltip outside the circle
                        const position = context.chart.canvas.getBoundingClientRect();
                        const chartArea = context.chart.chartArea;

                        const centerX = position.left + window.pageXOffset + (chartArea.left + chartArea.right) / 2;
                        const centerY = position.top + window.pageYOffset + (chartArea.top + chartArea.bottom) / 2;

                        const mouseX = position.left + window.pageXOffset + tooltipModel.caretX;
                        const mouseY = position.top + window.pageYOffset + tooltipModel.caretY;

                        const angle = Math.atan2(mouseY - centerY, mouseX - centerX);
                        const radius = Math.min(chartArea.right - chartArea.left, chartArea.bottom - chartArea.top) / 2;

                        const distance = radius + 30;

                        // Default dynamically calculated coordinates
                        let finalX = centerX + Math.cos(angle) * distance;
                        let finalY = centerY + Math.sin(angle) * distance;
                        let translateX = Math.cos(angle) > 0 ? '0%' : '-100%';
                        let translateY = Math.sin(angle) > 0 ? '0%' : '-100%';

                        // ⚡ Force timed_waiting's tooltip to the top-left corner
                        if (statusLabel === 'timed_waiting') {
                            finalX = centerX - radius - 10;
                            finalY = centerY - radius - 10;
                            translateX = '-70%';
                            translateY = '-50%';
                        }

                        // Show and position the tooltip
                        tooltipEl.style.opacity = 1;
                        tooltipEl.style.left = finalX + 'px';
                        tooltipEl.style.top = finalY + 'px';
                        tooltipEl.style.transform = `translate(${translateX}, ${translateY})`;
                    },
                    callbacks: {
                        title: () => '',
                        label: () => ''
                    }
                },
                datalabels: {
                    color: '#ffffff',
                    font: { weight: 'bold', size: 14, family: 'Arial' },
                    formatter: (value, context) => {
                        if (value === 0) return '';
                        return context.chart.data.labels[context.dataIndex];
                    },
                    anchor: 'center',
                    align: 'center'
                }
            }
        }
    });

    // ===== 2. Load indicator controls (split into two) =====
    const needle = document.getElementById('gaugeNeedle');
    const gaugeContainer = document.querySelector('.gauge-container');

    // ⚡ Independent control: upper semicircle gauge (Queue Size)
    function setSemiCircleValue(value, max = 100) {
        let constrainedPercent = Math.max(0, Math.min(100, (value / max) * 100));
        if (gaugeContainer) {
            gaugeContainer.style.setProperty('--gauge-percent', constrainedPercent);
        }
    }

    // ⚡ Independent control: lower bar gauge needle (Latest Process Time)
    function setLinearGaugeValue(value, max = 1000) {
        let constrainedPercent = Math.max(0, Math.min(100, (value / max) * 100));
        if (needle) {
            needle.style.left = `${constrainedPercent}%`;
        }
    }

    // ===== 3. Request both APIs in parallel =====
    async function fetchBackendStats() {
        const URL_PIE = 'http://192.168.3.85:9090/Load/loadStats';
        const URL_FILTER = 'http://192.168.3.85:9090/Load/allFilterLoadStats';

        try {
            const [resPie, resFilter] = await Promise.all([
                fetch(URL_PIE, { method: 'GET', headers: { 'accept': '*/*' } }).catch(() => null),
                fetch(URL_FILTER, { method: 'GET', headers: { 'accept': '*/*' } }).catch(() => null)
            ]);

            // 1. Handle pie chart data (loadStats)
            if (resPie && resPie.ok) {
                const pieJson = await resPie.json();
                const tStats = pieJson.threadStats || {};
                const runnable = tStats.runnable || 0;
                const waiting = tStats.waiting || 0;
                const blocked = tStats.blocked || 0;
                const timed_waiting = tStats.timed_waiting || 0;

                statusPieChart.data.datasets[0].data = [runnable, waiting, blocked, timed_waiting];
                statusPieChart.update();
            }

            // 2. Handle utilization, server pressure and latest process time (allFilterLoadStats)
            if (resFilter && resFilter.ok) {
                const filterJson = await resFilter.json();

                const threadStats = filterJson.threadStats || {};

                // Store the four specified fields for the tooltip
                filterLoadData = {
                    total_thread: threadStats.total_thread || 0,
                    busy_thread: threadStats.busy_thread || 0,
                    idle_thread: threadStats.idle_thread || 0,
                    blocked_thread: threadStats.blocked_thread || 0
                };

                const utilization = threadStats.utilization || 0;
                const busy = filterLoadData.busy_thread;
                const blocked = filterLoadData.blocked_thread;
                const total = filterLoadData.total_thread || 1;

                // ⚡ Read queue size and process time
                const queueSize = filterJson.queueSize || 0;
                const lastestProcessTime = filterJson.lastestProcessTime || 0;

                // Update current utilization (top left)
                const utilEl = document.getElementById('utilization-val');
                if (utilEl) {
                    utilEl.innerText = `${utilization}%`;
                }

                // Update latest data process time (top right)
                const timeEl = document.getElementById('process-time-val');
                if (timeEl) {
                    timeEl.innerText = lastestProcessTime;
                }

                // Calculate server pressure
                let p1 = 0.4 * utilization;
                let p2 = 0.3 * (((busy + 1.5 * blocked) / total) / 3 * 100);
                let p3 = 0.3 * ((queueSize / 50) * 100);

                let pressure = p1 + p2 + p3;
                pressure = Math.max(0, Math.min(100, Math.round(pressure)));

                // Update the server pressure display
                const pressureValEl = document.getElementById('server-pressure-val');
                const pressureCircleEl = document.getElementById('pressure-circle');

                if (pressureValEl) {
                    pressureValEl.innerText = pressure;
                }

                if (pressureCircleEl) {
                    if (pressure <= 33) {
                        pressureCircleEl.style.setProperty('--pressure-color', '#28a745');
                    } else if (pressure <= 66) {
                        pressureCircleEl.style.setProperty('--pressure-color', '#ffea4a');
                    } else {
                        pressureCircleEl.style.setProperty('--pressure-color', '#ff4d4d');
                    }
                }

                // ==========================================
                // ⚡ Separate update logic for the two gauges
                // ==========================================
                // 1. Update the upper semicircle gauge (by queueSize, full at 100)
                const MAX_QUEUE_LIMIT = 100;
                setSemiCircleValue(queueSize, MAX_QUEUE_LIMIT);

                // 2. Update the lower bar gauge needle (by lastestProcessTime, max 1000ms)
                const MAX_TIME_LIMIT = 1000;
                setLinearGaugeValue(lastestProcessTime, MAX_TIME_LIMIT);
            }

        } catch (error) {
            console.error('Failed to fetch backend load data:', error);
        }
    }

    // Initial fetch, then refresh every 1 second
    fetchBackendStats();
    setInterval(fetchBackendStats, 1000);
});