'use strict';

// Handles authentication interactions on the login page only
(() => {
    const selectors = {
        form: '#login-form',
        username: '#username',
        password: '#password',
        feedback: '.form-feedback',
        togglePassword: '.toggle-password',
        basePath: 'body[data-base-path]',
    };

    const credentials = {
        username: 'admin',
        password: '12345',
    };

    const memberStorageKey = 'qbbcMembers';
    const adminStorageKey = 'qbbcAdminUsers';

    const state = {
        members: [],
        adminUsers: [],
        loaded: false,
        loadedAdmins: false,
    };

    const getBasePath = () => {
        const base = document.body?.dataset.basePath || './';
        return base.endsWith('/') ? base : `${base}/`;
    };

    const getDataUrl = (fileName) => `${getBasePath()}data/${fileName}`;

    const getStoredMembers = () => {
        try {
            const raw = localStorage.getItem(memberStorageKey);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            console.error('Read storage error:', error);
            return null;
        }
    };

    const getStoredAdminUsers = () => {
        try {
            const raw = localStorage.getItem(adminStorageKey);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            console.error('Read admin storage error:', error);
            return null;
        }
    };

    const persistAdminUsers = () => {
        try {
            localStorage.setItem(adminStorageKey, JSON.stringify(state.adminUsers));
            window.dispatchEvent(new CustomEvent('qbbc-admin-users-updated'));
        } catch (error) {
            console.error('Persist admin users error:', error);
        }
    };

    const loadMembers = async () => {
        if (state.loaded && state.members.length) {
            return;
        }

        const stored = getStoredMembers();
        if (stored && Array.isArray(stored) && stored.length) {
            state.members = stored;
            state.loaded = true;
            return;
        }

        try {
            const response = await fetch(getDataUrl('users.json'), { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Fetch status ${response.status}`);
            }
            const data = await response.json();
            state.members = Array.isArray(data) ? data : [];
            localStorage.setItem(memberStorageKey, JSON.stringify(state.members));
            window.dispatchEvent(new CustomEvent('qbbc-members-updated'));
        } catch (error) {
            console.error('Load members error:', error);
            state.members = stored || [];
        } finally {
            state.loaded = true;
        }
    };

    const loadAdminUsers = async () => {
        if (state.loadedAdmins && state.adminUsers.length) {
            return;
        }

        const stored = getStoredAdminUsers();
        if (stored && Array.isArray(stored) && stored.length) {
            state.adminUsers = stored;
            state.loadedAdmins = true;
            return;
        }

        try {
            const response = await fetch(getDataUrl('adminUsers.json'), { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Fetch status ${response.status}`);
            }
            const data = await response.json();
            state.adminUsers = Array.isArray(data) ? data : [];
            persistAdminUsers();
        } catch (error) {
            console.error('Load admin users error:', error);
            state.adminUsers = stored || [];
        } finally {
            state.loadedAdmins = true;
        }
    };

    const updateMembersFromStorage = () => {
        const stored = getStoredMembers();
        if (stored && Array.isArray(stored)) {
            state.members = stored;
            state.loaded = true;
        }
    };

    const updateAdminUsersFromStorage = () => {
        const stored = getStoredAdminUsers();
        if (stored && Array.isArray(stored)) {
            state.adminUsers = stored;
            state.loadedAdmins = true;
        }
    };

    const form = document.querySelector(selectors.form);
    if (!form) {
        return;
    }

    const usernameInput = document.querySelector(selectors.username);
    const passwordInput = document.querySelector(selectors.password);
    const feedback = document.querySelector(selectors.feedback);
    const togglePasswordBtn = document.querySelector(selectors.togglePassword);

    const setFeedback = (message, isError) => {
        if (!feedback) {
            return;
        }
        feedback.hidden = false;
        feedback.textContent = message;
        feedback.classList.toggle('error', isError);
    };

    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const showing = passwordInput.type === 'text';
            passwordInput.type = showing ? 'password' : 'text';
            togglePasswordBtn.setAttribute('aria-pressed', String(!showing));
        });
    }

    const findAccount = (username, password) => {
        const normalisedUsername = username.trim().toLowerCase();
        const adminUser = state.adminUsers.find((admin) => {
            const adminUsername = (admin.username || '').trim().toLowerCase();
            const adminPassword = admin.password || '';
            return adminUsername && adminPassword && adminUsername === normalisedUsername && adminPassword === password;
        });
        if (adminUser) {
            return { ...adminUser, __source: 'admin' };
        }

        const memberUser = state.members.find((member) => {
            const memberUsername = (member.username || '').trim().toLowerCase();
            const memberPassword = member.password || '';
            return memberUsername && memberPassword && memberUsername === normalisedUsername && memberPassword === password;
        });

        return memberUser ? { ...memberUser, __source: 'member' } : null;
    };

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const username = usernameInput?.value.trim();
        const password = passwordInput?.value || '';

        if (!username || !password) {
            setFeedback('Merci de saisir vos identifiants.', true);
            return;
        }

        await Promise.all([loadMembers(), loadAdminUsers()]);

        const account = findAccount(username, password);
        const fallbackAdmin = username === credentials.username && password === credentials.password;

        if (!account && !fallbackAdmin) {
            setFeedback('Identifiants incorrects. Veuillez r\u00E9essayer.', true);
            return;
        }

        try {
            const session = account
                ? {
                    username: account.username,
                    role: (account.role || (account.__source === 'admin' ? 'admin' : 'utilisateur')).toLowerCase(),
                    memberId: account.__source === 'member' ? (account.id || null) : null,
                    membershipNumber: account.__source === 'member' ? (account.membershipNumber || null) : null,
                    displayName: account.displayName
                        || `${account.firstName || ''} ${account.lastName || ''}`.trim()
                        || account.username,
                    connectedAt: new Date().toISOString(),
                }
                : {
                    username: credentials.username,
                    role: 'admin',
                    memberId: null,
                    membershipNumber: null,
                    displayName: 'Administrateur',
                    connectedAt: new Date().toISOString(),
                };

            localStorage.setItem('qbbcSession', JSON.stringify(session));
        } catch (error) {
            console.error('Session storage error:', error);
        }

        const targetRole = account ? (account.role || (account.__source === 'admin' ? 'admin' : 'utilisateur')).toLowerCase() : 'admin';
        const redirectTarget = targetRole === 'admin' ? 'admin.html' : 'user.html';

        setFeedback('Connexion r\u00E9ussie, redirection...', false);
        window.setTimeout(() => {
            window.location.href = `${getBasePath()}${redirectTarget}`;
        }, 600);
    });

    loadMembers();
    loadAdminUsers();

    window.addEventListener('qbbc-members-updated', updateMembersFromStorage);
    window.addEventListener('qbbc-admin-users-updated', updateAdminUsersFromStorage);

    window.addEventListener('storage', (event) => {
        if (event.key === memberStorageKey) {
            updateMembersFromStorage();
        }
        if (event.key === adminStorageKey) {
            updateAdminUsersFromStorage();
        }
    });
})();
