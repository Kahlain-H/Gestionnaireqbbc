'use strict';

(() => {
    const selectors = {
        tableBody: '[data-members-body]',
        search: '[data-member-search]',
        filterCategory: '[data-member-filter]',
        filterStatus: '[data-member-status]',
        exportBtn: '[data-export-csv]',
        importBtn: '[data-import-trigger]',
        importInput: '[data-import-input]',
        editModal: '[data-modal="edit-member"]',
        editForm: '[data-form="edit-member"]',
        editFeedback: '[data-edit-feedback]',
        modalClose: '[data-modal-close]',
        logout: '[data-action="logout"]',
        paymentAddButton: '[data-edit-payment-add]',
        paymentForm: '[data-edit-payment-form]',
        paymentCancel: '[data-edit-payment-cancel]',
        paymentList: '[data-edit-payment-list]',
        paymentEmpty: '[data-edit-payment-empty]',
        paymentTotalDue: '[data-edit-payment-total-due]',
        paymentTotalPaid: '[data-edit-payment-total-paid]',
        paymentRemaining: '[data-edit-payment-remaining]',
        paymentDate: '[data-edit-payment-date]',
        paymentAmount: '[data-edit-payment-amount]',
        paymentMethod: '[data-edit-payment-method]',
        paymentCount: '[data-payment-count]',
        paymentPlanGrid: '[data-payment-plan-grid]',
    };

    const storageKey = 'qbbcMembers';
    const dataFiles = {
        members: 'users.json',
    };

    const CSV_HEADERS = [
        'id',
        'membershipNumber',
        'status',
        'lastName',
        'firstName',
        'birthdate',
        'gender',
        'phone',
        'category',
        'address',
        'email',
        'passSport',
        'ticketLoisirCaf',
        'parentLastName',
        'parentFirstName',
        'parentPhone',
        'imageRights',
        'photo',
        'photoName',
        'cni',
        'medicalCertificate',
        'insurance',
        'injury',
        'passSportAmount',
        'paymentCount',
        'payment1',
        'payment1Amount',
        'payment1Date',
        'payment2',
        'payment2Amount',
        'payment2Date',
        'payment3',
        'payment3Amount',
        'payment3Date',
        'paymentMethod',
        'paymentPlan',
        'totalDue',
        'totalPaid',
        'remaining',
        'remainingBalance',
        'payments',
        'passSportReference',
        'assuranceReference',
    ];

    const state = {
        members: [],
        filters: {
            search: '',
            category: 'all',
            status: 'all',
        },
        editingId: null,
        paymentDrafts: [],
        paymentTotals: {
            totalDue: 0,
            totalPaid: 0,
            remaining: 0,
        },
        paymentPlan: {
            count: 1,
            entries: [],
        },
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

    const updateEditFeedback = (message = '', isError = false) => {
        const feedback = document.querySelector(selectors.editFeedback);
        if (!feedback) {
            return;
        }
        if (!message) {
            feedback.hidden = true;
            feedback.textContent = '';
            feedback.classList.remove('error');
            return;
        }
        feedback.hidden = false;
        feedback.textContent = message;
        feedback.classList.toggle('error', isError);
    };

    const ensureSession = () => {
        const sessionRaw = localStorage.getItem('qbbcSession');
        if (!sessionRaw) {
            redirectToLogin();
            return false;
        }
        return true;
    };

    const booleanFromValue = (value) => {
        if (typeof value === 'boolean') {
            return value;
        }
        if (value == null) {
            return false;
        }
        const normalised = String(value).toLowerCase();
        return normalised === 'true' || normalised === 'yes' || normalised === 'oui' || normalised === '1';
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

    const formatCurrency = (value) => {
        if (value == null || value === '') {
            return '--';
        }
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 2,
        }).format(normaliseAmount(value));
    };

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

    const computePaymentTotals = (due, payments) => {
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

    const getPaymentPlanRows = () => {
        const container = document.querySelector(selectors.paymentPlanGrid);
        if (!container) {
            return [];
        }
        return Array.from(container.querySelectorAll('[data-plan-index]'));
    };

    const updatePaymentPlanRows = (count) => {
        const rows = getPaymentPlanRows();
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
        state.paymentPlan.count = targetCount;
    };

    const extractPaymentPlanFromForm = (form) => {
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
                plan.push({ index, amount, dueDate });
            }
        }
        state.paymentPlan = { count, entries: plan };
        return { count, plan };
    };

    const todayIso = () => new Date().toISOString().split('T')[0];

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

    const escapeHtml = (value) => {
        if (value == null) {
            return '';
        }
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    const splitCsvLine = (line, delimiter) => {
        const result = [];
        let buffer = '';
        let inQuotes = false;
        for (let index = 0; index < line.length; index += 1) {
            const char = line[index];
            if (char === '"') {
                if (inQuotes && line[index + 1] === '"') {
                    buffer += '"';
                    index += 1;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                result.push(buffer.trim());
                buffer = '';
            } else {
                buffer += char;
            }
        }
        result.push(buffer.trim());
        return result;
    };

    const computeAge = (birthdate) => {
        if (!birthdate) {
            return '--';
        }
        const birth = new Date(birthdate);
        if (Number.isNaN(birth.getTime())) {
            return '--';
        }
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
            age -= 1;
        }
        return age < 0 ? '--' : String(age);
    };

    const formatDate = (value) => {
        if (!value) {
            return '--';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }
        return new Intl.DateTimeFormat('fr-FR').format(date);
    };

    const resetPaymentDrafts = () => {
        state.paymentDrafts = [];
        state.paymentTotals = { totalDue: 0, totalPaid: 0, remaining: 0 };
        state.paymentPlan = { count: 1, entries: [] };
        updatePaymentPlanRows(1);
    };

    const closePaymentForm = (hide = true) => {
        const form = document.querySelector(selectors.paymentForm);
        if (!form) {
            return;
        }
        if (hide) {
            form.hidden = true;
        }
        form.reset();
    };

    const openPaymentForm = () => {
        const form = document.querySelector(selectors.paymentForm);
        if (!form) {
            return;
        }
        form.hidden = false;
        const dateInput = form.querySelector(selectors.paymentDate);
        if (dateInput && !dateInput.value) {
            dateInput.value = todayIso();
        }
        dateInput?.focus();
    };

    const renderPaymentEditor = () => {
        const form = document.querySelector(selectors.editForm);
        const totalDueEl = document.querySelector(selectors.paymentTotalDue);
        const totalPaidEl = document.querySelector(selectors.paymentTotalPaid);
        const remainingEl = document.querySelector(selectors.paymentRemaining);
        const list = document.querySelector(selectors.paymentList);
        const emptyState = document.querySelector(selectors.paymentEmpty);

        const dueField = form?.elements?.namedItem('passSportAmount');
        const dueAmount = dueField ? numberFromValue(dueField.value) : 0;
        const totals = computePaymentTotals(dueAmount, state.paymentDrafts);
        state.paymentTotals = totals;

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
            state.paymentDrafts.forEach((payment, index) => {
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
            list.hidden = state.paymentDrafts.length === 0;
        }

        if (emptyState) {
            emptyState.hidden = state.paymentDrafts.length > 0;
        }
    };

    const handlePaymentToggle = () => {
        const form = document.querySelector(selectors.paymentForm);
        if (!form) {
            return;
        }
        if (form.hidden) {
            openPaymentForm();
        } else {
            closePaymentForm();
        }
        updateEditFeedback('');
    };

    const handlePaymentSubmit = (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const dateInput = form.querySelector(selectors.paymentDate);
        const amountInput = form.querySelector(selectors.paymentAmount);
        const methodSelect = form.querySelector(selectors.paymentMethod);

        const rawDate = dateInput?.value;
        const rawAmount = amountInput?.value;
        const method = methodSelect?.value || '';

        if (!rawDate || !rawAmount) {
            updateEditFeedback('Merci de renseigner la date et le montant du paiement.', true);
            return;
        }

        const amount = normaliseAmount(rawAmount);
        if (amount <= 0) {
            updateEditFeedback('Le montant doit être supérieur à zéro.', true);
            return;
        }

        state.paymentDrafts.push({
            date: formatPaymentDate(rawDate),
            amount,
            method,
        });

        closePaymentForm();
        renderPaymentEditor();
        updateEditFeedback('Paiement ajouté. Enregistrez pour confirmer.');
    };

    const handlePaymentCancel = () => {
        closePaymentForm();
        updateEditFeedback('');
    };

    const handlePaymentListClick = (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        const trigger = target.closest('[data-action="remove-payment"]');
        if (!trigger) {
            return;
        }
        const index = Number.parseInt(trigger.dataset.paymentIndex || '', 10);
        if (!Number.isInteger(index) || index < 0 || index >= state.paymentDrafts.length) {
            return;
        }
        state.paymentDrafts.splice(index, 1);
        renderPaymentEditor();
        updateEditFeedback('Paiement retiré. Enregistrez pour confirmer.');
    };

    const handlePassSportAmountChange = () => {
        renderPaymentEditor();
    };

    const normaliseMemberRecord = (member) => {
        if (!member || typeof member !== 'object') {
            return member;
        }
        member.passSportAmount = numberFromValue(member.passSportAmount);
        const payments = clonePayments(member.payments);

        let totalPaidFallback = member.totalPaid != null ? normaliseAmount(member.totalPaid) : null;
        let remainingFallback = member.remaining != null ? normaliseAmount(member.remaining) : null;

        if (!payments.length && (member.remainingBalance != null || totalPaidFallback == null)) {
            const remainingLegacy = numberFromValue(member.remainingBalance);
            const due = member.passSportAmount;
            if (due || remainingLegacy) {
                const computedPaid = normaliseAmount(due - remainingLegacy);
                if (computedPaid > 0) {
                    totalPaidFallback = totalPaidFallback != null ? totalPaidFallback : computedPaid;
                    remainingFallback = remainingFallback != null ? remainingFallback : normaliseAmount(due - totalPaidFallback);
                }
            }
        }

        member.payments = payments;
        const totals = computePaymentTotals(member.passSportAmount, payments);

        if (!payments.length && totalPaidFallback != null) {
            totals.totalPaid = totalPaidFallback;
            totals.remaining = remainingFallback != null ? remainingFallback : normaliseAmount(totals.totalDue - totalPaidFallback);
        }

        member.totalDue = totals.totalDue;
        member.totalPaid = totals.totalPaid;
        member.remaining = totals.remaining;
        member.remainingBalance = totals.remaining;

        const planSource = Array.isArray(member.paymentPlan) ? member.paymentPlan : [];
        const planCount = clampPaymentCount(member.paymentCount || planSource.length || 1);
        const normalisedPlan = [];
        for (let index = 1; index <= 3; index += 1) {
            const baseEntry = planSource.find((entry) => Number(entry.index) === index) || {};
            const amountFallback = member[`payment${index}Amount`];
            const dateFallback = member[`payment${index}Date`] || member[`payment${index}`];
            const amount = index <= planCount ? normaliseAmount(baseEntry.amount != null ? baseEntry.amount : amountFallback) : 0;
            const dueDate = index <= planCount ? (baseEntry.dueDate || baseEntry.date || dateFallback || '') : '';
            if (index <= planCount) {
                normalisedPlan.push({ index, amount, dueDate });
            }
            member[`payment${index}`] = dueDate;
            member[`payment${index}Amount`] = amount;
            member[`payment${index}Date`] = dueDate;
        }
        member.paymentCount = planCount;
        member.paymentPlan = normalisedPlan;
        if (!member.paymentMethod && member.payments.length) {
            member.paymentMethod = member.payments[member.payments.length - 1]?.method || '';
        }
        return member;
    };

    const loadMembers = async () => {
        const stored = getStoredMembers();
        if (stored && Array.isArray(stored) && stored.length) {
            state.members = stored.map((member) => normaliseMemberRecord({ ...member }));
            persistMembers();
            return;
        }

        try {
            const response = await fetch(getDataUrl(dataFiles.members), { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Fetch status ${response.status}`);
            }
            const data = await response.json();
            state.members = Array.isArray(data)
                ? data.map((member) => normaliseMemberRecord({ ...member }))
                : [];
            persistMembers();
        } catch (error) {
            console.error('Load members error:', error);
            state.members = stored && Array.isArray(stored)
                ? stored.map((member) => normaliseMemberRecord({ ...member }))
                : [];
        }
    };

    const applyFilters = () => {
        const { search, category, status } = state.filters;
        const lowerSearch = search.trim().toLowerCase();

        const filtered = state.members.filter((member) => {
            const matchesCategory = category === 'all' || (member.category || '').toLowerCase() === category.toLowerCase();
            const matchesStatus = status === 'all' || (member.status || '').toLowerCase() === status.toLowerCase();
            const fields = [member.lastName, member.firstName, member.phone, member.category];
            const matchesSearch = !lowerSearch || fields.some((field) => (field || '').toLowerCase().includes(lowerSearch));
            return matchesCategory && matchesStatus && matchesSearch;
        });

        renderTable(filtered);
    };

    const renderTable = (members) => {
        const tbody = document.querySelector(selectors.tableBody);
        if (!tbody) {
            return;
        }

        if (!members.length) {
            tbody.innerHTML = '<tr><td colspan="29">Aucun adhérent ne correspond aux critères.</td></tr>';
            return;
        }

        const rows = members.map((member) => {
            const status = (member.status || 'active').toLowerCase();
            const passSportActive = Boolean(member.passSport);
            const assuranceActive = Boolean(member.insurance);
            const rightsLabel = member.imageRights === 'Autorise' ? 'Autorisé' : member.imageRights === 'Refuse' ? 'Refusé' : 'Non demandé';
            const address = escapeHtml(member.address || '').replace(/\n/g, '<br>');
            const injury = escapeHtml(member.injury || '').replace(/\n/g, '<br>');
            const parentName = escapeHtml(member.parentLastName || '');
            const parentFirstName = escapeHtml(member.parentFirstName || '');
            const category = escapeHtml(member.category || '--');
            const photoTitle = member.photoName ? escapeHtml(member.photoName) : 'Ouvrir la photo';
            const photoDownload = member.photoName ? ` download="${escapeHtml(member.photoName)}"` : '';
            const photoCell = member.photo
                ? `<a class="photo-link" href="${escapeHtml(member.photo)}" target="_blank" rel="noopener" title="${photoTitle}"${photoDownload}>Voir</a>`
                : '--';
            const totalDueDisplay = formatCurrency(member.totalDue != null ? member.totalDue : member.passSportAmount);
            const totalPaidDisplay = formatCurrency(member.totalPaid);
            const remainingDisplay = formatCurrency(member.remaining);
            const paymentCount = Array.isArray(member.payments) ? member.payments.length : 0;
            const lastPayment = paymentCount ? member.payments[paymentCount - 1] : null;
            const lastPaymentText = lastPayment
                ? `${escapeHtml(lastPayment.date || '--')} • ${formatCurrency(lastPayment.amount)} • ${escapeHtml(getPaymentMethodLabel(lastPayment.method))}`
                : '--';
            const paymentCell = paymentCount
                ? `<span class="payment-count">${paymentCount} paiement(s)</span><br>${lastPaymentText}`
                : '--';

            return `
                <tr data-id="${escapeHtml(member.id || '')}" data-status="${status}">
                    <td>${escapeHtml(member.membershipNumber || '--')}</td>
                    <td>${escapeHtml(member.lastName || '--')}</td>
                    <td>${escapeHtml(member.firstName || '--')}</td>
                    <td>${formatDate(member.birthdate)}</td>
                    <td>${computeAge(member.birthdate)}</td>
                    <td>${escapeHtml(member.gender || '--')}</td>
                    <td>${escapeHtml(member.phone || '--')}</td>
                    <td>${category}</td>
                    <td>${address || '--'}</td>
                    <td>${escapeHtml(member.email || '--')}</td>
                    <td>
                        <button type="button" class="switch-btn" data-action="toggle-pass" data-id="${escapeHtml(member.id || '')}" data-active="${passSportActive}">
                            ${passSportActive ? 'Oui' : 'Non'}
                        </button>
                    </td>
                    <td>${member.ticketLoisirCaf ? 'Oui' : 'Non'}</td>
                    <td>${parentName || '--'}</td>
                    <td>${parentFirstName || '--'}</td>
                    <td>${escapeHtml(member.parentPhone || '--')}</td>
                    <td>${rightsLabel}</td>
                    <td>${photoCell}</td>
                    <td>${member.cni ? 'Oui' : 'Non'}</td>
                    <td>${member.medicalCertificate ? 'Oui' : 'Non'}</td>
                    <td>
                        <button type="button" class="switch-btn" data-action="toggle-insurance" data-id="${escapeHtml(member.id || '')}" data-active="${assuranceActive}">
                            ${assuranceActive ? 'Oui' : 'Non'}
                        </button>
                    </td>
                    <td>${injury || '--'}</td>
                    <td>${formatCurrency(member.passSportAmount)}</td>
                    <td>${totalDueDisplay}</td>
                    <td>${totalPaidDisplay}</td>
                    <td>${remainingDisplay}</td>
                    <td>${paymentCell}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn" type="button" data-action="edit" data-id="${escapeHtml(member.id || '')}">Modifier</button>
                            ${status === 'inactive'
                                ? `<button class="action-btn action-btn--success" type="button" data-action="reactivate" data-id="${escapeHtml(member.id || '')}">Réactiver</button>`
                                : `<button class="action-btn action-btn--warning" type="button" data-action="deactivate" data-id="${escapeHtml(member.id || '')}">Marquer inactif</button>`}
                            <button class="action-btn action-btn--danger" type="button" data-action="delete" data-id="${escapeHtml(member.id || '')}">Supprimer</button>
                        </div>
                    </td>
                </tr>
            `.trim();
        }).join('');

        tbody.innerHTML = rows;
    };

    const openEditModal = (id) => {
        const member = state.members.find((item) => item.id === id);
        if (!member) {
            return;
        }
        state.editingId = id;
        const modal = document.querySelector(selectors.editModal);
        const form = document.querySelector(selectors.editForm);
        if (!modal || !form) {
            return;
        }

        const map = {
            membershipNumber: member.membershipNumber || '',
            status: member.status || 'active',
            lastName: member.lastName || '',
            firstName: member.firstName || '',
            birthdate: member.birthdate || '',
            gender: member.gender || '',
            phone: member.phone || '',
            category: member.category || 'U7',
            address: member.address || '',
            email: member.email || '',
            parentLastName: member.parentLastName || '',
            parentFirstName: member.parentFirstName || '',
            parentPhone: member.parentPhone || '',
            passSport: String(Boolean(member.passSport)),
            passSportAmount: member.passSportAmount != null ? member.passSportAmount : '',
            ticketLoisirCaf: String(Boolean(member.ticketLoisirCaf)),
            imageRights: member.imageRights || 'Non demande',
            insurance: String(Boolean(member.insurance)),
            cni: String(Boolean(member.cni)),
            medicalCertificate: String(Boolean(member.medicalCertificate)),
            injury: member.injury || '',
            photo: member.photo || '',
            passSportReference: member.passSportReference || '',
            assuranceReference: member.assuranceReference || '',
        };

        Object.entries(map).forEach(([name, value]) => {
            const field = form.elements.namedItem(name);
            if (field) {
                field.value = value;
            }
        });

        const paymentCountField = form.elements.namedItem('paymentCount');
        const planSource = Array.isArray(member.paymentPlan) ? member.paymentPlan : [];
        const inferredCount = clampPaymentCount(member.paymentCount || planSource.length || 1);
        if (paymentCountField instanceof HTMLSelectElement || paymentCountField instanceof HTMLInputElement) {
            paymentCountField.value = String(inferredCount);
        }
        updatePaymentPlanRows(inferredCount);

        const derivedPlan = [];
        for (let index = 1; index <= 3; index += 1) {
            const baseEntry = planSource.find((entry) => Number(entry.index) === index) || {};
            const amountFallback = member[`payment${index}Amount`];
            const dateFallback = member[`payment${index}Date`] || member[`payment${index}`];
            const amount = index <= inferredCount ? normaliseAmount(baseEntry.amount != null ? baseEntry.amount : amountFallback) : 0;
            const dueDate = index <= inferredCount ? (baseEntry.dueDate || baseEntry.date || dateFallback || '') : '';
            const amountField = form.elements.namedItem(`payment${index}Amount`);
            const dateField = form.elements.namedItem(`payment${index}Date`);
            if (amountField instanceof HTMLInputElement) {
                amountField.value = amount ? String(amount) : '';
            }
            if (dateField instanceof HTMLInputElement) {
                dateField.value = dueDate;
            }
            if (index <= inferredCount) {
                derivedPlan.push({ index, amount, dueDate });
            }
        }
        state.paymentPlan = { count: inferredCount, entries: derivedPlan };

        state.paymentDrafts = clonePayments(member.payments);
        state.paymentTotals = computePaymentTotals(member.passSportAmount, state.paymentDrafts);
        closePaymentForm();
        renderPaymentEditor();
        updateEditFeedback('');

        modal.hidden = false;
        form.querySelector('input, select, textarea')?.focus();
    };

    const closeEditModal = () => {
        const modal = document.querySelector(selectors.editModal);
        const form = document.querySelector(selectors.editForm);
        if (form) {
            form.reset();
        }
        resetPaymentDrafts();
        closePaymentForm();
        renderPaymentEditor();
        updateEditFeedback('');
        state.editingId = null;
        if (modal) {
            modal.hidden = true;
        }
    };

    const updateMemberFromForm = (event) => {
        event.preventDefault();
        if (!state.editingId) {
            return;
        }
        const member = state.members.find((item) => item.id === state.editingId);
        const form = event.currentTarget;
        if (!member) {
            updateEditFeedback('Adhérent introuvable.', true);
            return;
        }

        const formData = new FormData(form);
        member.status = formData.get('status') || member.status;
        member.lastName = formData.get('lastName') || '';
        member.firstName = formData.get('firstName') || '';
        member.birthdate = formData.get('birthdate') || '';
        member.gender = formData.get('gender') || '';
        member.phone = formData.get('phone') || '';
        member.category = formData.get('category') || '';
        member.address = formData.get('address') || '';
        member.email = formData.get('email') || '';
        member.parentLastName = formData.get('parentLastName') || '';
        member.parentFirstName = formData.get('parentFirstName') || '';
        member.parentPhone = formData.get('parentPhone') || '';
        member.passSport = booleanFromValue(formData.get('passSport'));
        member.passSportAmount = numberFromValue(formData.get('passSportAmount'));
        member.ticketLoisirCaf = booleanFromValue(formData.get('ticketLoisirCaf'));
        member.imageRights = formData.get('imageRights') || 'Non demande';
        member.insurance = booleanFromValue(formData.get('insurance'));
        member.cni = booleanFromValue(formData.get('cni'));
        member.medicalCertificate = booleanFromValue(formData.get('medicalCertificate'));
        member.injury = formData.get('injury') || '';
        member.photo = formData.get('photo') || '';
        member.passSportReference = formData.get('passSportReference') || '';
        member.assuranceReference = formData.get('assuranceReference') || '';
        const { count: paymentPlanCount, plan: paymentPlanEntries } = extractPaymentPlanFromForm(form);
        const totals = computePaymentTotals(member.passSportAmount, state.paymentDrafts);
        member.payments = clonePayments(state.paymentDrafts);
        member.totalDue = totals.totalDue;
        member.totalPaid = totals.totalPaid;
        member.remaining = totals.remaining;
        state.paymentTotals = totals;
        member.paymentCount = paymentPlanCount;
        member.paymentPlan = paymentPlanEntries;
        for (let index = 1; index <= 3; index += 1) {
            const entry = paymentPlanEntries.find((item) => Number(item.index) === index) || {};
            const amountValue = index <= paymentPlanCount ? normaliseAmount(entry.amount) : 0;
            const dueDateValue = index <= paymentPlanCount ? (entry.dueDate || '') : '';
            member[`payment${index}`] = dueDateValue;
            member[`payment${index}Amount`] = amountValue;
            member[`payment${index}Date`] = dueDateValue;
        }
        member.paymentMethod = state.paymentDrafts[state.paymentDrafts.length - 1]?.method || member.paymentMethod || '';
        member.remainingBalance = totals.remaining;
        state.paymentPlan = { count: paymentPlanCount, entries: paymentPlanEntries };
        member.updatedAt = new Date().toISOString();

        persistMembers();
        applyFilters();

        updateEditFeedback('Profil mis à jour avec succès.');

        window.setTimeout(() => {
            closeEditModal();
        }, 900);
    };

    const toggleMemberBoolean = (id, field) => {
        const member = state.members.find((item) => item.id === id);
        if (!member) {
            return;
        }
        member[field] = !Boolean(member[field]);
        member.updatedAt = new Date().toISOString();
        persistMembers();
        applyFilters();
    };

    const updateMemberStatus = (id, status) => {
        const member = state.members.find((item) => item.id === id);
        if (!member) {
            return;
        }
        member.status = status;
        member.updatedAt = new Date().toISOString();
        persistMembers();
        applyFilters();
    };

    const deleteMember = (id) => {
        const index = state.members.findIndex((item) => item.id === id);
        if (index === -1) {
            return;
        }
        const confirmation = window.confirm('Supprimer définitivement cet adhérent ?');
        if (!confirmation) {
            return;
        }
        state.members.splice(index, 1);
        persistMembers();
        applyFilters();
    };

    const exportCsv = () => {
        if (!state.members.length) {
            return;
        }
        const header = CSV_HEADERS.join(';');
        const rows = state.members.map((member) => {
            return CSV_HEADERS.map((key) => {
                const value = member[key];
                if (value == null) {
                    return '';
                }
                if (Array.isArray(value)) {
                    return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
                }
                if (typeof value === 'object') {
                    return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
                }
                if (typeof value === 'string') {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return String(value);
            }).join(';');
        });
        const csvContent = [header, ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `qbbc_members_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const parseCsvContent = (content) => {
        const lines = content.split(/\r?\n/).filter((line) => line.trim().length);
        if (!lines.length) {
            return [];
        }
        const delimiter = lines[0].includes(';') ? ';' : ',';
        const headerTokens = splitCsvLine(lines[0], delimiter).map((token) => token.replace(/"/g, '').trim());
        const headers = headerTokens.length >= CSV_HEADERS.length ? headerTokens : CSV_HEADERS;

        return lines.slice(1).map((line) => {
            const tokens = splitCsvLine(line, delimiter).map((token) => token.replace(/^"|"$/g, '').replace(/""/g, '"'));
            const record = {};
            headers.forEach((key, index) => {
                record[key] = tokens[index] != null ? tokens[index].trim() : '';
            });
            record.passSport = booleanFromValue(record.passSport);
            record.ticketLoisirCaf = booleanFromValue(record.ticketLoisirCaf);
            record.cni = booleanFromValue(record.cni);
            record.medicalCertificate = booleanFromValue(record.medicalCertificate);
            record.insurance = booleanFromValue(record.insurance);
            record.passSportAmount = numberFromValue(record.passSportAmount);
            record.paymentCount = clampPaymentCount(record.paymentCount);
            ['payment1Amount', 'payment2Amount', 'payment3Amount'].forEach((key) => {
                record[key] = numberFromValue(record[key]);
            });
            ['payment1Date', 'payment2Date', 'payment3Date'].forEach((key) => {
                record[key] = record[key] || '';
            });
            ['payment1', 'payment2', 'payment3'].forEach((key, idx) => {
                const dateKey = `payment${idx + 1}Date`;
                if (!record[dateKey] && record[key]) {
                    record[dateKey] = record[key];
                }
            });
            record.totalDue = numberFromValue(record.totalDue);
            record.totalPaid = numberFromValue(record.totalPaid);
            record.remaining = numberFromValue(record.remaining);
            record.remainingBalance = numberFromValue(record.remainingBalance);
            try {
                record.payments = record.payments ? JSON.parse(record.payments) : [];
            } catch (error) {
                record.payments = [];
            }
            try {
                record.paymentPlan = record.paymentPlan ? JSON.parse(record.paymentPlan) : [];
            } catch (error) {
                record.paymentPlan = [];
            }
            record.payments = clonePayments(record.payments);
            const totals = computePaymentTotals(record.passSportAmount, record.payments);
            if (record.totalPaid) {
                totals.totalPaid = normaliseAmount(record.totalPaid);
                totals.remaining = normaliseAmount(totals.totalDue - totals.totalPaid);
            }
            if (record.remaining) {
                totals.remaining = normaliseAmount(record.remaining);
                totals.totalPaid = normaliseAmount(totals.totalDue - totals.remaining);
            }
            record.totalDue = totals.totalDue;
            record.totalPaid = totals.totalPaid;
            record.remaining = totals.remaining;
            record.remainingBalance = record.remaining;
            record.id = record.id || `import-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            return record;
        });
    };

    const mergeImportedMembers = (imported) => {
        const lookup = new Map();
        state.members.forEach((member) => {
            if (member.membershipNumber) {
                lookup.set(member.membershipNumber, member);
            }
            if (member.id) {
                lookup.set(member.id, member);
            }
        });

        imported.forEach((record) => {
            const key = record.membershipNumber || record.id;
            if (key && lookup.has(key)) {
                const existing = lookup.get(key);
                Object.assign(existing, record, { updatedAt: new Date().toISOString() });
                normaliseMemberRecord(existing);
            } else {
                const nowIso = new Date().toISOString();
                const newMember = normaliseMemberRecord({ ...record, createdAt: record.createdAt || nowIso, updatedAt: nowIso });
                state.members.push(newMember);
                if (newMember.membershipNumber) {
                    lookup.set(newMember.membershipNumber, newMember);
                }
                if (newMember.id) {
                    lookup.set(newMember.id, newMember);
                }
            }
        });
        persistMembers();
        applyFilters();
    };

    const handleImport = (file) => {
        if (!file) {
            return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target?.result;
                if (typeof text !== 'string') {
                    throw new Error('Format du fichier invalide');
                }
                const imported = parseCsvContent(text);
                if (!imported.length) {
                    window.alert('Aucune donnée trouvée dans le fichier.');
                    return;
                }
                mergeImportedMembers(imported);
            } catch (error) {
                console.error('Import error:', error);
                window.alert('Import impossible. Vérifiez le format du fichier CSV.');
            }
        };
        reader.readAsText(file, 'utf-8');
    };

    const handleTableInteraction = (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        const action = target.dataset.action;
        const id = target.dataset.id;
        if (!action || !id) {
            return;
        }

        switch (action) {
            case 'toggle-pass':
                toggleMemberBoolean(id, 'passSport');
                break;
            case 'toggle-insurance':
                toggleMemberBoolean(id, 'insurance');
                break;
            case 'edit':
                openEditModal(id);
                break;
            case 'deactivate':
                updateMemberStatus(id, 'inactive');
                break;
            case 'reactivate':
                updateMemberStatus(id, 'active');
                break;
            case 'delete':
                deleteMember(id);
                break;
            default:
                break;
        }
    };

    const bindEvents = () => {
        const tableBody = document.querySelector(selectors.tableBody);
        const searchInput = document.querySelector(selectors.search);
        const categoryFilter = document.querySelector(selectors.filterCategory);
        const statusFilter = document.querySelector(selectors.filterStatus);
        const exportBtn = document.querySelector(selectors.exportBtn);
        const importBtn = document.querySelector(selectors.importBtn);
        const importInput = document.querySelector(selectors.importInput);
        const editForm = document.querySelector(selectors.editForm);
        const modalCloseElements = document.querySelectorAll(selectors.modalClose);
        const logoutBtn = document.querySelector(selectors.logout);
        const paymentAddButton = document.querySelector(selectors.paymentAddButton);
        const paymentForm = document.querySelector(selectors.paymentForm);
        const paymentCancel = document.querySelector(selectors.paymentCancel);
        const paymentList = document.querySelector(selectors.paymentList);
        const passSportField = editForm?.elements?.namedItem('passSportAmount');
        const paymentCountField = editForm?.elements?.namedItem('paymentCount');

        if (tableBody) {
            tableBody.addEventListener('click', handleTableInteraction);
        }

        if (searchInput) {
            searchInput.addEventListener('input', (event) => {
                state.filters.search = event.target.value;
                applyFilters();
            });
        }

        if (categoryFilter) {
            categoryFilter.addEventListener('change', (event) => {
                state.filters.category = event.target.value;
                applyFilters();
            });
        }

        if (statusFilter) {
            statusFilter.addEventListener('change', (event) => {
                state.filters.status = event.target.value;
                applyFilters();
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', exportCsv);
        }

        if (importBtn && importInput) {
            importBtn.addEventListener('click', () => importInput.click());
            importInput.addEventListener('change', (event) => {
                const file = event.target.files?.[0];
                handleImport(file);
                event.target.value = '';
            });
        }

        if (editForm) {
            editForm.addEventListener('submit', updateMemberFromForm);
        }

        if (paymentAddButton) {
            paymentAddButton.addEventListener('click', handlePaymentToggle);
        }
        if (paymentForm) {
            paymentForm.addEventListener('submit', handlePaymentSubmit);
        }
        if (paymentCancel) {
            paymentCancel.addEventListener('click', handlePaymentCancel);
        }
        if (paymentList) {
            paymentList.addEventListener('click', handlePaymentListClick);
        }
        if (passSportField instanceof HTMLInputElement) {
            passSportField.addEventListener('input', handlePassSportAmountChange);
        }
        if (paymentCountField instanceof HTMLSelectElement || paymentCountField instanceof HTMLInputElement) {
            paymentCountField.addEventListener('change', (event) => {
                updatePaymentPlanRows(event.target.value);
            });
        }

        modalCloseElements.forEach((element) => {
            element.addEventListener('click', closeEditModal);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeEditModal();
            }
        });

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

        window.addEventListener('qbbc-members-updated', () => {
            const stored = getStoredMembers();
            if (stored && Array.isArray(stored)) {
                state.members = stored;
                applyFilters();
            }
        });

        window.addEventListener('storage', (event) => {
            if (event.key === storageKey) {
                const stored = getStoredMembers();
                if (stored && Array.isArray(stored)) {
                    state.members = stored;
                    applyFilters();
                }
            }
        });
    };

    const init = async () => {
        if (!ensureSession()) {
            return;
        }

        await loadMembers();
        applyFilters();
        bindEvents();
    };

    document.addEventListener('DOMContentLoaded', init);
})();
