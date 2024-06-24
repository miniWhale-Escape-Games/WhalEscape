document.addEventListener('DOMContentLoaded', () => {
    const whale = document.getElementById('whale');
    const gameArea = document.getElementById('gameArea');
    const scoreDisplay = document.getElementById('scoreDisplay');
    const powerUpDisplay = document.getElementById('powerUpDisplay');
    const countdownTimer = document.getElementById('countdownTimer');
    const backgroundVideo = document.getElementById('backgroundVideo');
    const leaderboardSection = document.getElementById('leaderboard');
    const gameSection = document.getElementById('game');
    const futureGamesSection = document.getElementById('futureGames');
    const startButton = document.getElementById('startButton');
    const leaderboardButton = document.getElementById('leaderboardButton');
    const blastrKeyStatus = document.getElementById('blastrKeyStatus');

    let isGameOver = false;
    let score = -400;
    let gameSpeed = 600;
    let obstacleInterval = 1500;
    let powerUpPresent = false;
    let hasBlastrKey = false;
    let selectedAccount = null;
    let submitScore = true;
    let currentPage = 0;
    const rowsPerPage = 100;
    let leaderboardData = []; // Global variable to store the leaderboard data

    function displayBlastrKeyStatus(hasBlastrKey) {
        let statusElement = document.getElementById('blastrKeyStatus');
        if (!statusElement) {
            statusElement = document.createElement('div');
            statusElement.id = 'blastrKeyStatus';
            statusElement.style.position = 'absolute';
            statusElement.style.bottom = '10px';
            statusElement.style.right = '10px';
            statusElement.style.padding = '10px';
            statusElement.style.backgroundColor = hasBlastrKey ? 'green' : 'red';
            statusElement.style.color = 'white';
            statusElement.style.zIndex = '1000';
            gameArea.appendChild(statusElement);
        }
        statusElement.textContent = hasBlastrKey ? 'Blastr Key: Active' : 'Blastr Key: Inactive';
    }

    async function fetchBlastrKeyStatus() {
        try {
            const response = await fetch('/get_blastr_key_status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            const result = await response.json();
            hasBlastrKey = result.status === 'success' && result.blastr_keys > 0;
            displayBlastrKeyStatus(hasBlastrKey);
        } catch (error) {
            console.error('Error fetching Blastr Key status:', error);
            displayBlastrKeyStatus(false);
        }
    }

    async function connectWallet() {
        showLoadingIndicator();
        try {
            provider = await web3Modal.connect();
            const web3 = new Web3(provider);
            const accounts = await web3.eth.getAccounts();
            selectedAccount = accounts[0];

            const authenticated = await checkAuthentication(selectedAccount);
            if (!authenticated) {
                const nonce = new Date().toISOString();
                const domain = window.location.origin;

                const message = `Sign this message to verify your ownership of the Whale Escape NFT. Nonce: ${nonce}, Domain: ${domain}`;
                const signature = await web3.eth.personal.sign(message, selectedAccount);
                await checkNFT(selectedAccount, signature, message);
            }

            const token = await getAuthToken(selectedAccount);
            localStorage.setItem('accessToken', token);

            await fetchBlastrKeyStatus();

            document.getElementById('connectButton').style.display = 'none';
            if (hasWhaleNFT) {
                document.getElementById('playButton').style.display = 'block';
                document.getElementById('nftMessage').style.display = 'none';
                document.getElementById('mintLink').style.display = 'none';
            } else {
                document.getElementById('connectButton').style.display = 'block';
                document.getElementById('nftMessage').textContent = "No Whale NFT owned";
                document.getElementById('nftMessage').style.display = 'block';
                document.getElementById('mintLink').style.display = 'block';
            }
            loadLeaderboard();
        } catch (error) {
            console.error("User rejected the request.");
        } finally {
            hideLoadingIndicator();
        }
    }

    async function getAuthToken(account) {
        return 'your-token-value';
    }

    window.addEventListener('load', connectWallet);

    const sounds = {
        gameStart: new Audio('/static/point.wav'),
        gameOver: new Audio('/static/game_over.mp3'),
        upgrade: new Audio('/static/point.wav'),
        die: new Audio('/static/assets/die.wav'),
        jump: new Audio('/static/assets/jump.wav'),
        point: new Audio('/static/assets/point.wav')
    };

    function playSound(sound) {
        sound.play();
    }

    function stopSound(sound) {
        sound.pause();
        sound.currentTime = 0;
    }

    document.querySelectorAll('.sidebar-button').forEach(button => {
        button.addEventListener('mousedown', () => playSound(sounds.buttonDown));
        button.addEventListener('mouseup', () => playSound(sounds.buttonUp));
    });

    function preventDefault(e) {
        if (['ArrowUp', 'ArrowDown'].includes(e.code)) {
            e.preventDefault();
        }
    }

    window.addEventListener('keydown', preventDefault);

    function moveWhale(e) {
        if (isGameOver) return;
        const whaleTop = parseInt(window.getComputedStyle(whale).getPropertyValue("top"));
        const moveDistance = 20;
        const topBoundary = 10;
        const bottomBoundary = gameArea.clientHeight - whale.clientHeight - 10;

        if (e.code === 'ArrowUp' && whaleTop > topBoundary) {
            whale.style.top = `${whaleTop - moveDistance}px`;
            playSound(sounds.jump);
        }
        if (e.code === 'ArrowDown' && whaleTop < bottomBoundary) {
            whale.style.top = `${whaleTop + moveDistance}px`;
            playSound(sounds.jump);
        }
    }

    document.addEventListener('keydown', moveWhale);

    const twitterButton = document.getElementById('twitterButton');
    twitterButton.addEventListener('click', () => {
        const tweetText = encodeURIComponent('Check out this amazing game competition! #miniWhale');
        const tweetUrl = encodeURIComponent(window.location.href);
        const twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}&url=${tweetUrl}`;
        window.open(twitterUrl, '_blank');
    });

    function gameOver() {
        if (isGameOver) return;  // Prevent multiple gameOver calls
        isGameOver = true;
        gsap.globalTimeline.pause();
        scoreDisplay.innerHTML = `Final Score: ${score}`;
        stopSound(sounds.gameStart);
        playSound(sounds.die);

        const gameOverGif = document.createElement('img');
        gameOverGif.id = 'gameOverGif';
        gameOverGif.src = 'static/assets/gameover.gif';
        gameOverGif.style.position = 'absolute';
        gameOverGif.style.top = '50%';
        gameOverGif.style.left = '50%';
        gameOverGif.style.transform = 'translate(-50%, -50%)';
        gameOverGif.style.zIndex = '1000';

        gameOverGif.onload = () => {
            gameArea.appendChild(gameOverGif);

            gameArea.addEventListener('click', handleGameRestart);
            startButton.addEventListener('click', handleGameRestart);
            startButton.textContent = 'Restart';

            sendGameEvent(selectedAccount, { type: 'game_over' });
        };

        gameArea.appendChild(gameOverGif);
    }

    async function sendGameEvent(walletAddress, event) {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            console.error("No access token found");
            return;
        }

        const eventData = {
            walletAddress: walletAddress,
            type: event.type,
            score: event.score,
            timestamp: new Date().toISOString()
        };

        console.log("Sending event data:", eventData);

        try {
            const response = await fetch('/submit_event', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(eventData)
            });

            const result = await response.json();
            if (result.status !== 'success') {
                console.error(result.message);
            }
        } catch (error) {
            console.error('Error sending game event:', error);
        }
    }

    async function startGame() {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            console.error("No access token found");
            return;
        }

        try {
            const response = await fetch('/start_game', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();
            if (result.status !== 'success') {
                console.error(result.message);
                return;
            }

            const gameOverGif = document.getElementById('gameOverGif');
            if (gameOverGif) {
                gameOverGif.remove();
            }

            leaderboardSection.style.display = 'none';
            gameSection.style.display = 'block';
            futureGamesSection.style.display = 'block';
            isGameOver = false;
            score = -400;
            gameSpeed = 600;
            obstacleInterval = 1500;
            powerUpPresent = false;
            submitScore = true;
            gsap.globalTimeline.resume();
            scoreDisplay.innerHTML = 'Score: 0';
            playSound(sounds.gameStart);

            gameArea.removeEventListener('click', handleGameRestart);
            startButton.textContent = 'Start';

            document.querySelectorAll('.obstacle, .power-up').forEach(element => element.remove());

            clearInterval(obstacleCreationInterval);
            clearInterval(powerUpCreationInterval);
            obstacleCreationInterval = setInterval(createObstacle, obstacleInterval);
            powerUpCreationInterval = setInterval(createPowerUp, 30000);

        } catch (error) {
            console.error('Error starting game:', error);
        }
    }

    function handleGameRestart() {
        if (isGameOver) {
            startGame();
        }
    }

    gameArea.addEventListener('click', handleGameRestart);

    function handleStartButtonClick() {
        startGame();
    }

    window.startGame = startGame;
    window.handleStartButtonClick = handleStartButtonClick;

    function createObstacle() {
        if (isGameOver) return;

        const obstacleGifs = [
            'static/assets/shark.gif',
            'static/assets/killerwhale.gif',
        ];

        const randomGif = obstacleGifs[Math.floor(Math.random() * obstacleGifs.length)];

        let obstacle = document.createElement('img');
        obstacle.src = randomGif;
        obstacle.classList.add('obstacle');
        obstacle.style.position = 'absolute';

        const whaleWidth = whale.offsetWidth;
        const minWidth = whaleWidth;
        const maxWidth = whaleWidth * 2;
        const randomWidth = Math.random() * (maxWidth - minWidth) + minWidth;

        obstacle.style.width = `${randomWidth}px`;
        obstacle.style.height = 'auto';
        obstacle.style.right = '0px';

        let obstaclePosition = Math.random() * (gameArea.clientHeight - 50);
        obstacle.style.top = `${obstaclePosition}px`;

        gameArea.appendChild(obstacle);

        const isFastObstacle = Math.random() < 0.1;
        const obstacleSpeedFactor = isFastObstacle ? 1.5 : 1;

        gsap.to(obstacle, {
            duration: (6000 - gameSpeed * 100) / 1000 / obstacleSpeedFactor,
            x: -gameArea.clientWidth,
            ease: 'none',
            onComplete: function() {
                obstacle.remove();
                updateScore();
            },
            onUpdate: function() {
                checkCollision(obstacle);
            }
        });
    }

    function createPowerUp() {
        if (isGameOver || powerUpPresent) return;

        powerUpPresent = true;
        let powerUp = document.createElement('div');
        powerUp.classList.add('power-up');
        let powerUpPosition = Math.random() * (gameArea.clientHeight - 50);
        powerUp.style.top = `${powerUpPosition}px`;
        powerUp.style.right = '0px';

        gameArea.appendChild(powerUp);

        gsap.to(powerUp, {
            duration: (6000 - gameSpeed * 100) / 2000,
            x: -gameArea.clientWidth,
            ease: 'none',
            onComplete: function() {
                powerUp.remove();
                powerUpPresent = false;
            },
            onUpdate: function() {
                checkPowerUpCollision(powerUp);
            }
        });
    }

    function checkCollision(obstacle) {
        let whaleRect = whale.getBoundingClientRect();
        let obstacleRect = obstacle.getBoundingClientRect();

        let overlapX = Math.max(0, Math.min(whaleRect.right, obstacleRect.right) - Math.max(whaleRect.left, obstacleRect.left));
        let overlapY = Math.max(0, Math.min(whaleRect.bottom, obstacleRect.bottom) - Math.max(whaleRect.top, obstacleRect.top));
        let overlapArea = overlapX * overlapY;

        let whaleArea = whaleRect.width * whaleRect.height;

        let overlapPercentage = (overlapArea / whaleArea) * 100;

        let collisionThreshold = 18;
        if (overlapPercentage > collisionThreshold) {
            createParticleEffect(whaleRect.left + whaleRect.width / 2, whaleRect.top + whaleRect.height / 2);
            gameOver();
        }
    }

    function checkPowerUpCollision(powerUp) {
        let whaleRect = whale.getBoundingClientRect();
        let powerUpRect = powerUp.getBoundingClientRect();

        if (whaleRect.right > powerUpRect.left && whaleRect.left < powerUpRect.right &&
            whaleRect.top < powerUpRect.bottom && whaleRect.bottom > powerUpRect.top) {
            applyPowerUp();
            powerUp.remove();
            powerUpPresent = false;
        }
    }

    function applyPowerUp() {
        const baseDuration = 10;
        const durationMultiplier = hasBlastrKey ? 1.5 : 1;
        const powerUpDuration = baseDuration * durationMultiplier;

        let powerUpType = Math.floor(Math.random() * 4);

        switch (powerUpType) {
            case 0:
                applySpeedBoost(powerUpDuration);
                break;
            case 1:
                applyInvincibility(powerUpDuration);
                break;
            case 2:
                applyScoreMultiplier(powerUpDuration);
                break;
        }
        playSound(sounds.point);
    }

    function displayPowerUp(type, duration) {
        powerUpDisplay.innerHTML = `Power-Up: ${type}`;
        powerUpDisplay.style.display = 'block';
        let countdown = duration;
        countdownTimer.innerHTML = ` (${countdown}s)`;
        let countdownInterval = setInterval(() => {
            countdown--;
            countdownTimer.innerHTML = ` (${countdown}s)`;
            if (countdown <= 0) {
                clearInterval(countdownInterval);
                powerUpDisplay.style.display = 'none';
            }
        }, 1000);
    }

    function applySpeedBoost(duration) {
        let originalSpeed = gameSpeed;
        gameSpeed *= 2;
        displayPowerUp('Speed Boost', duration);
        setTimeout(() => {
            gameSpeed = originalSpeed;
        }, duration * 1000);
    }

    function applyInvincibility(duration) {
        let originalCheckCollision = checkCollision;
        checkCollision = () => {};
        displayPowerUp('Invincibility', duration);
        setTimeout(() => {
            checkCollision = originalCheckCollision;
        }, duration * 1000);
    }

    function applyScoreMultiplier(duration) {
        let scoreMultiplierActive = true;
        displayPowerUp('Score Multiplier', duration);

        let multiplierInterval = setInterval(() => {
            if (!isGameOver && scoreMultiplierActive) {
                score += 100;
                scoreDisplay.innerHTML = `Score: ${score}`;
                sendGameEvent(selectedAccount, { type: 'score_update', score: score });
            }
        }, 1000);

        setTimeout(() => {
            clearInterval(multiplierInterval);
            scoreMultiplierActive = false;
        }, duration * 1000);
    }

    function createParticleEffect(x, y) {
        for (let i = 0; i < 10; i++) {
            let particle = document.createElement('div');
            particle.classList.add('particle');
            particle.style.left = `${x}px`;
            particle.style.top = `${y}px`;
            document.body.appendChild(particle);

            gsap.to(particle, {
                x: Math.random() * 100 - 50,
                y: Math.random() * 100 - 50,
                opacity: 0,
                duration: 1,
                ease: 'power1.out',
                onComplete: () => particle.remove()
            });
        }
    }

    function updateScore() {
        score += 100;
        gameSpeed = Math.min(gameSpeed + 0.1, 15);
        scoreDisplay.innerHTML = `Score: ${score}`;

        sendGameEvent(selectedAccount, { type: 'score_update', score: score });

        if (score % 10000 === 0) {
            playSound(sounds.point);
        }

        if (score % 10 === 0) {
            obstacleInterval = Math.max(obstacleInterval - 100, 500);
            clearInterval(obstacleCreationInterval);
            obstacleCreationInterval = setInterval(createObstacle, obstacleInterval);

            increaseBackgroundSpeed(1.0);
        }

        if (score >= 50) {
            addAdvancedObstacles();
        }
    }

    let obstacleCreationInterval;
    let powerUpCreationInterval;

    function increaseBackgroundSpeed(factor) {
        const currentDuration = parseFloat(window.getComputedStyle(backgroundVideo).getPropertyValue('animation-duration'));
        const newDuration = currentDuration / factor;
        backgroundVideo.style.animationDuration = `${newDuration}s`;
    }

    async function loadLeaderboard() {
        showLoadingIndicator();
        try {
            const response = await fetch('/leaderboard');
            const result = await response.json();
            if (result.status === 'success') {
                leaderboardData = result.leaderboard; // Store the data globally
                displayLeaderboardPage();
            } else {
                console.error('Failed to load leaderboard:', result.message);
            }
        } catch (error) {
            console.error('Error loading leaderboard:', error);
        } finally {
            hideLoadingIndicator();
        }
    }

    function displayLeaderboardPage() {
        const leaderboardContent = document.getElementById('leaderboardContent');
        leaderboardContent.innerHTML = '';

        const table = document.createElement('table');
        table.className = 'leaderboard-table';

        const headerRow = document.createElement('tr');
        const headers = ['#', 'Wallet Address', 'Highest Score', 'Total Plays', 'Blaster Keys'];
        headers.forEach(headerText => {
            const header = document.createElement('th');
            header.textContent = headerText;
            headerRow.appendChild(header);
        });
        table.appendChild(headerRow);

        leaderboardData.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage).forEach((entry, index) => {
            const row = document.createElement('tr');

            const rankCell = document.createElement('td');
            rankCell.textContent = currentPage * rowsPerPage + index + 1;
            row.appendChild(rankCell);

            const walletCell = document.createElement('td');
            walletCell.textContent = entry.wallet_address;
            row.appendChild(walletCell);

            const scoreCell = document.createElement('td');
            scoreCell.textContent = entry.highest_score;
            row.appendChild(scoreCell);

            const playsCell = document.createElement('td');
            playsCell.textContent = entry.total_plays;
            row.appendChild(playsCell);

            const blasterKeysCell = document.createElement('td');
            blasterKeysCell.textContent = entry.blaster_keys;
            row.appendChild(blasterKeysCell);

            table.appendChild(row);
        });

        leaderboardContent.appendChild(table);

        document.getElementById('prevButton').style.display = currentPage > 0 ? 'block' : 'none';
        document.getElementById('nextButton').style.display = (currentPage + 1) * rowsPerPage < leaderboardData.length ? 'block' : 'none';
    }

    function prevPage() {
        if (currentPage > 0) {
            currentPage--;
            displayLeaderboardPage();
        }
    }

    function nextPage() {
        if ((currentPage + 1) * rowsPerPage < leaderboardData.length) {
            currentPage++;
            displayLeaderboardPage();
        }
    }

    loadLeaderboard();

    function showMainContent() {
        document.getElementById('splashScreen').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';
        document.getElementById('siteFooter').style.display = 'block';
        futureGamesSection.style.display = 'block';
    }

    function showLeaderboard() {
        if (!isGameOver) {
            gameOver();
        }
        document.getElementById('game').style.display = 'none';
        document.getElementById('leaderboard').style.display = 'block';
        futureGamesSection.style.display = 'none';
        loadLeaderboard();
    }

    document.getElementById('leaderboardButton').addEventListener('click', showLeaderboard);
    document.getElementById('startButton').addEventListener('click', (event) => {
        event.stopPropagation();
        startGame();
    });

    const detectDevTools = (function() {
        let devtools = { open: false };
        const threshold = 160;
        const element = new Image();
        Object.defineProperty(element, 'id', {
            get: function() {
                devtools.open = true;
                submitScore = false;
                gameOver();
                return 'devtools';
            }
        });
        requestAnimationFrame(function check() {
            devtools.open = false;
            console.log(element);
            if (devtools.open) {
                submitScore = false;
                gameOver();
            }
            requestAnimationFrame(check);
        });
    })();

    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            submitScore = false;
            gameOverAndStop();
        }
    });

    document.addEventListener('keydown', function(event) {
        if ((event.ctrlKey && event.shiftKey && event.key === 'I') ||
            (event.ctrlKey && event.shiftKey && event.key === 'J') ||
            (event.ctrlKey && event.key === 'U') ||
            (event.key === 'F12') || 
            (event.type === 'contextmenu')) {
            event.preventDefault();
            submitScore = false;
            gameOverAndStop();
        }
    });

    function gameOverAndStop() {
        gameOver();
    }
});
