document.addEventListener('DOMContentLoaded', () => {

    // Register ChartDataLabels plugin
    if (typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
    }

    // Global variable to store filtered detailed data for Tooltip display
    let filterLoadData = {
        total_thread: 0,
        busy_thread: 0,
        idle_thread: 0,
        blocked_thread: 0
    };

    // ===== 1. Initialize Pie Chart =====
    const ctx = document.getElementById('statusPieChart').getContext('2d');

    const statusPieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['runnable', 'waiting', 'blocked', 'timed_waiting'],
            datasets: [{
                data: [0, 0, 0, 0], 
                backgroundColor: [
                    '#7add81f9', // runnable - Green
                    '#89def8',   // waiting - Blue
                    '#e373fd',   // blocked - Purple Pink
                    '#ff7c7c'    // timed_waiting - Red
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
                // ⚡ Make Tooltip float perfectly outside the pie chart
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
                            tooltipEl.style.transition = 'all .1s ease';
                            tooltipEl.style.fontFamily = 'monospace';
                            tooltipEl.style.fontSize = '12px';
                            tooltipEl.style.color = '#333';
                            tooltipEl.style.boxShadow = '0 4px 15px rgba(0,0,0,0.15)';
                            tooltipEl.style.zIndex = '1000';
                            document.body.appendChild(tooltipEl);
                        }

                        const tooltipModel = context.tooltip;

                        if (tooltipModel.opacity === 0) {
                            tooltipEl.style.opacity = 0;
                            return;
                        }

                        // Assemble display content
                        if (tooltipModel.body) {
                            const dataIndex = tooltipModel.dataPoints[0].dataIndex;
                            const statusLabel = context.chart.data.labels[dataIndex];

                            let innerHtml = `<div style="font-weight:bold; font-size:14px; margin-bottom:6px; color:#333; font-family:sans-serif;">Status: ${statusLabel}</div>`;
                            
                            const filteredObj = {
                                total_thread: filterLoadData.total_thread,
                                busy_thread: filterLoadData.busy_thread,
                                idle_thread: filterLoadData.idle_thread,
                                blocked_thread: filterLoadData.blocked_thread
                            };
                            
                            const formattedJson = JSON.stringify(filteredObj, null, 2);
                            innerHtml += `<pre style="margin:0; font-family:monospace;">${formattedJson}</pre>`;

                            tooltipEl.innerHTML = innerHtml;
                        }

                        // ==========================================
                        // ⚡ Core positioning modification: calculate center and radius, push Tooltip outside the circle
                        // ==========================================
                        const position = context.chart.canvas.getBoundingClientRect();
                        const chartArea = context.chart.chartArea;
                        
                        // 1. Get the center point of the chart
                        const centerX = position.left + window.pageXOffset + (chartArea.left + chartArea.right) / 2;
                        const centerY = position.top + window.pageYOffset + (chartArea.top + chartArea.bottom) / 2;

                        // 2. Get the current mouse coordinates
                        const mouseX = position.left + window.pageXOffset + tooltipModel.caretX;
                        const mouseY = position.top + window.pageYOffset + tooltipModel.caretY;

                        // 3. Calculate the vector angle from center to mouse
                        const angle = Math.atan2(mouseY - centerY, mouseX - centerX);

                        // 4. Calculate the approximate radius of the pie chart (half of the smaller value between width and height)
                        const radius = Math.min(chartArea.right - chartArea.left, chartArea.bottom - chartArea.top) / 2;

                        // 5. Set the total distance to push away from center (radius + extra push distance 30px)
                        const distance = radius + 30;

                        // 6. Calculate the final X, Y anchor points of the box
                        const finalX = centerX + Math.cos(angle) * distance;
                        const finalY = centerY + Math.sin(angle) * distance;

                        // 7. Adjust CSS Transform based on the mouse quadrant to ensure the box extends outward
                        const translateX = Math.cos(angle) > 0 ? '0%' : '-100%';
                        const translateY = Math.sin(angle) > 0 ? '0%' : '-100%';

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

    // ===== 2. Pressure Load Metrics Control =====
    const needle = document.getElementById('gaugeNeedle');
    const gaugeContainer = document.querySelector('.gauge-container');

    function setGaugeValue(value, max = 100) {
        let constrainedPercent = Math.max(0, Math.min(100, (value / max) * 100));
        if (needle) needle.style.left = `${constrainedPercent}%`;
        if (gaugeContainer) gaugeContainer.style.setProperty('--gauge-percent', constrainedPercent);
    }

    // ===== 3. Synchronously request two APIs =====
    async function fetchBackendStats() {
        const URL_PIE = 'http://192.168.3.85:9090/Load/loadStats';
        const URL_FILTER = 'http://192.168.3.85:9090/Load/allFilterLoadStats';
        
        try {
            const [resPie, resFilter] = await Promise.all([
                fetch(URL_PIE, { method: 'GET', headers: { 'accept': '*/*' } }).catch(() => null),
                fetch(URL_FILTER, { method: 'GET', headers: { 'accept': '*/*' } }).catch(() => null)
            ]);

            // 1. Process pie chart data (loadStats)
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

            // 2. Process utilization, server pressure, and latest processing time (allFilterLoadStats)
            if (resFilter && resFilter.ok) {
                const filterJson = await resFilter.json();
                
                const threadStats = filterJson.threadStats || {};
                
                // Store specified four fields for Tooltip use
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
                const queueSize = filterJson.queueSize || 0;
                const lastestProcessTime = filterJson.lastestProcessTime || 0;

                // Update top left current utilization
                const utilEl = document.getElementById('utilization-val');
                if (utilEl) {
                    utilEl.innerText = `${utilization}%`;
                }

                // Update top right latest data processing time
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

                // Update numeric display of server pressure
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

                // Update the original pressure load dashboard (Gauge)
                const MAX_QUEUE_LIMIT = 100;
                setGaugeValue(queueSize, MAX_QUEUE_LIMIT);
            }

        } catch (error) {
            console.error('Failed to fetch backend load data:', error);
        }
    }

    // Initialize and set up periodic connection updates (every 1 second)
    fetchBackendStats();
    setInterval(fetchBackendStats, 1000);
});