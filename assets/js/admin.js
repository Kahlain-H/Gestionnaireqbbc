'use strict';

(() => {
    const selectors = {
        statsTotal: '[data-total-members]',
        statsActive: '[data-active-members]',
        statsInactive: '[data-inactive-members]',
        statsPaid: '[data-paid-members]',
        statsPartial: '[data-partial-members]',
        statsUnpaidAmount: '[data-total-unpaid]',
        statsPaidAmount: '[data-total-received]',
        adminUsersTable: '[data-admin-users-body]',
        adminUserModal: '[data-modal="admin-user"]',
        adminUserForm: '[data-form="admin-user"]',
        adminUserFeedback: '[data-admin-user-feedback]',
        adminUserOpen: '[data-action="open-admin-user"]',
        adminUserCancel: '[data-action="cancel-admin-user"]',
        adminAssignForm: '[data-form="assign-admin"]',
        adminAssignSelect: '[data-admin-assign-member]',
        adminAssignUsername: '[data-admin-assign-username]',
        adminAssignPassword: '[data-admin-assign-password]',
        adminAssignRole: '[data-admin-assign-role]',
        adminRevokeForm: '[data-form="revoke-admin"]',
        adminRevokeSelect: '[data-admin-revoke-member]',
        adminAccessFeedback: '[data-admin-access-feedback]',
        logout: '[data-action="logout"]',
        backUser: '[data-action="back-user"]',
    };

    const dataFiles = {
        members: 'users.json',
        adminUsers: 'adminUsers.json',
    };

    const storageKey = 'qbbcMembers';
    const adminStorageKey = 'qbbcAdminUsers';

    const state = {
        members: [],
        adminUsers: [],
        editingAdminId: null,
    };

    const normaliseBasePath = (base) => {
        if (!base) {
            return './';
        }
        return base.endsWith('/') ? base : `${base}/`;
    };

    const getBasePath = () => normaliseBasePath(document.body?.dataset.basePath);

    const getDataUrl = (fileName) => `${getBasePath()}data/${fileName}`;

    const redirectToLogin = () => {
        window.location.href = `${getBasePath()}index.html`;
    };

    const getStoredMembers = () => {
        try {
            const raw = localStorage.getItem(storageKey);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            console.error('Read storage error:', error);
            return null;
        }
    };

    const persistMembers = () => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(state.members));
            window.dispatchEvent(new CustomEvent('qbbc-members-updated'));
        } catch (error) {
            console.error('Persist members error:', error);
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

    const generateId = () => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return `admin_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    };

    const normaliseAdminUser = (adminUser) => {
        const nowIso = new Date().toISOString();
        return {
            id: adminUser.id || generateId(),
            username: (adminUser.username || '').trim(),
            password: adminUser.password || '',
            displayName: adminUser.displayName || adminUser.username || 'Compte administrateur',
            role: (adminUser.role || 'admin').toLowerCase(),
            status: (adminUser.status || 'active').toLowerCase(),
            linkedMemberId: adminUser.linkedMemberId || null,
            linkedMemberName: adminUser.linkedMemberName || '',
            createdAt: adminUser.createdAt || nowIso,
            updatedAt: adminUser.updatedAt || adminUser.createdAt || nowIso,
        };
    };

    const loadAdminUsers = async () => {
        const stored = getStoredAdminUsers();
        if (stored && Array.isArray(stored) && stored.length) {
            state.adminUsers = stored.map(normaliseAdminUser);
            return;
        }

        try {
            const response = await fetch(getDataUrl(dataFiles.adminUsers), { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Fetch status ${response.status}`);
            }
            const data = await response.json();
            state.adminUsers = Array.isArray(data) ? data.map(normaliseAdminUser) : [];
            persistAdminUsers();
        } catch (error) {
            console.error('Load admin users error:', error);
            state.adminUsers = stored ? stored.map(normaliseAdminUser) : [];
        }
    };

    const normaliseAmount = (value) => {
        const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value || '').replace(',', '.'));
        return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : 0;
    };

    const formatDateTime = (value) => {
        if (!value) {
            return '--';
        }
        try {
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) {
                return value;
            }
            return date.toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            });
        } catch (error) {
            console.error('Format date error:', error);
            return value;
        }
    };

    const getMemberDisplayName = (member) => `${member.firstName || ''} ${member.lastName || ''}`.trim() || member.username || member.email || 'Profil membre';

    const getAvailableMembersForAdmin = () => {
        const existingIds = new Set(state.adminUsers.map((admin) => admin.linkedMemberId).filter(Boolean));
        return state.members.filter((member) => member.id && !existingIds.has(member.id));
    };

    const renderAdminUsers = () => {
        const tableBody = document.querySelector(selectors.adminUsersTable);
        if (!tableBody) {
            return;
        }

        tableBody.innerHTML = '';

        if (!state.adminUsers.length) {
            const emptyRow = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 5;
            cell.textContent = 'Aucun compte administrateur enregistre.';
            emptyRow.appendChild(cell);
            tableBody.appendChild(emptyRow);
            return;
        }

        state.adminUsers.forEach((adminUser) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <strong>${adminUser.displayName || adminUser.username}</strong>
                    ${adminUser.linkedMemberName ? `<div class="table-meta">${adminUser.linkedMemberName}</div>` : ''}
                </td>
                <td>${adminUser.username}</td>
                <td class="table-role">${adminUser.role}</td>
                <td>${formatDateTime(adminUser.createdAt)}</td>
                <td>
                    <div class="admin-actions">
                        <button type="button" class="btn-tertiary btn-small" data-action="edit-admin" data-admin-id="${adminUser.id}">Modifier</button>
                        <button type="button" class="btn-tertiary btn-small" data-action="delete-admin" data-admin-id="${adminUser.id}">Supprimer</button>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });
    };

    const populateAssignSelect = () => {
        const select = document.querySelector(selectors.adminAssignSelect);
        if (!select) {
            return;
        }

        const previouslySelected = select.value;
    select.innerHTML = '<option value="">Selectionner un membre</option>';
        getAvailableMembersForAdmin()
            .sort((a, b) => getMemberDisplayName(a).localeCompare(getMemberDisplayName(b), 'fr'))
            .forEach((member) => {
                const option = document.createElement('option');
                option.value = member.id;
                option.textContent = `${getMemberDisplayName(member)} (${member.membershipNumber || 'sans numero'})`;
                option.dataset.username = member.username || '';
                option.dataset.password = member.password || '';
                select.appendChild(option);
            });

        if (previouslySelected) {
            select.value = previouslySelected;
        }
    };

    const populateRevokeSelect = () => {
        const select = document.querySelector(selectors.adminRevokeSelect);
        if (!select) {
            return;
        }

        const previous = select.value;
        select.innerHTML = '<option value="">Choisir un compte admin</option>';
        state.adminUsers
            .slice()
            .sort((a, b) => (a.displayName || a.username || '').localeCompare(b.displayName || b.username || '', 'fr'))
            .forEach((adminUser) => {
                const option = document.createElement('option');
                option.value = adminUser.id;
                const label = adminUser.displayName || adminUser.username;
                const role = adminUser.role ? ` - ${adminUser.role}` : '';
                option.textContent = `${label}${role}`;
                select.appendChild(option);
            });

        if (previous) {
            select.value = previous;
        }
    };

    const setAccessFeedback = (message, isError = false) => {
        const feedback = document.querySelector(selectors.adminAccessFeedback);
        if (!feedback) {
            return;
        }
        feedback.hidden = !message;
        feedback.textContent = message || '';
        feedback.classList.toggle('error', Boolean(isError));
    };

    const refreshAdminUI = () => {
        renderAdminUsers();
        populateAssignSelect();
        populateRevokeSelect();
    };

    const setAdminFormFeedback = (message, isError = false) => {
        const feedback = document.querySelector(selectors.adminUserFeedback);
        if (!feedback) {
            return;
        }
        feedback.hidden = !message;
        feedback.textContent = message || '';
        feedback.classList.toggle('error', Boolean(isError));
    };

    const resetAdminForm = () => {
        const form = document.querySelector(selectors.adminUserForm);
        if (form) {
            form.reset();
            const passwordField = form.querySelector('[name="password"]');
            if (passwordField) {
                passwordField.placeholder = '';
            }
        }
        state.editingAdminId = null;
    };

    const populateAdminForm = (adminUser) => {
        const form = document.querySelector(selectors.adminUserForm);
        if (!form || !adminUser) {
            return;
        }

        const displayField = form.querySelector('[name="displayName"]');
        const usernameField = form.querySelector('[name="username"]');
        const passwordField = form.querySelector('[name="password"]');
        const roleField = form.querySelector('[name="role"]');
        const statusField = form.querySelector('[name="status"]');

        if (displayField) {
            displayField.value = adminUser.displayName || '';
        }
        if (usernameField) {
            usernameField.value = adminUser.username || '';
        }
        if (passwordField) {
            passwordField.value = '';
            passwordField.placeholder = 'Laisser vide pour conserver';
        }
        if (roleField) {
            roleField.value = adminUser.role || 'admin';
        }
        if (statusField) {
            statusField.value = adminUser.status || 'active';
        }
    };

    const toggleAdminModal = (visible) => {
        const modal = document.querySelector(selectors.adminUserModal);
        if (!modal) {
            return;
        }
        modal.hidden = !visible;
        if (!visible) {
            resetAdminForm();
            setAdminFormFeedback('', false);
        } else {
            setAdminFormFeedback('', false);
        }
    };

    const openAdminUserModal = (adminUser) => {
        if (adminUser) {
            state.editingAdminId = adminUser.id;
            populateAdminForm(adminUser);
        } else {
            resetAdminForm();
            const form = document.querySelector(selectors.adminUserForm);
            const passwordField = form?.querySelector('[name="password"]');
            if (passwordField) {
                passwordField.placeholder = 'Mot de passe';
            }
        }
        toggleAdminModal(true);
    };

    const collectAdminFormData = () => {
        const form = document.querySelector(selectors.adminUserForm);
        if (!form) {
            return null;
        }
        const formData = new FormData(form);
        return {
            displayName: (formData.get('displayName') || '').trim(),
            username: (formData.get('username') || '').trim(),
            password: (formData.get('password') || '').trim(),
            role: (formData.get('role') || 'admin').trim().toLowerCase(),
            status: (formData.get('status') || 'active').trim().toLowerCase(),
        };
    };

    const upsertAdminUser = (payload) => {
        const nowIso = new Date().toISOString();
        if (state.editingAdminId) {
            const index = state.adminUsers.findIndex((adminUser) => adminUser.id === state.editingAdminId);
            if (index !== -1) {
                const original = state.adminUsers[index];
                state.adminUsers[index] = {
                    ...original,
                    displayName: payload.displayName || original.displayName,
                    username: payload.username,
                    password: payload.password || original.password,
                    role: payload.role,
                    status: payload.status,
                    updatedAt: nowIso,
                };
                return state.adminUsers[index];
            }
        }

        const newAdmin = normaliseAdminUser({
            username: payload.username,
            password: payload.password,
            displayName: payload.displayName,
            role: payload.role,
            status: payload.status,
        });
        newAdmin.createdAt = nowIso;
        newAdmin.updatedAt = nowIso;
        state.adminUsers.push(newAdmin);
        return newAdmin;
    };

    const removeAdminUser = (adminId) => {
        const index = state.adminUsers.findIndex((adminUser) => adminUser.id === adminId);
        if (index === -1) {
            return null;
        }
        const [removed] = state.adminUsers.splice(index, 1);
        return removed;
    };

    const promoteMemberRecord = (memberId, role) => {
        const memberIndex = state.members.findIndex((member) => member.id === memberId);
        if (memberIndex === -1) {
            return;
        }
        const nowIso = new Date().toISOString();
        state.members[memberIndex] = {
            ...state.members[memberIndex],
            role,
            updatedAt: nowIso,
        };
        persistMembers();
    };

    const demoteMemberRecord = (memberId) => {
        if (!memberId) {
            return;
        }
        const memberIndex = state.members.findIndex((member) => member.id === memberId);
        if (memberIndex === -1) {
            return;
        }
        const nowIso = new Date().toISOString();
        const currentRole = (state.members[memberIndex].role || '').toLowerCase();
        const fallbackRole = ['admin', 'manager', 'support'].includes(currentRole)
            ? 'utilisateur'
            : state.members[memberIndex].role || 'utilisateur';
        state.members[memberIndex] = {
            ...state.members[memberIndex],
            role: fallbackRole,
            updatedAt: nowIso,
        };
        persistMembers();
    };

    const handleAssignMemberChange = () => {
        const memberSelect = document.querySelector(selectors.adminAssignSelect);
        const usernameInput = document.querySelector(selectors.adminAssignUsername);
        if (!memberSelect || !usernameInput) {
            return;
        }

        const selectedOption = memberSelect.options[memberSelect.selectedIndex];
        if (!selectedOption) {
            return;
        }

        const memberId = memberSelect.value;
        const presetUsername = (selectedOption.dataset.username || '').trim();
        const member = state.members.find((entry) => entry.id === memberId);

        const derivedUsername = presetUsername
            || (member?.username || '').trim()
            || (member?.email || '').trim()
            || (member?.membershipNumber || '').trim();

        if (derivedUsername) {
            usernameInput.value = derivedUsername;
        }
    };

    const handleAdminFormSubmit = (event) => {
        event.preventDefault();
        const payload = collectAdminFormData();
        if (!payload) {
            return;
        }

        setAdminFormFeedback('', false);

        if (!payload.username) {
            setAdminFormFeedback('Identifiant requis.', true);
            return;
        }

        if (!state.editingAdminId && !payload.password) {
            setAdminFormFeedback('Mot de passe requis pour un nouveau compte.', true);
            return;
        }

        payload.displayName = payload.displayName || payload.username;

        const duplicate = state.adminUsers.some((adminUser) => adminUser.username.toLowerCase() === payload.username.toLowerCase()
            && adminUser.id !== state.editingAdminId);
        if (duplicate) {
            setAdminFormFeedback('Identifiant deja utilise. Merci de choisir une autre valeur.', true);
            return;
        }

        const isEdit = Boolean(state.editingAdminId);
        const updatedAdmin = upsertAdminUser(payload);
        persistAdminUsers();
        if (updatedAdmin?.linkedMemberId) {
            promoteMemberRecord(updatedAdmin.linkedMemberId, updatedAdmin.role);
        }
        refreshAdminUI();
        toggleAdminModal(false);
        setAccessFeedback(isEdit ? 'Compte administrateur mis a jour.' : 'Compte administrateur cree.', false);
        state.editingAdminId = null;
    };

    const handleAssignSubmit = (event) => {
        event.preventDefault();
        const memberSelect = document.querySelector(selectors.adminAssignSelect);
        const usernameInput = document.querySelector(selectors.adminAssignUsername);
        const passwordInput = document.querySelector(selectors.adminAssignPassword);
        const roleSelect = document.querySelector(selectors.adminAssignRole);

        const memberId = memberSelect?.value || '';
        const username = (usernameInput?.value || '').trim();
        const password = (passwordInput?.value || '').trim();
        const role = (roleSelect?.value || 'admin').trim().toLowerCase();

        setAccessFeedback('', false);

        if (!memberId) {
            setAccessFeedback('Merci de selectionner un membre a promouvoir.', true);
            return;
        }

        if (!username) {
            setAccessFeedback('Merci de definir un identifiant de connexion.', true);
            return;
        }

        if (!password) {
            setAccessFeedback('Merci de definir un mot de passe.', true);
            return;
        }

        const duplicate = state.adminUsers.some((adminUser) => adminUser.username.toLowerCase() === username.toLowerCase());
        if (duplicate) {
            setAccessFeedback('Identifiant deja attribue a un autre compte administrateur.', true);
            return;
        }

        const member = state.members.find((entry) => entry.id === memberId);
        if (!member) {
            setAccessFeedback('Membre introuvable. Merci de rafraichir la page.', true);
            return;
        }

        const nowIso = new Date().toISOString();
        const linkedAdmin = normaliseAdminUser({
            username,
            password,
            displayName: getMemberDisplayName(member),
            role,
            status: 'active',
            linkedMemberId: member.id,
            linkedMemberName: getMemberDisplayName(member),
            createdAt: nowIso,
            updatedAt: nowIso,
        });
        linkedAdmin.createdAt = nowIso;
        linkedAdmin.updatedAt = nowIso;

        state.adminUsers.push(linkedAdmin);
        persistAdminUsers();
        promoteMemberRecord(member.id, role);
        refreshAdminUI();

        if (memberSelect) {
            memberSelect.value = '';
        }
        if (usernameInput) {
            usernameInput.value = '';
        }
        if (passwordInput) {
            passwordInput.value = '';
        }
        if (roleSelect) {
            roleSelect.value = 'admin';
        }

        setAccessFeedback('Acces administrateur attribue avec succes.', false);
    };

    const handleRevokeSubmit = (event) => {
        event.preventDefault();
        const revokeSelect = document.querySelector(selectors.adminRevokeSelect);
        const adminId = revokeSelect?.value || '';

        setAccessFeedback('', false);

        if (!adminId) {
            setAccessFeedback('Merci de choisir un compte a revoquer.', true);
            return;
        }

        const removed = removeAdminUser(adminId);
        if (!removed) {
            setAccessFeedback('Compte administrateur introuvable.', true);
            return;
        }

        persistAdminUsers();
        demoteMemberRecord(removed.linkedMemberId);
        refreshAdminUI();

        if (revokeSelect) {
            revokeSelect.value = '';
        }

        if (state.editingAdminId === adminId) {
            state.editingAdminId = null;
            toggleAdminModal(false);
        }

        setAccessFeedback('Acces administrateur revoque.', false);
    };

    const handleAdminTableClick = (event) => {
        const targetButton = event.target.closest('button[data-action]');
        if (!targetButton) {
            return;
        }

        const adminId = targetButton.dataset.adminId;
        const action = targetButton.dataset.action;
        if (!adminId || !action) {
            return;
        }

        if (action === 'edit-admin') {
            const adminUser = state.adminUsers.find((entry) => entry.id === adminId);
            if (adminUser) {
                openAdminUserModal(adminUser);
            }
            return;
        }

        if (action === 'delete-admin') {
            const confirmation = window.confirm('Confirmer la suppression de ce compte administrateur ?');
            if (!confirmation) {
                return;
            }

            const removed = removeAdminUser(adminId);
            if (!removed) {
                setAccessFeedback('Compte administrateur introuvable.', true);
                return;
            }

            persistAdminUsers();
            demoteMemberRecord(removed.linkedMemberId);
            refreshAdminUI();
            setAccessFeedback('Compte administrateur supprime.', false);
            if (state.editingAdminId === adminId) {
                toggleAdminModal(false);
                state.editingAdminId = null;
            }
        }
    };

    const loadMembers = async () => {
        const stored = getStoredMembers();
        if (stored && Array.isArray(stored) && stored.length) {
            state.members = stored;
            return;
        }

        try {
            const response = await fetch(getDataUrl(dataFiles.members), { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Fetch status ${response.status}`);
            }
            const data = await response.json();
            state.members = Array.isArray(data) ? data : [];
            persistMembers();
        } catch (error) {
            console.error('Load members error:', error);
            state.members = stored || [];
        }
    };

    const computeStats = () => {
        const summary = {
            total: state.members.length,
            active: 0,
            inactive: 0,
            paid: 0,
            partial: 0,
            unpaidAmount: 0,
            receivedAmount: 0,
        };

        state.members.forEach((member) => {
            const status = (member.status || '').toLowerCase();
            if (status === 'active') {
                summary.active += 1;
            } else if (status === 'inactive') {
                summary.inactive += 1;
            }

            const due = normaliseAmount(member.totalDue != null ? member.totalDue : member.passSportAmount);
            const paidAmount = normaliseAmount(member.totalPaid);
            const remaining = normaliseAmount(member.remaining != null ? member.remaining : member.remainingBalance);

            summary.receivedAmount += paidAmount;
            if (remaining > 0) {
                summary.unpaidAmount += remaining;
            }

            if (due > 0) {
                if (remaining <= 0) {
                    summary.paid += 1;
                } else if (paidAmount > 0 && remaining < due) {
                    summary.partial += 1;
                } else if (paidAmount > 0 && remaining === due) {
                    summary.partial += 1;
                }
            }
        });

        summary.unpaidAmount = normaliseAmount(summary.unpaidAmount);
        summary.receivedAmount = normaliseAmount(summary.receivedAmount);
        return summary;
    };

    const updateStats = () => {
        const totalEl = document.querySelector(selectors.statsTotal);
        const activeEl = document.querySelector(selectors.statsActive);
        const inactiveEl = document.querySelector(selectors.statsInactive);
        const paidEl = document.querySelector(selectors.statsPaid);
        const partialEl = document.querySelector(selectors.statsPartial);
        const unpaidEl = document.querySelector(selectors.statsUnpaidAmount);
        const receivedEl = document.querySelector(selectors.statsPaidAmount);
        const { total, active, inactive, paid, partial, unpaidAmount, receivedAmount } = computeStats();

        const formatter = new Intl.NumberFormat('fr-FR');
        const amountFormatter = new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 2,
        });

        if (totalEl) {
            totalEl.textContent = formatter.format(total);
        }
        if (activeEl) {
            activeEl.textContent = formatter.format(active);
        }
        if (inactiveEl) {
            inactiveEl.textContent = formatter.format(inactive);
        }
        if (paidEl) {
            paidEl.textContent = formatter.format(paid);
        }
        if (partialEl) {
            partialEl.textContent = formatter.format(partial);
        }
        if (unpaidEl) {
            unpaidEl.textContent = amountFormatter.format(unpaidAmount);
        }
        if (receivedEl) {
            receivedEl.textContent = amountFormatter.format(receivedAmount);
        }
    };

    const bindEvents = () => {
        const logoutBtn = document.querySelector(selectors.logout);
        const backUserBtn = document.querySelector(selectors.backUser);
        const adminOpenBtn = document.querySelector(selectors.adminUserOpen);
        const adminCancelBtn = document.querySelector(selectors.adminUserCancel);
        const adminModal = document.querySelector(selectors.adminUserModal);
        const adminForm = document.querySelector(selectors.adminUserForm);
        const adminTableBody = document.querySelector(selectors.adminUsersTable);
        const assignForm = document.querySelector(selectors.adminAssignForm);
        const revokeForm = document.querySelector(selectors.adminRevokeForm);
        const assignSelect = document.querySelector(selectors.adminAssignSelect);

        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                try {
                    localStorage.removeItem('qbbcSession');
                } catch (error) {
                    console.error('Logout error:', error);
                }
                redirectToLogin();
            });
        }

        if (backUserBtn) {
            backUserBtn.addEventListener('click', () => {
                window.location.href = `${getBasePath()}user.html`;
            });
        }

        if (adminOpenBtn) {
            adminOpenBtn.addEventListener('click', () => openAdminUserModal(null));
        }

        if (adminCancelBtn) {
            adminCancelBtn.addEventListener('click', () => toggleAdminModal(false));
        }

        if (adminModal) {
            adminModal.addEventListener('click', (event) => {
                if (event.target.closest('[data-modal-close]')) {
                    toggleAdminModal(false);
                }
            });
        }

        if (adminForm) {
            adminForm.addEventListener('submit', handleAdminFormSubmit);
        }

        if (adminTableBody) {
            adminTableBody.addEventListener('click', handleAdminTableClick);
        }

        if (assignForm) {
            assignForm.addEventListener('submit', handleAssignSubmit);
        }

        if (assignSelect) {
            assignSelect.addEventListener('change', handleAssignMemberChange);
        }

        if (revokeForm) {
            revokeForm.addEventListener('submit', handleRevokeSubmit);
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                toggleAdminModal(false);
            }
        });

        window.addEventListener('qbbc-members-updated', () => {
            const stored = getStoredMembers();
            if (stored && Array.isArray(stored)) {
                state.members = stored;
                updateStats();
                refreshAdminUI();
            }
        });

        window.addEventListener('storage', (event) => {
            if (event.key === storageKey) {
                const stored = getStoredMembers();
                if (stored && Array.isArray(stored)) {
                    state.members = stored;
                    updateStats();
                    refreshAdminUI();
                }
            }
            if (event.key === adminStorageKey) {
                const storedAdmins = getStoredAdminUsers();
                if (storedAdmins && Array.isArray(storedAdmins)) {
                    state.adminUsers = storedAdmins.map(normaliseAdminUser);
                    refreshAdminUI();
                }
            }
        });

        window.addEventListener('qbbc-admin-users-updated', () => {
            const storedAdmins = getStoredAdminUsers();
            if (storedAdmins && Array.isArray(storedAdmins)) {
                state.adminUsers = storedAdmins.map(normaliseAdminUser);
                refreshAdminUI();
            }
        });
    };

    const ensureSession = () => {
        const sessionRaw = localStorage.getItem('qbbcSession');
        if (!sessionRaw) {
            redirectToLogin();
            return false;
        }
        try {
            const session = JSON.parse(sessionRaw);
            if ((session?.role || '').toLowerCase() !== 'admin') {
                window.location.href = `${getBasePath()}user.html`;
                return false;
            }
        } catch (error) {
            console.error('Session parse error:', error);
            redirectToLogin();
            return false;
        }
        return true;
    };

    const init = async () => {
        if (!ensureSession()) {
            return;
        }

        await Promise.all([loadMembers(), loadAdminUsers()]);
        updateStats();
        refreshAdminUI();
        bindEvents();
    };

    document.addEventListener('DOMContentLoaded', init);
})();
