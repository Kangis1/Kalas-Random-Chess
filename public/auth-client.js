// Auth Client - Handles user authentication on frontend

const Auth = {
    currentUser: null,
    token: null,

    // Initialize auth state from localStorage
    async init() {
        this.token = localStorage.getItem('authToken');
        if (this.token) {
            try {
                const response = await fetch('/auth/me', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    this.currentUser = data.user;
                    this.updateUI();
                } else {
                    this.logout();
                }
            } catch (err) {
                console.error('Auth check failed:', err);
                this.logout();
            }
        }

        // Setup event listeners
        this.setupEventListeners();
    },

    // Setup all event listeners
    setupEventListeners() {
        // Auth modal tabs
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Close modal
        document.getElementById('auth-close').addEventListener('click', () => this.closeModal());

        // Login button
        document.getElementById('btn-login').addEventListener('click', () => this.openModal('login'));

        // Signup button
        document.getElementById('btn-signup').addEventListener('click', () => this.openModal('signup'));

        // Logout button
        document.getElementById('btn-logout').addEventListener('click', () => this.logout());

        // Login form
        document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));

        // Signup form
        document.getElementById('signup-form').addEventListener('submit', (e) => this.handleSignup(e));

        // Close modal on outside click
        document.getElementById('auth-modal').addEventListener('click', (e) => {
            if (e.target.id === 'auth-modal') this.closeModal();
        });

        // Profile dropdown toggle
        const userInfoTrigger = document.getElementById('user-info-trigger');
        const profileDropdown = document.getElementById('profile-dropdown');
        if (userInfoTrigger && profileDropdown) {
            userInfoTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                profileDropdown.classList.toggle('hidden');
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', () => {
                profileDropdown.classList.add('hidden');
            });
        }

        // View history button
        const btnViewHistory = document.getElementById('btn-view-history');
        if (btnViewHistory) {
            btnViewHistory.addEventListener('click', () => {
                profileDropdown.classList.add('hidden');
                this.openProfileModal();
            });
        }

        // Close profile modal
        const profileClose = document.getElementById('profile-close');
        const profileModal = document.getElementById('profile-modal');
        if (profileClose && profileModal) {
            profileClose.addEventListener('click', () => this.closeProfileModal());
            profileModal.addEventListener('click', (e) => {
                if (e.target.id === 'profile-modal') this.closeProfileModal();
            });
        }
    },

    // Switch between login/signup tabs
    switchTab(tab) {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.auth-tab[data-tab="${tab}"]`).classList.add('active');

        document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
        document.getElementById('signup-form').classList.toggle('hidden', tab !== 'signup');

        // Clear errors
        document.getElementById('login-error').classList.add('hidden');
        document.getElementById('signup-error').classList.add('hidden');
    },

    // Open auth modal
    openModal(tab = 'login') {
        document.getElementById('auth-modal').classList.remove('hidden');
        this.switchTab(tab);
    },

    // Close auth modal
    closeModal() {
        document.getElementById('auth-modal').classList.add('hidden');
        document.getElementById('login-form').reset();
        document.getElementById('signup-form').reset();
        document.getElementById('login-error').classList.add('hidden');
        document.getElementById('signup-error').classList.add('hidden');
    },

    // Handle login form submit
    async handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');

        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.currentUser = data.user;
                localStorage.setItem('authToken', data.token);
                this.updateUI();
                this.closeModal();
                // Register with socket server
                if (typeof registerPlayerWithServer === 'function') {
                    registerPlayerWithServer();
                }
            } else {
                errorEl.textContent = data.error || 'Login failed';
                errorEl.classList.remove('hidden');
            }
        } catch (err) {
            console.error('Login error:', err);
            errorEl.textContent = 'Connection error. Please try again.';
            errorEl.classList.remove('hidden');
        }
    },

    // Handle signup form submit
    async handleSignup(e) {
        e.preventDefault();
        const username = document.getElementById('signup-username').value.trim();
        const password = document.getElementById('signup-password').value;
        const confirm = document.getElementById('signup-confirm').value;
        const errorEl = document.getElementById('signup-error');

        if (!username || username.length < 3) {
            errorEl.textContent = 'Username is required (minimum 3 characters)';
            errorEl.classList.remove('hidden');
            return;
        }

        if (password !== confirm) {
            errorEl.textContent = 'Passwords do not match';
            errorEl.classList.remove('hidden');
            return;
        }

        try {
            const response = await fetch('/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.currentUser = data.user;
                localStorage.setItem('authToken', data.token);
                this.updateUI();
                this.closeModal();
                // Register with socket server
                if (typeof registerPlayerWithServer === 'function') {
                    registerPlayerWithServer();
                }
            } else {
                errorEl.textContent = data.error || 'Signup failed';
                errorEl.classList.remove('hidden');
            }
        } catch (err) {
            console.error('Signup error:', err);
            errorEl.textContent = 'Connection error. Please try again.';
            errorEl.classList.remove('hidden');
        }
    },

    // Logout user
    logout() {
        this.token = null;
        this.currentUser = null;
        localStorage.removeItem('authToken');
        this.updateUI();
    },

    // Update UI based on auth state
    updateUI() {
        const authButtons = document.getElementById('auth-buttons');
        const userInfo = document.getElementById('user-info');
        const userDisplayName = document.getElementById('user-display-name');
        const userEloDisplay = document.getElementById('user-elo-display');

        if (this.currentUser) {
            authButtons.classList.add('hidden');
            userInfo.classList.remove('hidden');
            userDisplayName.textContent = this.currentUser.username;
            if (userEloDisplay) {
                userEloDisplay.textContent = `(${this.currentUser.elo || 1500})`;
            }
        } else {
            authButtons.classList.remove('hidden');
            userInfo.classList.add('hidden');
        }
    },

    // Update ELO (called when receiving eloUpdate from server)
    updateElo(newElo) {
        if (this.currentUser) {
            this.currentUser.elo = newElo;
            this.updateUI();
        }
    },

    // Get current user's ELO
    getElo() {
        return this.currentUser?.elo || 1500;
    },

    // Get current user ID (for game tracking)
    getUserId() {
        return this.currentUser?.id || null;
    },

    // Get auth header for API calls
    getAuthHeader() {
        return this.token ? { 'Authorization': `Bearer ${this.token}` } : {};
    },

    // Check if user is logged in
    isLoggedIn() {
        return this.currentUser !== null;
    },

    // Require login - returns true if logged in, otherwise opens modal
    requireLogin() {
        if (this.isLoggedIn()) {
            return true;
        }
        this.openModal('login');
        return false;
    },

    // Open profile modal and load stats
    async openProfileModal() {
        const modal = document.getElementById('profile-modal');
        if (!modal) return;

        modal.classList.remove('hidden');
        document.getElementById('profile-username').textContent = this.currentUser?.username || 'Player Stats';

        // Show loading state
        document.getElementById('stat-wins').textContent = '-';
        document.getElementById('stat-losses').textContent = '-';
        document.getElementById('stat-draws').textContent = '-';

        try {
            const response = await fetch('/auth/stats', {
                headers: this.getAuthHeader()
            });

            if (response.ok) {
                const data = await response.json();
                this.displayStats(data);
            } else {
                console.error('Failed to fetch stats');
            }
        } catch (err) {
            console.error('Error fetching stats:', err);
        }
    },

    // Close profile modal
    closeProfileModal() {
        const modal = document.getElementById('profile-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },

    // Display stats in the profile modal
    displayStats(data) {
        const { stats, eloHistory } = data;
        const noGamesMessage = document.getElementById('no-games-message');
        const wldSection = document.querySelector('.wld-section');
        const graphSection = document.querySelector('.elo-graph-section');

        // Update W/L/D counts
        document.getElementById('stat-wins').textContent = stats.wins;
        document.getElementById('stat-losses').textContent = stats.losses;
        document.getElementById('stat-draws').textContent = stats.draws;

        if (stats.totalGames === 0) {
            // No games played
            noGamesMessage.classList.remove('hidden');
            wldSection.style.display = 'none';
            graphSection.style.display = 'none';
            return;
        }

        noGamesMessage.classList.add('hidden');
        wldSection.style.display = 'block';
        graphSection.style.display = 'block';

        // Update W/L/D bar
        const total = stats.totalGames;
        const winPct = (stats.wins / total) * 100;
        const drawPct = (stats.draws / total) * 100;
        const lossPct = (stats.losses / total) * 100;

        document.getElementById('wld-bar-wins').style.width = `${winPct}%`;
        document.getElementById('wld-bar-draws').style.width = `${drawPct}%`;
        document.getElementById('wld-bar-losses').style.width = `${lossPct}%`;

        // Update game count label
        document.getElementById('graph-label-games').textContent = `Game ${eloHistory.length}`;

        // Draw ELO graph
        this.drawEloGraph(eloHistory);
    },

    // Draw ELO history graph on canvas
    drawEloGraph(eloHistory) {
        const canvas = document.getElementById('elo-graph');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const container = canvas.parentElement;

        // Set canvas size based on container
        canvas.width = container.clientWidth - 30;
        canvas.height = container.clientHeight - 30;

        const width = canvas.width;
        const height = canvas.height;
        const padding = { top: 20, right: 20, bottom: 30, left: 50 };
        const graphWidth = width - padding.left - padding.right;
        const graphHeight = height - padding.top - padding.bottom;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        if (eloHistory.length === 0) {
            ctx.fillStyle = '#888';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No games played yet', width / 2, height / 2);
            return;
        }

        // Get ELO values including the starting point
        const eloValues = [1500]; // Start at 1500
        eloHistory.forEach(game => {
            eloValues.push(game.eloAfter);
        });

        // Calculate min/max for Y axis
        const minElo = Math.min(...eloValues);
        const maxElo = Math.max(...eloValues);
        const eloRange = maxElo - minElo;
        const yPadding = Math.max(50, eloRange * 0.1);
        const yMin = Math.floor((minElo - yPadding) / 50) * 50;
        const yMax = Math.ceil((maxElo + yPadding) / 50) * 50;

        // Draw grid lines and Y axis labels
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillStyle = '#888';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'right';

        const ySteps = 5;
        for (let i = 0; i <= ySteps; i++) {
            const y = padding.top + (graphHeight * i / ySteps);
            const eloValue = yMax - ((yMax - yMin) * i / ySteps);

            // Grid line
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();

            // Label
            ctx.fillText(Math.round(eloValue).toString(), padding.left - 8, y + 4);
        }

        // Draw the ELO line
        ctx.strokeStyle = '#5dade2';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        eloValues.forEach((elo, index) => {
            const x = padding.left + (graphWidth * index / (eloValues.length - 1 || 1));
            const y = padding.top + graphHeight - (graphHeight * (elo - yMin) / (yMax - yMin));

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();

        // Draw points
        ctx.fillStyle = '#fff';
        eloValues.forEach((elo, index) => {
            const x = padding.left + (graphWidth * index / (eloValues.length - 1 || 1));
            const y = padding.top + graphHeight - (graphHeight * (elo - yMin) / (yMax - yMin));

            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();

            // Draw point border
            ctx.strokeStyle = '#5dade2';
            ctx.lineWidth = 2;
            ctx.stroke();
        });

        // Draw X axis labels (game numbers)
        ctx.fillStyle = '#888';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';

        // Only show a few labels if there are many games
        const maxLabels = 10;
        const labelStep = Math.ceil(eloValues.length / maxLabels);

        for (let i = 0; i < eloValues.length; i += labelStep) {
            const x = padding.left + (graphWidth * i / (eloValues.length - 1 || 1));
            const label = i === 0 ? 'Start' : i.toString();
            ctx.fillText(label, x, height - padding.bottom + 18);
        }
    }
};

// Initialize auth when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Auth.init();
});
