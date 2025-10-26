'use strict';

(() => {
    const selectors = {
        modal: '[data-modal="create-member"]',
        modalOpen: '[data-modal-open="create-member"]',
        modalClose: '[data-modal-close]',
        modalForm: '[data-form="create-member"]',
        formFeedback: '[data-form-feedback]',
        logout: '[data-action="logout"]',
        goAdmin: '[data-action="go-admin"]',
        adminGates: '[data-role-gate="admin"]',
        paymentAddButton: '[data-action="toggle-payment-form"]',
        paymentForm: '[data-payment-form]',
        paymentCancel: '[data-action="cancel-payment"]',
        paymentList: '[data-payment-list]',
    paymentEmpty: '[data-payment-empty]',
        paymentDate: '[data-payment-date]',
        paymentAmount: '[data-payment-amount]',
        paymentMethod: '[data-payment-method]',
        paymentTotalDue: '[data-payment-total-due]',
        paymentTotalPaid: '[data-payment-total-paid]',
        paymentRemaining: '[data-payment-remaining]',
        paymentCount: '[data-payment-count]',
        paymentPlanGrid: '[data-payment-plan-grid]',
    };

    const storageKey = 'qbbcMembers';
    const dataFiles = {
        members: 'users.json',
    };

    const state = {
        members: [],
        session: null,
    };

    const modalState = {
        payments: [],
        totals: {
            totalDue: 0,
            totalPaid: 0,
            remaining: 0,
        },
        paymentPlan: {
            count: 1,
        },
        lastPaymentMethod: '',
    };

    const currencyFormatter = new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });

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

    const updateFormFeedback = (message = '', isError = false) => {
        const feedback = document.querySelector(selectors.formFeedback);
        if (!feedback) {
            return;
        }
        if (!message) {
            feedback.hidden = true;
            feedback.classList.remove('error');
            feedback.textContent = '';
            return;
        }
        feedback.hidden = false;
        feedback.textContent = message;
        feedback.classList.toggle('error', isError);
    };

    const ensureSession = () => {
        try {
            const raw = localStorage.getItem('qbbcSession');
            if (!raw) {
                redirectToLogin();
                return false;
            }
            const parsed = JSON.parse(raw);
            if (!parsed?.username) {
                redirectToLogin();
                return false;
            }
            state.session = parsed;
            return true;
        } catch (error) {
            console.error('Session parse error:', error);
            redirectToLogin();
            return false;
        }
    };

    const booleanFromValue = (value) => {
        if (typeof value === 'boolean') {
            return value;
        }
        if (value == null) {
            return false;
        }
        const normalised = String(value).toLowerCase();
        return normalised === 'yes' || normalised === 'true' || normalised === '1' || normalised === 'oui';
    };

    const numberFromValue = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const normaliseAmount = (value) => {
        const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(',', '.'));
        if (!Number.isFinite(numeric)) {
            return 0;
        }
        return Math.round(numeric * 100) / 100;
    };

    const formatCurrency = (value) => currencyFormatter.format(normaliseAmount(value));

    const formatPaymentDate = (value) => {
        if (!value) {
            return '';
        }
        if (value.includes('/')) {
            return value;
        }
        const [year, month, day] = value.split('-');
        if (year && month && day) {
            return `${day}/${month}/${year}`;
        }
        return value;
    };

    const todayIso = () => new Date().toISOString().split('T')[0];

    const clonePayments = (payments) => {
        if (!Array.isArray(payments)) {
            return [];
        }
        return payments.map((payment) => ({
            date: formatPaymentDate(payment.date),
            amount: normaliseAmount(payment.amount),
            method: payment.method || '',
        }));
    };

    const computeTotals = (due, payments) => {
        const totalDue = normaliseAmount(due);
        const totalPaid = normaliseAmount(payments.reduce((sum, payment) => sum + normaliseAmount(payment.amount), 0));
        const remaining = normaliseAmount(totalDue - totalPaid);
        return { totalDue, totalPaid, remaining };
    };

    const clampPaymentCount = (value) => {
        const numeric = Number.parseInt(value, 10);
        if (!Number.isFinite(numeric)) {
            return 1;
        }
        return Math.min(Math.max(numeric, 1), 3);
    };

    const getPlanRows = () => {
        const container = document.querySelector(selectors.paymentPlanGrid);
        if (!container) {
            return [];
        }
        return Array.from(container.querySelectorAll('[data-plan-index]'));
    };

    const updatePaymentPlanRows = (count) => {
        const rows = getPlanRows();
        const targetCount = clampPaymentCount(count);
        rows.forEach((row) => {
            const index = Number.parseInt(row.dataset.planIndex || '', 10);
            const shouldShow = Number.isInteger(index) && index <= targetCount;
            if (!shouldShow) {
                row.hidden = true;
                row.querySelectorAll('input').forEach((input) => {
                    input.value = '';
                });
            } else {
                row.hidden = false;
            }
        });
        modalState.paymentPlan.count = targetCount;
    };

    const resetPaymentPlan = () => {
        const countField = document.querySelector(selectors.paymentCount);
        if (countField instanceof HTMLSelectElement) {
            countField.value = '1';
        }
        updatePaymentPlanRows(1);
        modalState.paymentPlan = { count: 1, entries: [] };
    };

    const extractPaymentPlan = (form) => {
        const plan = [];
        const countField = form?.elements?.namedItem('paymentCount');
        const countValue = countField instanceof HTMLSelectElement || countField instanceof HTMLInputElement
            ? countField.value
            : '1';
        const count = clampPaymentCount(countValue);
        for (let index = 1; index <= 3; index += 1) {
            const amountField = form?.elements?.namedItem(`payment${index}Amount`);
            const dateField = form?.elements?.namedItem(`payment${index}Date`);
            const amount = amountField instanceof HTMLInputElement ? normaliseAmount(amountField.value) : 0;
            const dueDate = dateField instanceof HTMLInputElement ? dateField.value : '';
            if (index <= count) {
                plan.push({
                    index,
                    amount,
                    dueDate,
                });
            }
        }
        modalState.paymentPlan = { count, entries: plan };
        return { count, plan };
    };

    const getPaymentMethodLabel = (method) => {
        switch (method) {
            case 'Cash':
                return 'Espèces';
            case 'Check':
                return 'Chèque';
            case 'Card':
                return 'Carte';
            case 'Transfer':
                return 'Virement';
            default:
                return method || 'Autre';
        }
    };

    const generateMembershipNumber = () => {
        const year = new Date().getFullYear();
        const prefix = `QBBC-${year}-`;
        const sequence = state.members
            .map((member) => member.membershipNumber)
            .filter((number) => typeof number === 'string' && number.startsWith(prefix))
            .map((number) => parseInt(number.split('-').pop(), 10))
            .filter((value) => Number.isInteger(value));
        let next = sequence.length ? Math.max(...sequence) + 1 : 1;
        let candidate = `${prefix}${String(next).padStart(3, '0')}`;
        const existing = new Set(state.members.map((member) => member.membershipNumber));

        while (existing.has(candidate)) {
            next += 1;
            candidate = `${prefix}${String(next).padStart(3, '0')}`;
        }

        return candidate;
    };

    const readFileAsDataUrl = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = event.target?.result;
                if (typeof result === 'string') {
                    resolve(result);
                } else {
                    reject(new Error('Impossible de lire le fichier.'));
                }
            };
            reader.onerror = () => {
                reject(new Error('Lecture du fichier impossible.'));
            };
            reader.readAsDataURL(file);
        });
    };

    const buildMemberFromPayload = (payload) => {
        const now = new Date().toISOString();
        const payments = clonePayments(payload.payments);
        const passSportDue = numberFromValue(payload.passSportAmount);
        const totals = computeTotals(passSportDue, payments);
        const planCountRaw = payload.paymentPlanCount ?? payload.paymentCount ?? modalState.paymentPlan?.count ?? 1;
        const scheduleEntries = Array.isArray(payload.paymentPlanEntries)
            ? payload.paymentPlanEntries
            : Array.isArray(modalState.paymentPlan?.entries)
                ? modalState.paymentPlan.entries
                : [];
        const paymentPlanCount = clampPaymentCount(planCountRaw);
        const normalisedSchedule = [];
        for (let index = 1; index <= 3; index += 1) {
            const entry = scheduleEntries.find((item) => Number(item.index) === index) || {};
            const amount = normaliseAmount(entry.amount);
            const dueDate = entry.dueDate || entry.date || '';
            if (index <= paymentPlanCount) {
                normalisedSchedule.push({ index, amount, dueDate });
            }
        }
        const paymentFields = { payment1: '', payment2: '', payment3: '', payment1Amount: 0, payment2Amount: 0, payment3Amount: 0, payment1Date: '', payment2Date: '', payment3Date: '' };
        normalisedSchedule.forEach((entry) => {
            paymentFields[`payment${entry.index}`] = entry.dueDate || '';
            paymentFields[`payment${entry.index}Amount`] = normaliseAmount(entry.amount);
            paymentFields[`payment${entry.index}Date`] = entry.dueDate || '';
        });
        const lastPaymentMethod = payload.lastPaymentMethod || (payments[payments.length - 1]?.method) || payload.paymentMethod || '';
        return {
            id: payload.id || `local-${Date.now()}`,
            membershipNumber: payload.membershipNumber || generateMembershipNumber(),
            status: payload.status || 'active',
            lastName: payload.lastname || '',
            firstName: payload.firstname || '',
            birthdate: payload.birthdate || '',
            gender: payload.gender || '',
            phone: payload.phone || '',
            category: payload.category || 'U7',
            address: payload.address || '',
            email: payload.email || '',
            passSport: booleanFromValue(payload.passSport),
            ticketLoisirCaf: booleanFromValue(payload.ticketLoisirCaf),
            parentLastName: payload.parentLastname || '',
            parentFirstName: payload.parentFirstname || '',
            parentPhone: payload.parentPhone || '',
            imageRights: payload.imageRights || 'Non demande',
            photo: payload.photoData || payload.photo || '',
            photoName: payload.photoName || '',
            cni: booleanFromValue(payload.cni),
            medicalCertificate: booleanFromValue(payload.medicalCertificate),
            insurance: booleanFromValue(payload.insurance),
            injury: payload.injury || '',
            passSportAmount: passSportDue,
            payments,
            paymentCount: paymentPlanCount,
            paymentPlan: normalisedSchedule,
            payment1: paymentFields.payment1,
            payment2: paymentFields.payment2,
            payment3: paymentFields.payment3,
            payment1Amount: paymentFields.payment1Amount,
            payment2Amount: paymentFields.payment2Amount,
            payment3Amount: paymentFields.payment3Amount,
            payment1Date: paymentFields.payment1Date,
            payment2Date: paymentFields.payment2Date,
            payment3Date: paymentFields.payment3Date,
            paymentMethod: lastPaymentMethod,
            totalDue: totals.totalDue,
            totalPaid: totals.totalPaid,
            remaining: totals.remaining,
            remainingBalance: totals.remaining,
            passSportReference: payload.passSportReference || '',
            assuranceReference: payload.assuranceReference || '',
            username: payload.username || '',
            password: payload.password || '',
            role: payload.role || 'membre',
            createdAt: payload.createdAt || now,
            updatedAt: now,
        };
    };

    const resetFormDefaults = (form) => {
        if (!form) {
            return;
        }
        const defaults = {
            status: 'active',
            category: 'U7',
            passSport: 'no',
            ticketLoisirCaf: 'no',
            imageRights: 'Non demande',
            insurance: 'no',
            cni: 'no',
            medicalCertificate: 'no',
        };
        Object.entries(defaults).forEach(([name, value]) => {
            const field = form.elements.namedItem(name);
            if (field) {
                field.value = value;
            }
        });
        resetPaymentPlan();
    };

    const resetPaymentsState = () => {
        modalState.payments = [];
        modalState.totals = { totalDue: 0, totalPaid: 0, remaining: 0 };
        modalState.paymentPlan = { count: 1, entries: [] };
        modalState.lastPaymentMethod = '';
    };

    const renderModalPayments = () => {
        const form = document.querySelector(selectors.modalForm);
        const list = document.querySelector(selectors.paymentList);
        const emptyState = document.querySelector(selectors.paymentEmpty);
        const totalDueEl = document.querySelector(selectors.paymentTotalDue);
        const totalPaidEl = document.querySelector(selectors.paymentTotalPaid);
        const remainingEl = document.querySelector(selectors.paymentRemaining);

        const dueField = form?.elements?.namedItem('passSportAmount');
        const dueAmount = dueField ? numberFromValue(dueField.value) : 0;
        const totals = computeTotals(dueAmount, modalState.payments);
        modalState.totals = totals;

        if (totalDueEl) {
            totalDueEl.textContent = formatCurrency(totals.totalDue);
        }
        if (totalPaidEl) {
            totalPaidEl.textContent = formatCurrency(totals.totalPaid);
        }
        if (remainingEl) {
            remainingEl.textContent = formatCurrency(totals.remaining);
        }

        if (list) {
            list.innerHTML = '';
            modalState.payments.forEach((payment, index) => {
                const item = document.createElement('li');
                item.className = 'payment-history__item';

                const main = document.createElement('div');
                main.className = 'payment-history__item-main';

                const title = document.createElement('p');
                title.className = 'payment-history__item-title';
                title.textContent = formatCurrency(payment.amount);

                const meta = document.createElement('p');
                meta.className = 'payment-history__item-meta';
                const fragments = [payment.date || 'Date inconnue', getPaymentMethodLabel(payment.method)];
                meta.textContent = fragments.join(' • ');

                main.append(title, meta);
                item.append(main);

                const actions = document.createElement('div');
                actions.className = 'payment-history__actions';

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'payment-remove';
                removeBtn.dataset.action = 'remove-payment';
                removeBtn.dataset.paymentIndex = String(index);
                removeBtn.textContent = 'Supprimer';

                actions.append(removeBtn);
                item.append(actions);

                list.append(item);
            });
            list.hidden = modalState.payments.length === 0;
        }

        if (emptyState) {
            emptyState.hidden = modalState.payments.length > 0;
        }
    };

    const closeModalPaymentForm = (hide = true) => {
        const paymentForm = document.querySelector(selectors.paymentForm);
        if (!paymentForm) {
            return;
        }
        if (hide) {
            paymentForm.hidden = true;
        }
        paymentForm.reset();
    };

    const openModalPaymentForm = () => {
        const paymentForm = document.querySelector(selectors.paymentForm);
        if (!paymentForm) {
            return;
        }
        paymentForm.hidden = false;
        const dateInput = paymentForm.querySelector(selectors.paymentDate);
        if (dateInput && !dateInput.value) {
            dateInput.value = todayIso();
        }
        dateInput?.focus();
    };

    const handleModalPaymentToggle = () => {
        const paymentForm = document.querySelector(selectors.paymentForm);
        if (!paymentForm) {
            return;
        }
        if (paymentForm.hidden) {
            openModalPaymentForm();
        } else {
            closeModalPaymentForm();
        }
        updateFormFeedback('');
    };

    const handleModalPaymentSubmit = (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const dateInput = form.querySelector(selectors.paymentDate);
        const amountInput = form.querySelector(selectors.paymentAmount);
        const methodSelect = form.querySelector(selectors.paymentMethod);

        const rawDate = dateInput?.value;
        const rawAmount = amountInput?.value;
        const method = methodSelect?.value || '';

        if (!rawDate || !rawAmount) {
            updateFormFeedback('Merci d\'indiquer la date et le montant du paiement.', true);
            return;
        }

        const amount = normaliseAmount(rawAmount);
        if (amount <= 0) {
            updateFormFeedback('Le montant doit être supérieur à zéro.', true);
            return;
        }

        modalState.payments.push({
            date: formatPaymentDate(rawDate),
            amount,
            method,
        });
        modalState.lastPaymentMethod = method;

        closeModalPaymentForm();
        renderModalPayments();
        updateFormFeedback('');
    };

    const handleModalPaymentCancel = () => {
        closeModalPaymentForm();
        updateFormFeedback('');
    };

    const handleModalPaymentListClick = (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        const trigger = target.closest('[data-action="remove-payment"]');
        if (!trigger) {
            return;
        }
        const index = Number.parseInt(trigger.dataset.paymentIndex || '', 10);
        if (!Number.isInteger(index) || index < 0 || index >= modalState.payments.length) {
            return;
        }
        modalState.payments.splice(index, 1);
        const lastPayment = modalState.payments[modalState.payments.length - 1];
        modalState.lastPaymentMethod = lastPayment?.method || '';
        renderModalPayments();
        updateFormFeedback('');
    };

    const handleModalPassSportChange = () => {
        renderModalPayments();
    };

    const openModal = () => {
        const modal = document.querySelector(selectors.modal);
        const form = document.querySelector(selectors.modalForm);
        if (!modal || !form) {
            return;
        }
        const shouldReset = modal.hidden;
        if (shouldReset) {
            resetPaymentsState();
        }
        const membershipField = form.elements.namedItem('membershipNumber');
        if (membershipField && !membershipField.value) {
            membershipField.value = generateMembershipNumber();
        }
        modal.hidden = false;
        if (shouldReset) {
            closeModalPaymentForm();
            resetPaymentPlan();
        }
        renderModalPayments();
        updateFormFeedback('');
        form.querySelector('input, select, textarea')?.focus();
    };

    const maybeOpenModalFromHash = () => {
        if (window.location.hash === '#add-member') {
            openModal();
        }
    };

    const clearForm = () => {
        const form = document.querySelector(selectors.modalForm);
        if (form) {
            form.reset();
            resetFormDefaults(form);
            const membershipField = form.elements.namedItem('membershipNumber');
            if (membershipField) {
                membershipField.value = '';
            }
        }
        resetPaymentsState();
        closeModalPaymentForm();
        renderModalPayments();
        updateFormFeedback('');
    };

    const closeModal = () => {
        const modal = document.querySelector(selectors.modal);
        if (!modal) {
            return;
        }
        clearForm();
        modal.hidden = true;
        if (window.location.hash === '#add-member') {
            const target = `${window.location.pathname}${window.location.search}`;
            window.history.replaceState(null, '', target);
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

    const handleFormSubmit = async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        updateFormFeedback('');
        const formData = new FormData(form);
        const payload = {};
        formData.forEach((value, key) => {
            if (value instanceof File) {
                payload[key] = value.size ? value : '';
            } else {
                payload[key] = value;
            }
        });

        if (!payload.lastname || !payload.firstname || !payload.birthdate) {
            updateFormFeedback('Merci de compléter les champs obligatoires (nom, prénom, date de naissance).', true);
            return;
        }

        try {
            const fileInput = form.elements.namedItem('photo');
            if (fileInput && fileInput instanceof HTMLInputElement && fileInput.files && fileInput.files[0]) {
                const file = fileInput.files[0];
                if (file.size) {
                    payload.photoData = await readFileAsDataUrl(file);
                    payload.photoName = file.name;
                }
            }
        } catch (error) {
            console.error('Photo read error:', error);
        }

        const { count: paymentPlanCount, plan: paymentPlanEntries } = extractPaymentPlan(form);
        const paymentsClone = clonePayments(modalState.payments);
        const totals = computeTotals(numberFromValue(payload.passSportAmount), paymentsClone);

        const member = buildMemberFromPayload({
            ...payload,
            photo: '',
            payments: paymentsClone,
            totalDue: totals.totalDue,
            totalPaid: totals.totalPaid,
            remaining: totals.remaining,
            paymentPlanCount,
            paymentPlanEntries,
            lastPaymentMethod: modalState.lastPaymentMethod,
        });
        state.members.push(member);
        persistMembers();

        updateFormFeedback('Adhérent enregistré avec succès.');

        window.setTimeout(() => {
            closeModal();
        }, 900);
    };

    const bindEvents = () => {
        const modalTriggers = document.querySelectorAll(selectors.modalOpen);
        const modalCloseElements = document.querySelectorAll(selectors.modalClose);
        const form = document.querySelector(selectors.modalForm);
        const logoutBtn = document.querySelector(selectors.logout);
        const goAdminButtons = document.querySelectorAll(selectors.goAdmin);
        const adminGates = document.querySelectorAll(selectors.adminGates);
        const paymentAddButton = document.querySelector(selectors.paymentAddButton);
        const paymentForm = document.querySelector(selectors.paymentForm);
        const paymentCancel = document.querySelector(selectors.paymentCancel);
        const paymentList = document.querySelector(selectors.paymentList);
        const passSportField = form?.elements?.namedItem('passSportAmount');
        const paymentCountField = form?.elements?.namedItem('paymentCount');

        modalTriggers.forEach((trigger) => {
            trigger.addEventListener('click', openModal);
        });

        modalCloseElements.forEach((element) => {
            element.addEventListener('click', closeModal);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeModal();
            }
        });

        if (form) {
            form.addEventListener('submit', handleFormSubmit);
        }
        if (paymentAddButton) {
            paymentAddButton.addEventListener('click', handleModalPaymentToggle);
        }
        if (paymentForm) {
            paymentForm.addEventListener('submit', handleModalPaymentSubmit);
        }
        if (paymentCancel) {
            paymentCancel.addEventListener('click', handleModalPaymentCancel);
        }
        if (paymentList) {
            paymentList.addEventListener('click', handleModalPaymentListClick);
        }
        if (passSportField instanceof HTMLInputElement) {
            passSportField.addEventListener('input', handleModalPassSportChange);
        }
        if (paymentCountField instanceof HTMLSelectElement || paymentCountField instanceof HTMLInputElement) {
            paymentCountField.addEventListener('change', (event) => {
                updatePaymentPlanRows(event.target.value);
            });
        }

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

        goAdminButtons.forEach((button) => {
            button.addEventListener('click', () => {
                if (state.session?.role === 'admin') {
                    window.location.href = `${getBasePath()}admin.html`;
                }
            });
        });

        adminGates.forEach((element) => {
            element.hidden = state.session?.role !== 'admin';
        });

        window.addEventListener('qbbc-members-updated', () => {
            const stored = getStoredMembers();
            if (stored && Array.isArray(stored)) {
                state.members = stored;
            }
        });

        window.addEventListener('storage', (event) => {
            if (event.key === storageKey) {
                const stored = getStoredMembers();
                if (stored && Array.isArray(stored)) {
                    state.members = stored;
                }
            }
        });

        window.addEventListener('hashchange', maybeOpenModalFromHash);
    };

    const init = async () => {
        if (!ensureSession()) {
            return;
        }

        await loadMembers();
        resetFormDefaults(document.querySelector(selectors.modalForm));
        resetPaymentsState();
        closeModalPaymentForm();
        renderModalPayments();
        updateFormFeedback('');
        bindEvents();
        maybeOpenModalFromHash();
    };

    document.addEventListener('DOMContentLoaded', init);
})();
