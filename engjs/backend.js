document.addEventListener('DOMContentLoaded', () => {

    // 註冊 ChartDataLabels 插件
    if (typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
    }

    // 全域變數保存過濾後的詳細數據，供 Tooltip 顯示使用
    let filterLoadData = {
        total_thread: 0,
        busy_thread: 0,
        idle_thread: 0,
        blocked_thread: 0
    };

 // ===== 1. 初始化圓餅圖 =====
    const pieCanvas = document.getElementById('statusPieChart');
    const ctx = pieCanvas.getContext('2d');

    // ⚡ 雙重保險：當滑鼠徹底離開畫布時，強制讓提示框平滑淡出消失
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
                    '#89def8',   // waiting - 藍色
                    '#e373fd',   // blocked - 紫粉色
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
                // 讓 Tooltip 完美飄浮在圓餅圖外側並自然消失
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
                            
                            tooltipEl.style.transition = 'opacity 0.3s ease, left 0.1s ease, top 0.1s ease, transform 0.1s ease';
                            
                            tooltipEl.style.fontFamily = 'monospace';
                            tooltipEl.style.fontSize = '12px';
                            tooltipEl.style.color = '#333';
                            tooltipEl.style.boxShadow = '0 4px 15px rgba(0,0,0,0.15)';
                            tooltipEl.style.zIndex = '1000';
                            document.body.appendChild(tooltipEl);
                        }

                        const tooltipModel = context.tooltip;

                        // 當滑鼠離開圓形區塊 (Opacity 變 0) 時，觸發淡出效果
                        if (tooltipModel.opacity === 0) {
                            tooltipEl.style.opacity = 0;
                            return;
                        }

                        let statusLabel = '';

                        // 組裝顯示內容 (翻譯為英文)
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

                        // 計算圓心與半徑，將 Tooltip 推到圓外
                        const position = context.chart.canvas.getBoundingClientRect();
                        const chartArea = context.chart.chartArea;
                        
                        const centerX = position.left + window.pageXOffset + (chartArea.left + chartArea.right) / 2;
                        const centerY = position.top + window.pageYOffset + (chartArea.top + chartArea.bottom) / 2;

                        const mouseX = position.left + window.pageXOffset + tooltipModel.caretX;
                        const mouseY = position.top + window.pageYOffset + tooltipModel.caretY;

                        const angle = Math.atan2(mouseY - centerY, mouseX - centerX);
                        const radius = Math.min(chartArea.right - chartArea.left, chartArea.bottom - chartArea.top) / 2;

                        const distance = radius + 30;

                        // 預設計算出來的動態座標
                        let finalX = centerX + Math.cos(angle) * distance;
                        let finalY = centerY + Math.sin(angle) * distance;
                        let translateX = Math.cos(angle) > 0 ? '0%' : '-100%';
                        let translateY = Math.sin(angle) > 0 ? '0%' : '-100%';

                        // 針對 timed_waiting 強制將座標鎖定在「左上角」
                        if (statusLabel === 'timed_waiting') {
                            finalX = centerX - radius - 10; 
                            finalY = centerY - radius - 10; 
                            translateX = '-70%';           
                            translateY = '-50%';           
                        }

                        // 顯示並定位 Tooltip
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

    // ===== 2. 壓力負載指標控制 (一分為二) =====
    const needle = document.getElementById('gaugeNeedle');
    const gaugeContainer = document.querySelector('.gauge-container');

    // 獨立控制：上方半圓圖 (對應 Queue Size)
    function setSemiCircleValue(value, max = 100) {
        let constrainedPercent = Math.max(0, Math.min(100, (value / max) * 100));
        if (gaugeContainer) {
            gaugeContainer.style.setProperty('--gauge-percent', constrainedPercent);
        }
    }

    // 獨立控制：下方長條圖指針 (對應 Latest Process Time)
    function setLinearGaugeValue(value, max = 2500) {
        let constrainedPercent = Math.max(0, Math.min(100, (value / max) * 100));
        if (needle) {
            needle.style.left = `${constrainedPercent}%`;
        }
    }

    // ===== 3. 同步請求兩支 API =====
    async function fetchBackendStats() {
        const URL_PIE = 'http://192.168.3.85:9090/Load/loadStats';
        const URL_FILTER = 'http://192.168.3.85:9090/Load/allFilterLoadStats';
        
        try {
            const [resPie, resFilter] = await Promise.all([
                fetch(URL_PIE, { method: 'GET', headers: { 'accept': '*/*' } }).catch(() => null),
                fetch(URL_FILTER, { method: 'GET', headers: { 'accept': '*/*' } }).catch(() => null)
            ]);

            // 1. 處理圓餅圖資料 (loadStats)
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

            // 2. 處理利用率、伺服器壓力與最新處理時間 (allFilterLoadStats)
            if (resFilter && resFilter.ok) {
                const filterJson = await resFilter.json();
                
                const threadStats = filterJson.threadStats || {};
                
                // 存入指定的四個欄位供 Tooltip 使用
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
                
                // 抓取 QueueSize 與 處理時間
                const queueSize = filterJson.queueSize || 0;
                const lastestProcessTime = filterJson.lastestProcessTime || 0;

                // 更新頂部左側目前利用率
                const utilEl = document.getElementById('utilization-val');
                if (utilEl) {
                    utilEl.innerText = `${utilization}%`;
                }

                // 更新頂部右側最近一個資料處理時間
                const timeEl = document.getElementById('process-time-val');
                if (timeEl) {
                    timeEl.innerText = lastestProcessTime;
                }

                // 計算伺服器壓力
                let p1 = 0.4 * utilization; 
                let p2 = 0.3 * (((busy + 1.5 * blocked) / total) / 3 * 100);
                let p3 = 0.3 * ((queueSize / 50) * 100);
                
                let pressure = p1 + p2 + p3;
                pressure = Math.max(0, Math.min(100, Math.round(pressure)));

                // 更新伺服器壓力的數值顯示
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
                // 雙圖表分離更新邏輯
                // ==========================================
                // 1. 更新上方半圓圖 (依照 queueSize，假設滿載為 100)
                const MAX_QUEUE_LIMIT = 100;
                setSemiCircleValue(queueSize, MAX_QUEUE_LIMIT);

                // 2. 更新下方長條圖指針 (依照 lastestProcessTime，極限為 2500ms)
                const MAX_TIME_LIMIT = 2500;
                setLinearGaugeValue(lastestProcessTime, MAX_TIME_LIMIT);
            }

        } catch (error) {
            console.error('Failed to fetch backend load data:', error);
        }
    }

    // 初始化與設定定期連線更新 (每 1 秒)
    fetchBackendStats();
    setInterval(fetchBackendStats, 1000);
});