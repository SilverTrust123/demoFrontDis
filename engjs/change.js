document.addEventListener('DOMContentLoaded', () => {
    const textArea = document.getElementById('main-textarea');
    const saveStatus = document.getElementById('save-status');

    const HOST = window.location.hostname || "192.168.3.85";
    const GET_URL = `http://192.168.3.85:9090/todo/getMessage`; 
    const POST_URL = `http://192.168.3.85:9090/todo/`;          

    let debounceTimer = null;

    // 1. Fetch historical handover items (GET)
    async function fetchMessages() {
        try {
            saveStatus.textContent = "Loading...";
            const response = await fetch(GET_URL, {
                method: 'GET',
                headers: { 'accept': '*/*' }
            });

            if (!response.ok) throw new Error('Network response was not ok');

            const dataArray = await response.json();
            
            // Get the latest entry and display it on the canvas
            if (dataArray && dataArray.length > 0) {
                const latestMessage = dataArray[dataArray.length - 1].message || "";
                textArea.value = latestMessage;
            }

            saveStatus.textContent = "Latest content loaded";
            saveStatus.style.color = '#888';
            setTimeout(() => { if (saveStatus.textContent === "Latest content loaded") saveStatus.textContent = ""; }, 2000);

        } catch (error) {
            console.error("Failed to fetch handover items:", error);
            saveStatus.textContent = 'Failed to load';
            saveStatus.style.color = '#e74c3c';
        }
    }

    // 2. Send new handover items (POST)
    async function sendMessage() {
        const text = textArea.value;

        saveStatus.textContent = "Saving...";
        saveStatus.style.color = '#888';

        try {
            const payload = { message: text };

            const response = await fetch(POST_URL, {
                method: 'POST',
                headers: {
                    'accept': '*/*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload) 
            });

            if (response.ok) {
                saveStatus.textContent = "Auto-saved ✓";
                saveStatus.style.color = '#2ecc71'; // Success Green
                
                // Hide prompt after 3 seconds
                setTimeout(() => {
                    if (saveStatus.textContent === "Auto-saved ✓") saveStatus.textContent = "";
                }, 3000);
            } else {
                saveStatus.textContent = "Save failed ✕";
                saveStatus.style.color = '#e74c3c';
            }
        } catch (error) {
            console.error("Error sending message:", error);
            saveStatus.textContent = "Network error, save failed ✕";
            saveStatus.style.color = '#e74c3c';
        }
    }

    // --- Event Listeners (Auto-save Mechanism) ---
    // Listen for keyboard input events, triggered whenever typing occurs
    textArea.addEventListener('input', () => {
        saveStatus.textContent = "Editing...";
        saveStatus.style.color = '#888';
        
        // Clear previous timer on every keypress
        clearTimeout(debounceTimer);
        
        // Set new timer to automatically call sendMessage() after 1000 ms (1 sec) of inactivity
        debounceTimer = setTimeout(() => {
            sendMessage();
        }, 1000);
    });

    // Fetch historical content immediately upon page load
    fetchMessages();
});