document.addEventListener('DOMContentLoaded', () => {
    const machineImg = document.getElementById('machineImg');
    const machineDesc = document.getElementById('machineDesc');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const navIcons = document.querySelectorAll('.nav-icon');
    
    // Element toggle declarations
    const imageBox = document.getElementById('imageBox');
    const infoColumn = document.getElementById('infoColumn');
    const videoBox = document.getElementById('videoBox');
    const modelVideo = document.getElementById('modelVideo');
    const btnMetalModel = document.getElementById('btnMetalModel');
    const btnNonMetalModel = document.getElementById('btnNonMetalModel');

    const machineData = [
        { img: '../picture/realmachine1.png', desc: 'Conveyor 1:<br>Conveys workpieces to the infrared sensor for metal identification' },
        { img: '../picture/realmachine2.png', desc: 'Gantry Robotic Arm:<br>When a workpiece is identified as metal, the gantry robotic arm activates to pick it up and transfer it to Conveyor 2' },
        { img: '../picture/realmachine4.png', desc: 'Conveyor 2:<br>When the gantry robotic arm places the metal workpiece, Conveyor 2 conveys it to the front of the rotary robotic arm' },
        { img: '../picture/realmachine3.png', desc: 'Rotary Cylinder Robotic Arm:<br>When Conveyor 2 conveys the workpiece to the robotic arm, it suctions downward to place the workpiece into the finished goods area' },
        { img: '../picture/realmachine5.png', desc: 'Slide Table Cylinder Robotic Arm:<br>When a workpiece is determined to be non-metal, the robotic arm activates to pick up the non-metal workpiece and transfer it to the drop-off area' }
    ];

    let currentIndex = 0;
    let isVideoMode = false;

    // Update machine display (image & text)
    const updateDisplay = (index) => {
        isVideoMode = false;
        currentIndex = index;

        // Display image & text, hide and pause video
        imageBox.style.display = 'flex';
        infoColumn.style.display = 'flex';
        videoBox.style.display = 'none';
        modelVideo.pause();

        // Remove active state from model buttons
        btnMetalModel.classList.remove('active');
        btnNonMetalModel.classList.remove('active');

        // Update image and description content
        machineImg.src = machineData[index].img;
        machineDesc.innerHTML = machineData[index].desc;

        machineDesc.style.fontSize = "30px";
        machineDesc.style.fontWeight = "bold";
        machineDesc.style.lineHeight = "1.5";
        machineDesc.style.color = "var(--text-color, #333)";

        // Update navigation icon highlighting
        navIcons.forEach((icon, i) => {
            if (i === index) {
                icon.classList.add('active');
                icon.style.opacity = "1";
            } else {
                icon.classList.remove('active');
                icon.style.opacity = "0.5";
            }
        });
    };

    // Switch to video mode
    const playVideoModel = (videoSrc, activeBtn) => {
        isVideoMode = true;

        // Hide image & text, display video
        imageBox.style.display = 'none';
        infoColumn.style.display = 'none';
        videoBox.style.display = 'flex';

        // Remove active state highlighting from navigation icons
        navIcons.forEach(icon => {
            icon.classList.remove('active');
            icon.style.opacity = "0.5";
        });

        // Handle button active states
        btnMetalModel.classList.remove('active');
        btnNonMetalModel.classList.remove('active');
        activeBtn.classList.add('active');

        // Load and play video
        modelVideo.src = videoSrc;
        modelVideo.load();
        modelVideo.play();
    };

    // Left/Right arrow controls
    nextBtn.addEventListener('click', () => {
        let index = (currentIndex + 1) % machineData.length;
        updateDisplay(index);
    });

    prevBtn.addEventListener('click', () => {
        let index = (currentIndex - 1 + machineData.length) % machineData.length;
        updateDisplay(index);
    });

    // Click handlers for the 5 equipment navigation icons
    navIcons.forEach((icon) => {
        icon.addEventListener('click', () => {
            const index = parseInt(icon.getAttribute('data-index'));
            updateDisplay(index);
        });
    });

    // Click handlers for 3D model buttons
    btnMetalModel.addEventListener('click', () => {
        playVideoModel('../video/生產線.mp4', btnMetalModel);
    });

    btnNonMetalModel.addEventListener('click', () => {
        playVideoModel('../video/非金屬生產線.mp4', btnNonMetalModel);
    });

    // Default initialization to the first equipment item
    updateDisplay(0);
});