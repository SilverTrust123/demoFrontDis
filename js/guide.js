document.addEventListener('DOMContentLoaded', () => {
    const machineImg = document.getElementById('machineImg');
    const machineDesc = document.getElementById('machineDesc');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const navIcons = document.querySelectorAll('.nav-icon');
    
    // 元素切換宣告
    const imageBox = document.getElementById('imageBox');
    const infoColumn = document.getElementById('infoColumn');
    const videoBox = document.getElementById('videoBox');
    const modelVideo = document.getElementById('modelVideo');
    const btnMetalModel = document.getElementById('btnMetalModel');
    const btnNonMetalModel = document.getElementById('btnNonMetalModel');

    const machineData = [
        { img: '../picture/realmachine1.png', desc: '輸送帶 1：<br>輸送工件到紅外線感測器前辨識是否為金屬品' },
        { img: '../picture/realmachine2.png', desc: '龍門機械臂：<br>當產品為金屬品時龍門機械臂啟動夾取工件到輸送帶2' },
        { img: '../picture/realmachine4.png', desc: '輸送帶 2：<br>當龍門機械臂放置金屬工件時輸送帶2將金屬工件輸送到旋轉機械臂前' },
        { img: '../picture/realmachine3.png', desc: '旋轉缸機械臂：<br>當輸送帶2將工件輸送至機械臂時向下吸取將工件放置成品區' },
        { img: '../picture/realmachine5.png', desc: '滑台缸機械臂：<br>當判斷工件為非金屬時機械臂啟動夾取非金屬工件到放置區' }
    ];

    let currentIndex = 0;
    let isVideoMode = false;

    // 更新設備展示 (圖文)
    const updateDisplay = (index) => {
        isVideoMode = false;
        currentIndex = index;

        // 顯示圖文，隱藏並暫停影片
        imageBox.style.display = 'flex';
        infoColumn.style.display = 'flex';
        videoBox.style.display = 'none';
        modelVideo.pause();

        // 取消模型按鈕的亮起狀態
        btnMetalModel.classList.remove('active');
        btnNonMetalModel.classList.remove('active');

        // 更新圖片與內文
        machineImg.src = machineData[index].img;
        machineDesc.innerHTML = machineData[index].desc;

        machineDesc.style.fontSize = "30px";
        machineDesc.style.fontWeight = "bold";
        machineDesc.style.lineHeight = "1.5";
        machineDesc.style.color = "var(--text-color, #333)";

        // 更新圖示高亮
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

    // 切換至影片模式
    const playVideoModel = (videoSrc, activeBtn) => {
        isVideoMode = true;

        // 隱藏圖文，顯示影片
        imageBox.style.display = 'none';
        infoColumn.style.display = 'none';
        videoBox.style.display = 'flex';

        // 取消小圖示高亮
        navIcons.forEach(icon => {
            icon.classList.remove('active');
            icon.style.opacity = "0.5";
        });

        // 處理按鈕樣式
        btnMetalModel.classList.remove('active');
        btnNonMetalModel.classList.remove('active');
        activeBtn.classList.add('active');

        // 載入並播放影片
        modelVideo.src = videoSrc;
        modelVideo.load();
        modelVideo.play();
    };

    // 左右箭頭切換
    nextBtn.addEventListener('click', () => {
        let index = (currentIndex + 1) % machineData.length;
        updateDisplay(index);
    });

    prevBtn.addEventListener('click', () => {
        let index = (currentIndex - 1 + machineData.length) % machineData.length;
        updateDisplay(index);
    });

    // 點擊 5 個設備小圖示
    navIcons.forEach((icon) => {
        icon.addEventListener('click', () => {
            const index = parseInt(icon.getAttribute('data-index'));
            updateDisplay(index);
        });
    });

    // 點擊模型按鈕
    btnMetalModel.addEventListener('click', () => {
        playVideoModel('../video/生產線.mp4', btnMetalModel);
    });

    btnNonMetalModel.addEventListener('click', () => {
        playVideoModel('../video/非金屬生產線.mp4', btnNonMetalModel);
    });

    // 預設初始化為第一個設備
    updateDisplay(0);
});