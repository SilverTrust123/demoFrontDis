document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize carousel toggle logic
    initCarousel();

    // 2. Load saved thresholds into input fields
    loadSavedLimits();
});

/**
 * Carousel toggle logic
 */
function initCarousel() {
    const track = document.getElementById('carouselTrack');
    const nextBtn = document.getElementById('nextBtn');
    const prevBtn = document.getElementById('prevBtn');

    // Check if elements exist to prevent null reference errors
    if (!track || !nextBtn || !prevBtn) return;

    let currentIndex = 0;
    
    // Dynamically calculate total pages (via count of .carousel-page)
    const pages = track.querySelectorAll('.carousel-page');
    const totalPages = pages.length;

    // Update screen slide position
    const updateSlide = () => {
        track.style.transform = `translateX(-${currentIndex * 100}%)`;
    };

    // Next page button event
    nextBtn.addEventListener('click', () => {
        if (currentIndex < totalPages - 1) {
            currentIndex++;
            updateSlide();
        }
    });

    // Previous page button event
    prevBtn.addEventListener('click', () => {
        if (currentIndex > 0) {
            currentIndex--;
            updateSlide();
        }
    });
}

/**
 * Save sensor threshold to localStorage
 * @param {string} deviceId - Device ID (e.g., '8266_2')
 * @param {string} metric - Monitoring metric (e.g., 'temp', 'hum', 'dust', 'aq', 'power')
 * @param {string} type - Threshold type ('max' or 'min')
 * @param {string} inputId - Corresponding input element ID
 */
function saveSensorLimit(deviceId, metric, type, inputId) {
    const inputEl = document.getElementById(inputId);
    if (!inputEl) return;

    const val = inputEl.value.trim();
    if (val === "" || isNaN(val)) {
        alert("Please enter a valid numeric value!");
        return;
    }

    // Read existing configuration
    const limits = JSON.parse(localStorage.getItem('SENSOR_LIMITS') || '{}');
    
    if (!limits[deviceId]) limits[deviceId] = {};
    if (!limits[deviceId][metric]) limits[deviceId][metric] = {};

    limits[deviceId][metric][type] = parseFloat(val);

    localStorage.setItem('SENSOR_LIMITS', JSON.stringify(limits));
    alert(`Setting successful: ${deviceId} [${metric}] alert upper limit set to ${val}`);
}

/**
 * Read localStorage on page load and fill values back into input fields
 */
function loadSavedLimits() {
    const limits = JSON.parse(localStorage.getItem('SENSOR_LIMITS') || '{}');
    
    for (const dev in limits) {
        for (const metric in limits[dev]) {
            if (limits[dev][metric].max !== undefined) {
                const el = document.getElementById(`${metric}-max-${dev}`);
                if (el) el.value = limits[dev][metric].max;
            }
        }
    }
}