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
    const pieCanvas = document.getElementById('statusPieChart');
    const ctx = pieCanvas.getContext('2d');

    // ⚡ Double assurance: Force tooltip to smoothly fade out when cursor leaves canvas
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
                    '#7add81f9', // runnable - Green
                    '#89def8',   // waiting - Blue
                    '#e373fd',   // blocked - Pink/Purple
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
                // Let Tooltip float outside pie chart and disappear smoothly
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
                            
                            // ⚡ Extend opacity transition duration to 0.3s for smooth fade-out
                            // Keep coordinate movement (left, top, transform) at 0.1s for responsiveness
                            tooltipEl.style.transition = 'opacity 0.3s ease, left 0.1s ease, top 0.1s ease, transform 0.1s ease';
                            
                            tooltipEl.style.fontFamily = 'monospace';
                            tooltipEl.style.fontSize = '12px';
                            tooltipEl.style.color = '#333';
                            tooltipEl.style.boxShadow = '0 4px 15px rgba(0,0,0,0.15)';
                            tooltipEl.style.zIndex = '1000';
                            document.body.appendChild(tooltipEl);
                        }

                        const tooltipModel = context.tooltip;

                        // ⚡ Trigger fade-out effect when mouse leaves circular area (Opacity becomes 0)
                        if (tooltipModel.opacity === 0) {
                            tooltipEl.style.opacity = 0;
                            return;
                        }

                        // Pre-declare status label variable for subsequent positioning
                        let statusLabel = '';

                        // Assemble display content
                        if (tooltipModel.body) {
                            const dataIndex = tooltipModel.dataPoints[0].dataIndex;
                            statusLabel = context.chart.data.labels[dataIndex];

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

                        // Calculate center and radius to push Tooltip outside the circle
                        const position = context.chart.canvas.getBoundingClientRect();
                        const chartArea = context.chart.chartArea;
                        
                        const centerX = position.left + window.pageXOffset + (chartArea.left + chartArea.right) / 2;
                        const centerY = position.top + window.pageYOffset + (chartArea.top + chartArea.bottom) / 2;

                        const mouseX = position.left + window.pageXOffset + tooltipModel.caretX;
                        const mouseY = position.top + window.pageYOffset + tooltipModel.caretY;

                        const angle = Math.atan2(mouseY - centerY, mouseX - centerX);
                        const radius = Math.min(chartArea.right - chartArea.left, chartArea.bottom - chartArea.top) / 2;

                        const distance = radius + 30;

                        // Default calculated dynamic coordinates
                        let finalX = centerX + Math.cos(angle) * distance;
                        let finalY = centerY + Math.sin(angle) * distance;
                        let translateX = Math.cos(angle) > 0 ? '0%' : '-100%';
                        let translateY = Math.sin(angle) > 0 ? '0%' : '-100%';

                        // ⚡ Force coordinates for timed_waiting to top-left corner
                        if (statusLabel === 'timed_waiting') {
                            finalX = centerX - radius - 10; // Push left outside the circle
                            finalY = centerY - radius - 10; // Push top outside the circle
                            translateX = '-70%';           // Extend yellow box further to the left
                            translateY = '-50%';           // Extend yellow box further upwards
                        }

                        // Display and position Tooltip
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

    // ===== 3. Synchronously Fetch Data from Both APIs =====
    async function fetchBackendStats() {
        const URL_PIE = 'http://192.168.3.85:9090/Load/loadStats';
        const URL_FILTER = 'http://192.168.3.85:9090/Load/allFilterLoadStats';
        
        try {
            const [resPie, resFilter] = await Promise.all([
                fetch(URL_PIE, { method: 'GET', headers: { 'accept': '*/*' } }).catch(() => null),
                fetch(URL_FILTER, { method: 'GET', headers: { 'accept': '*/*' } }).catch(() => null)
            ]);

            // 1. Process Pie Chart Data (loadStats)
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

            // 2. Process Utilization, Server Pressure, and Recent Processing Time (allFilterLoadStats)
            if (resFilter && resFilter.ok) {
                const filterJson = await resFilter.json();
                
                const threadStats = filterJson.threadStats || {};
                
                // Store 4 fields into filterLoadData for Tooltip usage
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

                // Update top right recent data processing time
                const timeEl = document.getElementById('process-time-val');
                if (timeEl) {
                    timeEl.innerText = lastestProcessTime;
                }

                // Calculate Server Pressure
                let p1 = 0.4 * utilization; 
                let p2 = 0.3 * (((busy + 1.5 * blocked) / total) / 3 * 100);
                let p3 = 0.3 * ((queueSize / 50) * 100);
                
                let pressure = p1 + p2 + p3;
                pressure = Math.max(0, Math.min(100, Math.round(pressure)));

                // Update Server Pressure display values
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

                // Update existing pressure load gauge
                const MAX_QUEUE_LIMIT = 100;
                setGaugeValue(queueSize, MAX_QUEUE_LIMIT);
            }

        } catch (error) {
            console.error('Failed to fetch backend load stats:', error);
        }
    }

    // Initialize and set periodic updates (every 1 second)
    fetchBackendStats();
    setInterval(fetchBackendStats, 1000);
});