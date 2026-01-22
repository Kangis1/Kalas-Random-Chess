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

        // Handle email verification from URL
        this.handleVerificationUrl();

        // Setup event listeners
        this.setupEventListeners();
    },

    // Check URL for verification token
    async handleVerificationUrl() {
        const params = new URLSearchParams(window.location.search);
        const verifyToken = params.get('token');

        if (verifyToken && window.location.pathname === '/verify') {
            try {
                const response = await fetch(`/auth/verify?token=${verifyToken}`);
                const data = await response.json();

                if (response.ok) {
                    alert('Email verified successfully! You can now log in.');
                    if (this.currentUser) {
                        this.currentUser.emailVerified = true;
                        this.updateUI();
                    }
                } else {
                    alert(data.error || 'Verification failed');
                }
            } catch (err) {
                console.error('Verification error:', err);
                alert('Verification failed. Please try again.');
            }

            // Clean up URL
            window.history.replaceState({}, document.title, '/');
        }
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

        // Resend verification
        document.getElementById('btn-resend-verify').addEventListener('click', () => this.resendVerification());

        // Close modal on outside click
        document.getElementById('auth-modal').addEventListener('click', (e) => {
            if (e.target.id === 'auth-modal') this.closeModal();
        });
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
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');

        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.currentUser = data.user;
                localStorage.setItem('authToken', data.token);
                this.updateUI();
                this.closeModal();
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
        const email = document.getElementById('signup-email').value;
        const username = document.getElementById('signup-username').value;
        const password = document.getElementById('signup-password').value;
        const confirm = document.getElementById('signup-confirm').value;
        const errorEl = document.getElementById('signup-error');

        if (password !== confirm) {
            errorEl.textContent = 'Passwords do not match';
            errorEl.classList.remove('hidden');
            return;
        }

        try {
            const response = await fetch('/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, username, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.currentUser = data.user;
                localStorage.setItem('authToken', data.token);
                this.updateUI();
                this.closeModal();
                alert('Account created! Check your email to verify your account.');
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

    // Resend verification email
    async resendVerification() {
        if (!this.token) return;

        try {
            const response = await fetch('/auth/resend-verification', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const data = await response.json();
            alert(data.message || data.error);
        } catch (err) {
            console.error('Resend verification error:', err);
            alert('Failed to resend verification email');
        }
    },

    // Update UI based on auth state
    updateUI() {
        const authButtons = document.getElementById('auth-buttons');
        const userInfo = document.getElementById('user-info');
        const verifyBanner = document.getElementById('verify-banner');
        const userDisplayName = document.getElementById('user-display-name');

        if (this.currentUser) {
            authButtons.classList.add('hidden');
            userInfo.classList.remove('hidden');
            userDisplayName.textContent = this.currentUser.username || this.currentUser.email.split('@')[0];

            // Show verification banner if not verified
            if (!this.currentUser.emailVerified) {
                verifyBanner.classList.remove('hidden');
            } else {
                verifyBanner.classList.add('hidden');
            }
        } else {
            authButtons.classList.remove('hidden');
            userInfo.classList.add('hidden');
            verifyBanner.classList.add('hidden');
        }
    },

    // Get current user ID (for game tracking)
    getUserId() {
        return this.currentUser?.id || null;
    },

    // Get auth header for API calls
    getAuthHeader() {
        return this.token ? { 'Authorization': `Bearer ${this.token}` } : {};
    }
};

// Initialize auth when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Auth.init();
});
