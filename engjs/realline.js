document.addEventListener('DOMContentLoaded', () => {
    const videoPlayer = document.getElementById('lineVideo');
    const videoTitle = document.getElementById('videoTitle');
    const toggleBtn = document.getElementById('toggleVideoBtn');

    // Define playlist
    const playlist = [
        { title: 'Production Line', src: '../video/生產線.mp4' },
        { title: 'Non-Metal Production Line', src: '../video/非金屬生產線.mp4' }
    ];

    let currentTrack = 0;

    toggleBtn.addEventListener('click', () => {
        // Toggle index
        currentTrack = (currentTrack + 1) % playlist.length;

        // Update video content
        videoPlayer.src = playlist[currentTrack].src;
        videoTitle.innerText = `Currently Playing: ${playlist[currentTrack].title}`;

        // Auto play after switching
        videoPlayer.play();

        // Update button tooltip (optional)
        const nextTrackName = playlist[(currentTrack + 1) % playlist.length].title;
        toggleBtn.title = `Switch to ${nextTrackName}`;
    });
});