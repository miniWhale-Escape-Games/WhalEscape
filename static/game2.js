document.addEventListener('DOMContentLoaded', () => {
    // Get references to elements
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

    // Game state variables
    let isGameOver = false;
    let score = 0;
    let gameSpeed = 600; // Initial game speed
    let obstacleInterval = 1500; // Initial interval to create obstacles
    let powerUpPresent = false; // Track if a power-up is present
    let hasBlastrKey = false; // Track if the user has the Blastr Key NFT

    // Function to display Blastr Key status in the game area
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

    // Function to query the server for Blastr Key status
    async function fetchBlastrKeyStatus() {
        try {
            const response = await fetch('/get_blastr_key_status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            const result = await response.json();
            hasBlastrKey = result.status === 'success' && result.blaster_keys > 0;
            displayBlastrKeyStatus(hasBlastrKey);
        } catch (error) {
            console.error('Error fetching Blastr Key status:', error);
            displayBlastrKeyStatus(false);
        }
    }

    // Function to connect the wallet and fetch relevant data
    async function connectWallet() {
        showLoadingIndicator();
        try {
            provider = await web3Modal.connect();
            const web3 = new Web3(provider);
            const accounts = await web3.eth.getAccounts();
            selectedAccount = accounts[0];

            const authenticated = await checkAuthentication(selectedAccount);
            if (!authenticated) {
                const message = "Sign this message to verify your ownership of the NFT.";
                const signature = await web3.eth.personal.sign(message, selectedAccount);
                await checkNFT(selectedAccount, signature, message);
            }

            await fetchBlastrKeyStatus();

            document.getElementById('connectButton').style.display = 'none';
            if (hasWhaleNFT) {
                document.getElementById('playButton').style.display = 'block';
            }
            loadLeaderboard();
        } catch (error) {
            console.error("User rejected the request.");
        } finally {
            hideLoadingIndicator();
        }
    }

    window.addEventListener('load', connectWallet);

    // Sound files
    const sounds = {
        gameStart: new Audio('/static/game_start.mp3'),
        gameOver: new Audio('/static/game_over.mp3'),
        upgrade: new Audio('/static/upgrade.mp3'),
        buttonDown: new Audio('/static/button_down.mp3'),
        buttonUp: new Audio('/static/button_up.mp3'),
        dodge: new Audio('/static/dodge.mp3'),
        eat: new Audio('/static/eat.mp3'),
        die: new Audio('/static/assets/die.wav'),
        jump: new Audio('/static/assets/jump.wav'),
        point: new Audio('/static/assets/point.wav')
    };

    // Function to play a sound
    function playSound(sound) {
        sound.play();
    }

    // Function to stop a sound
    function stopSound(sound) {
        sound.pause();
        sound.currentTime = 0;
    }

    // Add event listeners for button sounds
    document.querySelectorAll('.sidebar-button').forEach(button => {
        button.addEventListener('mousedown', () => playSound(sounds.buttonDown));
        button.addEventListener('mouseup', () => playSound(sounds.buttonUp));
    });

    // Function to prevent default action for arrow keys
    function preventDefault(e) {
        if (['ArrowUp', 'ArrowDown'].includes(e.code)) {
            e.preventDefault();
        }
    }

    // Add event listener to prevent default action for arrow keys
    window.addEventListener('keydown', preventDefault);

    // Function to move the whale
    function moveWhale(e) {
        if (isGameOver) return;
        const whaleTop = parseInt(window.getComputedStyle(whale).getPropertyValue("top"));
        const moveDistance = 20; // Adjust the move distance for finer control
        if (e.code === 'ArrowUp' && whaleTop > 0) {
            whale.style.top = `${whaleTop - moveDistance}px`;
            playSound(sounds.jump);
        }
        if (e.code === 'ArrowDown' && whaleTop < (gameArea.clientHeight - whale.clientHeight)) {
            whale.style.top = `${whaleTop + moveDistance}px`;
            playSound(sounds.jump);
        }
    }

    // Add event listener to move the whale
    document.addEventListener('keydown', moveWhale);

    // Function to handle game over
    function gameOver() {
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
    
        // Ensure the GIF is fully loaded before proceeding
        gameOverGif.onload = () => {
            gameArea.appendChild(gameOverGif);
            
            gameArea.addEventListener('click', handleGameRestart);
            startButton.addEventListener('click', handleGameRestart);
            startButton.textContent = 'Restart';
    
            sendGameData(selectedAccount, score); // Submit score after GIF is loaded and displayed
        };
    
        gameArea.appendChild(gameOverGif);
    }
    

    async function sendGameData(walletAddress, score) {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            console.error("No access token found");
            return;
        }
    
        try {
            const response = await fetch('/submit_score', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    walletAddress: walletAddress,
                    score: score,
                    timestamp: new Date().toISOString()
                })
            });
    
            const result = await response.json();
            if (result.status !== 'success') {
                console.error(result.message);
            }
        } catch (error) {
            console.error('Error sending game data:', error);
        }
    }
    

    function handleGameRestart() {
        if (isGameOver) {
            startGame();
        }
    }

    gameArea.addEventListener('click', handleGameRestart);

    function startGame() {
        const gameOverGif = document.getElementById('gameOverGif');
        if (gameOverGif) {
            gameOverGif.remove();
        }

        leaderboardSection.style.display = 'none';
        gameSection.style.display = 'block';
        futureGamesSection.style.display = 'block';
        isGameOver = false;
        score = 0;
        gameSpeed = 600;
        obstacleInterval = 1500;
        powerUpPresent = false;
        gsap.globalTimeline.resume();
        scoreDisplay.innerHTML = 'Score: 0';
        playSound(sounds.gameStart);

        gameArea.removeEventListener('click', handleGameRestart);
        startButton.textContent = 'Start';

        document.querySelectorAll('.obstacle, .power-up').forEach(element => element.remove());

        clearInterval(obstacleCreationInterval);
        clearInterval(powerUpCreationInterval);
        obstacleCreationInterval = setInterval(createObstacle, obstacleInterval);
        powerUpCreationInterval = setInterval(createPowerUp, 20000);
    }

    function createObstacle() {
        if (isGameOver) return;

        // List of obstacle GIFs
        const obstacleGifs = [
            'static/assets/shark.gif',
            'static/assets/killerwhale.gif',
        ];

        // Select a random GIF
        const randomGif = obstacleGifs[Math.floor(Math.random() * obstacleGifs.length)];

        let obstacle = document.createElement('img');
        obstacle.src = randomGif;
        obstacle.classList.add('obstacle');
        obstacle.style.position = 'absolute';

        // Randomize the size of the obstacle, but not more than twice the size of the whale
        const whaleWidth = whale.offsetWidth;
        const minWidth = whaleWidth;
        const maxWidth = whaleWidth * 2;
        const randomWidth = Math.random() * (maxWidth - minWidth) + minWidth;

        obstacle.style.width = `${randomWidth}px`;
        obstacle.style.height = 'auto'; // Maintain aspect ratio
        obstacle.style.right = '0px'; // Start from the extreme right end

        let obstaclePosition = Math.random() * (gameArea.clientHeight - 50); // Random position within the game area height
        obstacle.style.top = `${obstaclePosition}px`;

        gameArea.appendChild(obstacle);

        // Determine if this obstacle should move faster
        const isFastObstacle = Math.random() < 0.1; // 10% chance for a fast obstacle
        const obstacleSpeedFactor = isFastObstacle ? 1.5 : 1;

        gsap.to(obstacle, {
            duration: (6000 - gameSpeed * 100) / 1000 / obstacleSpeedFactor, // Adjust duration based on gameSpeed and speed factor
            x: -gameArea.clientWidth, // Move to the left end
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
        let powerUpPosition = Math.random() * (gameArea.clientHeight - 50); // Random position within the game area height
        powerUp.style.top = `${powerUpPosition}px`;
        powerUp.style.right = '0px'; // Start from the extreme right end

        gameArea.appendChild(powerUp);

        gsap.to(powerUp, {
            duration: (6000 - gameSpeed * 100) / 2000, // Power-up moves at twice the speed
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

        // Calculate the overlapping area
        let overlapX = Math.max(0, Math.min(whaleRect.right, obstacleRect.right) - Math.max(whaleRect.left, obstacleRect.left));
        let overlapY = Math.max(0, Math.min(whaleRect.bottom, obstacleRect.bottom) - Math.max(whaleRect.top, obstacleRect.top));
        let overlapArea = overlapX * overlapY;

        // Calculate the whale's area
        let whaleArea = whaleRect.width * whaleRect.height;

        // Calculate the percentage of the whale's area that overlaps with the obstacle
        let overlapPercentage = (overlapArea / whaleArea) * 100;

        // Check if the overlap percentage exceeds the threshold
        let collisionThreshold = 15; // Adjust this threshold as needed
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
        const baseDuration = 10; // base duration for power-ups in seconds
        const durationMultiplier = hasBlastrKey ? 1.5 : 1; // 50% longer if user has Blastr Key
        const powerUpDuration = baseDuration * durationMultiplier;

        let powerUpType = Math.floor(Math.random() * 4); // Randomly select a power-up type (0, 1, 2, or 3)

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
            case 3:
                applyInvertedControls(powerUpDuration);
                break;
        }
        playSound(sounds.upgrade);
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
        gameSpeed *= 2; // Double the speed
        displayPowerUp('Speed Boost', duration);
        setTimeout(() => {
            gameSpeed = originalSpeed; // Reset speed after the duration
        }, duration * 1000);
    }

    function applyInvincibility(duration) {
        let originalCheckCollision = checkCollision;
        checkCollision = () => {}; // Disable collision detection
        displayPowerUp('Invincibility', duration);
        setTimeout(() => {
            checkCollision = originalCheckCollision; // Re-enable collision detection after the duration
        }, duration * 1000);
    }

    function applyScoreMultiplier(duration) {
        let scoreMultiplierActive = true;
        displayPowerUp('Score Multiplier', duration);

        let multiplierInterval = setInterval(() => {
            if (!isGameOver && scoreMultiplierActive) {
                score += 2; // Double the score increment
                scoreDisplay.innerHTML = `Score: ${score}`;
            }
        }, 1000);

        setTimeout(() => {
            clearInterval(multiplierInterval);
            scoreMultiplierActive = false; // Stop the multiplier after the duration
        }, duration * 1000);
    }

    function applyInvertedControls(duration) {
        let originalMoveWhale = moveWhale;
        moveWhale = function(e) {
            if (isGameOver) return;

            let whaleTop = parseInt(window.getComputedStyle(whale).getPropertyValue("top"));
            let moveDistance = 20; // Adjust the move distance for finer control
            if (e.code === 'ArrowUp' && whaleTop < (gameArea.clientHeight - whale.clientHeight)) {
                whale.style.top = `${whaleTop + moveDistance}px`;
                playSound(sounds.jump);
            }
            if (e.code === 'ArrowDown' && whaleTop > 0) {
                whale.style.top = `${whaleTop - moveDistance}px`;
                playSound(sounds.jump);
            }
        };
        displayPowerUp('Inverted Controls', duration);
        setTimeout(() => {
            moveWhale = originalMoveWhale; // Reset controls after the duration
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
        score++;
        gameSpeed = Math.min(gameSpeed + 0.1, 15); // Increase game speed gradually, max speed of 15
        scoreDisplay.innerHTML = `Score: ${score}`;

        // Play point sound for every 20 points
        if (score % 20 === 0) {
            playSound(sounds.point);
        }

        // Increase difficulty by decreasing obstacle interval and increasing speed
        if (score % 10 === 0) {
            obstacleInterval = Math.max(obstacleInterval - 100, 500); // Minimum interval of 500ms
            clearInterval(obstacleCreationInterval);
            obstacleCreationInterval = setInterval(createObstacle, obstacleInterval);

            // Increase background video speed by 10%
            increaseBackgroundSpeed(1.0);
        }

        // Add new types of obstacles at higher scores
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
                displayLeaderboardPage(result.leaderboard);
            } else {
                console.error('Failed to load leaderboard:', result.message);
            }
        } catch (error) {
            console.error('Error loading leaderboard:', error);
        } finally {
            hideLoadingIndicator();
        }
    }

    function displayLeaderboardPage(leaderboardData) {
        const leaderboardContent = document.getElementById('leaderboardContent');
        leaderboardContent.innerHTML = ''; // Clear previous content

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
            loadLeaderboard();
        }
    }

    function nextPage() {
        if ((currentPage + 1) * rowsPerPage < leaderboardData.length) {
            currentPage++;
            loadLeaderboard();
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

    // Detecting console opening
    const detectDevTools = (function() {
        let devtools = { open: false };
        const threshold = 160;
        const element = new Image();
        Object.defineProperty(element, 'id', {
            get: function() {
                devtools.open = true;
                gameOverAndStop();
                return 'devtools';
            }
        });
        requestAnimationFrame(function check() {
            devtools.open = false;
            console.log(element);
            if (devtools.open) {
                gameOverAndStop();
            }
            requestAnimationFrame(check);
        });
    })();

    // Detecting tab visibility change
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            gameOverAndStop();
        }
    });

    // Detecting specific key combinations
    document.addEventListener('keydown', function(event) {
        if ((event.ctrlKey && event.shiftKey && event.key === 'I') || // Ctrl+Shift+I
            (event.ctrlKey && event.shiftKey && event.key === 'J') || // Ctrl+Shift+J
            (event.ctrlKey && event.key === 'U') || // Ctrl+U
            (event.key === 'F12')) { // F12
            event.preventDefault();
            gameOverAndStop();
        }
    });

    function gameOverAndStop() {
        gameOver();
    }
});
