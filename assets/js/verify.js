'use strict';

(() => {
    const selectors = {
        searchForm: '[data-member-search-form]',
        searchInput: '[data-member-search-input]',
        refinePanel: '[data-refine-panel]',
        refineForm: '[data-member-refine-form]',
        refineInput: '[data-member-refine-input]',
        resultContainer: '[data-result-container]',
        resultMessage: '[data-result-message]',
        resultActions: '[data-result-actions]',
        viewButton: '[data-action="view-member"]',
        createButton: '[data-action="create-member"]',
        openCreate: '[data-action="open-create"]',
        logout: '[data-action="logout"]',
        detailSection: '[data-member-detail]',
        detailForm: '[data-member-form]',
        detailFeedback: '[data-detail-feedback]',
        toggleEdit: '[data-action="toggle-edit"]',
        saveButton: '[data-action="save-member"]',
        quitButton: '[data-action="quit-detail"]',
        photoWrapper: '[data-member-photo]',
        photoImage: '[data-member-photo-img]',
        photoEmpty: '[data-member-photo-empty]',
        memberFullname: '[data-member-fullname]',
        memberNumber: '[data-member-number]',
        memberStatus: '[data-member-status]',
        paymentAddButton: '[data-action="toggle-payment-form"]',
        paymentForm: '[data-payment-form]',
        paymentCancel: '[data-action="cancel-payment"]',
        paymentSave: '[data-action="save-payment"]',
        paymentDate: '[data-payment-date]',
        paymentAmount: '[data-payment-amount]',
        paymentMethod: '[data-payment-method]',
        paymentList: '[data-payment-list]',
        paymentEmpty: '[data-payment-empty]',
        paymentTotalDue: '[data-payment-total-due]',
        paymentTotalPaid: '[data-payment-total-paid]',
        paymentRemaining: '[data-payment-remaining]',
        paymentCount: '[data-payment-count]',
        paymentPlanGrid: '[data-payment-plan-grid]',
    };

    const storageKey = 'qbbcMembers';

    const state = {
        members: [],
        session: null,
        matches: [],
        selectedMember: null,
        editMode: false,
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

    const ensureSession = () => {
        try {
            const raw = localStorage.getItem('qbbcSession');
            if (!raw) {
                window.location.href = `${getBasePath()}index.html`;
                return false;
            }
            const parsed = JSON.parse(raw);
            if (!parsed?.username) {
                window.location.href = `${getBasePath()}index.html`;
                return false;
            }
            state.session = parsed;
            return true;
        } catch (error) {
            console.error('Session parse error:', error);
            window.location.href = `${getBasePath()}index.html`;
            return false;
        }
    };

    const loadMembers = async () => {
        const stored = getStoredMembers();
        if (stored && Array.isArray(stored) && stored.length) {
            state.members = stored;
            return;
        }

        try {
            const response = await fetch(getDataUrl('users.json'), { cache: 'no-store' });
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
        if (!state.editMode) {
            return;
        }
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

    const renderPayments = () => {
        const form = document.querySelector(selectors.detailForm);
        const addButton = document.querySelector(selectors.paymentAddButton);
        const paymentForm = document.querySelector(selectors.paymentForm);
        const list = document.querySelector(selectors.paymentList);
        const emptyState = document.querySelector(selectors.paymentEmpty);
        const totalDueEl = document.querySelector(selectors.paymentTotalDue);
        const totalPaidEl = document.querySelector(selectors.paymentTotalPaid);
        const remainingEl = document.querySelector(selectors.paymentRemaining);

        const dueField = form?.elements?.namedItem('passSportAmount');
        const totalDue = dueField ? numberFromValue(dueField.value) : state.selectedMember?.passSportAmount || 0;

        state.paymentTotals = computePaymentTotals(totalDue, state.paymentDrafts);

        if (totalDueEl) {
            totalDueEl.textContent = formatCurrency(state.paymentTotals.totalDue);
        }
        if (totalPaidEl) {
            totalPaidEl.textContent = formatCurrency(state.paymentTotals.totalPaid);
        }
        if (remainingEl) {
            remainingEl.textContent = formatCurrency(state.paymentTotals.remaining);
        }

        if (addButton) {
            addButton.disabled = !state.editMode;
            addButton.title = state.editMode ? '' : 'Cliquez sur "Modifier" pour ajouter un paiement.';
        }

        if (paymentForm) {
            Array.from(paymentForm.elements).forEach((element) => {
                if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLButtonElement) {
                    element.disabled = !state.editMode;
                }
            });
            if (!state.editMode) {
                closePaymentForm();
            }
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
                const methodLabel = getPaymentMethodLabel(payment.method);
                const fragments = [payment.date || 'Date inconnue', methodLabel].filter(Boolean);
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
                removeBtn.disabled = !state.editMode;

                actions.append(removeBtn);
                item.append(actions);

                list.append(item);
            });
        }

        if (emptyState) {
            emptyState.hidden = state.paymentDrafts.length > 0;
        }
        if (list) {
            list.hidden = state.paymentDrafts.length === 0;
        }
    };

    const handlePaymentToggle = () => {
        if (!state.editMode) {
            return;
        }
        const form = document.querySelector(selectors.paymentForm);
        if (!form) {
            return;
        }
        if (form.hidden) {
            openPaymentForm();
        } else {
            closePaymentForm();
        }
    };

    const handlePaymentSubmit = (event) => {
        event.preventDefault();
        if (!state.editMode) {
            return;
        }
        const form = event.currentTarget;
        const dateInput = form.querySelector(selectors.paymentDate);
        const amountInput = form.querySelector(selectors.paymentAmount);
        const methodSelect = form.querySelector(selectors.paymentMethod);

        const rawDate = dateInput?.value;
        const rawAmount = amountInput?.value;
        const method = methodSelect?.value || '';

        if (!rawDate || !rawAmount) {
            showFeedback('Complétez la date et le montant du paiement.', true);
            return;
        }

        const amount = normaliseAmount(rawAmount);
        if (amount <= 0) {
            showFeedback('Le montant doit être supérieur à zéro.', true);
            return;
        }

        state.paymentDrafts.push({
            date: formatPaymentDate(rawDate),
            amount,
            method,
        });

        closePaymentForm();
        renderPayments();
    showFeedback('Paiement ajouté. N\'oubliez pas d\'enregistrer la fiche.');
    };

    const handlePaymentCancel = () => {
        closePaymentForm();
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
        if (!state.editMode) {
            return;
        }
        const index = Number.parseInt(trigger.dataset.paymentIndex || '', 10);
        if (!Number.isInteger(index) || index < 0 || index >= state.paymentDrafts.length) {
            return;
        }
        state.paymentDrafts.splice(index, 1);
        renderPayments();
        showFeedback('Paiement retiré. Pensez à enregistrer pour confirmer.');
    };

    const handlePassSportAmountChange = () => {
        renderPayments();
    };

    const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target?.result;
            if (typeof result === 'string') {
                resolve(result);
            } else {
                reject(new Error('Format de fichier invalide.'));
            }
        };
        reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
        reader.readAsDataURL(file);
    });

    const normaliseSearchValue = (value) => value.replace(/\s+/g, ' ').trim().toLowerCase();

    const matchMembers = (query, pool = state.members) => {
        const needle = normaliseSearchValue(query);
        if (!needle) {
            return [];
        }
        return pool.filter((member) => {
            const tokens = [
                member.firstName,
                member.lastName,
                member.membershipNumber,
                member.phone,
                member.email,
            ];
            return tokens.some((token) => normaliseSearchValue(String(token || ''))?.includes(needle));
        });
    };

    const showElement = (selector, show) => {
        const element = document.querySelector(selector);
        if (!element) {
            return;
        }
        element.hidden = !show;
    };

    const renderResult = ({ message = '', showView = false, showCreate = false }) => {
        const container = document.querySelector(selectors.resultContainer);
        const messageEl = document.querySelector(selectors.resultMessage);
        const viewBtn = document.querySelector(selectors.viewButton);
        const createBtn = document.querySelector(selectors.createButton);
        if (container) {
            container.hidden = !message;
        }
        if (messageEl) {
            messageEl.textContent = message;
        }
        if (viewBtn) {
            viewBtn.hidden = !showView;
        }
        if (createBtn) {
            createBtn.hidden = !showCreate;
        }
    };

    const populateDetail = (member) => {
        const photoWrapper = document.querySelector(selectors.photoWrapper);
        const photoImage = document.querySelector(selectors.photoImage);
        const photoEmpty = document.querySelector(selectors.photoEmpty);
        const fullname = document.querySelector(selectors.memberFullname);
        const number = document.querySelector(selectors.memberNumber);
        const status = document.querySelector(selectors.memberStatus);
        const form = document.querySelector(selectors.detailForm);

        if (!form || !member) {
            return;
        }

        if (fullname) {
            fullname.textContent = `${member.firstName || ''} ${member.lastName || ''}`.trim() || 'Adhérent';
        }
        if (number) {
            number.textContent = member.membershipNumber || '--';
        }
        if (status) {
            status.textContent = (member.status || 'actif').toUpperCase();
        }

        if (photoImage && photoEmpty) {
            if (member.photo) {
                photoImage.src = member.photo;
                photoImage.alt = `Photo de ${member.firstName || ''} ${member.lastName || ''}`.trim();
                photoImage.hidden = false;
                photoEmpty.hidden = true;
            } else {
                photoImage.src = '';
                photoImage.hidden = true;
                photoEmpty.hidden = false;
            }
        }

        const mapping = {
            membershipNumber: member.membershipNumber || '',
            status: member.status || 'active',
            lastname: member.lastName || '',
            firstname: member.firstName || '',
            birthdate: member.birthdate || '',
            gender: member.gender || '',
            phone: member.phone || '',
            category: member.category || 'U7',
            address: member.address || '',
            email: member.email || '',
            parentLastname: member.parentLastName || '',
            parentFirstname: member.parentFirstName || '',
            parentPhone: member.parentPhone || '',
            passSport: member.passSport ? 'yes' : 'no',
            passSportAmount: member.passSportAmount != null ? member.passSportAmount : '',
            ticketLoisirCaf: member.ticketLoisirCaf ? 'yes' : 'no',
            imageRights: member.imageRights || 'Non demande',
            insurance: member.insurance ? 'yes' : 'no',
            cni: member.cni ? 'yes' : 'no',
            medicalCertificate: member.medicalCertificate ? 'yes' : 'no',
            injury: member.injury || '',
            photo: member.photo || '',
            passSportReference: member.passSportReference || '',
            assuranceReference: member.assuranceReference || '',
            role: member.role || '',
            username: member.username || '',
            password: member.password || '',
        };

        Object.entries(mapping).forEach(([name, value]) => {
            const field = form.elements.namedItem(name);
            if (field) {
                field.value = value;
            }
        });

        const fileField = form.elements.namedItem('photoFile');
        if (fileField) {
            fileField.value = '';
        }

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
        state.paymentTotals = computePaymentTotals(member.passSportAmount || 0, state.paymentDrafts);
        closePaymentForm();
        renderPayments();
    };

    const setFormDisabled = (disabled) => {
        const form = document.querySelector(selectors.detailForm);
        const saveButton = document.querySelector(selectors.saveButton);
        const toggleButton = document.querySelector(selectors.toggleEdit);
        if (!form || !saveButton || !toggleButton) {
            return;
        }
        Array.from(form.elements).forEach((element) => {
            if (element.name === 'membershipNumber') {
                element.readOnly = true;
                element.disabled = false;
                return;
            }
            if (element.name === 'photoFile') {
                element.disabled = disabled;
                return;
            }
            if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
                element.disabled = disabled;
            }
        });
        saveButton.disabled = disabled;
        toggleButton.textContent = disabled ? 'Modifier' : 'Annuler';
        renderPayments();
    };

    const clearFeedback = () => {
        const feedback = document.querySelector(selectors.detailFeedback);
        if (feedback) {
            feedback.hidden = true;
            feedback.textContent = '';
            feedback.classList.remove('error');
        }
    };

    const showFeedback = (message, isError = false) => {
        const feedback = document.querySelector(selectors.detailFeedback);
        if (!feedback) {
            return;
        }
        feedback.hidden = false;
        feedback.textContent = message;
        feedback.classList.toggle('error', isError);
    };

    const exitDetailView = () => {
        state.selectedMember = null;
        state.editMode = false;
        state.paymentDrafts = [];
        state.paymentTotals = { totalDue: 0, totalPaid: 0, remaining: 0 };
        state.paymentPlan = { count: 1, entries: [] };
        closePaymentForm();
        showElement(selectors.detailSection, false);
        clearFeedback();
        setFormDisabled(true);
    };

    const handleSearchSubmit = (event) => {
        event.preventDefault();
        const input = document.querySelector(selectors.searchInput);
        if (!input) {
            return;
        }
        const query = input.value.trim();
        if (!query) {
            renderResult({ message: 'Veuillez saisir un critère de recherche.' });
            return;
        }

        const matches = matchMembers(query);
        state.matches = matches;

        if (!matches.length) {
            exitDetailView();
            showElement(selectors.refinePanel, false);
            renderResult({
                message: 'Aucun adhérent ne correspond à cette recherche. Souhaitez-vous créer une nouvelle fiche ?',
                showCreate: true,
            });
            return;
        }

        if (matches.length === 1) {
            state.selectedMember = matches[0];
            populateDetail(state.selectedMember);
            setFormDisabled(true);
            showElement(selectors.detailSection, true);
            showElement(selectors.refinePanel, false);
            renderResult({
                message: `Member found: ${state.selectedMember.firstName || ''} ${state.selectedMember.lastName || ''}`.trim(),
                showView: true,
            });
            window.setTimeout(() => {
                document.querySelector(selectors.detailSection)?.scrollIntoView({ behavior: 'smooth' });
            }, 150);
            return;
        }

        exitDetailView();
        showElement(selectors.refinePanel, true);
        renderResult({
            message: `Plusieurs adhérents (${matches.length}) correspondent. Précisez votre recherche (téléphone, numéro d'adhérent...).`,
        });
    };

    const handleRefineSubmit = (event) => {
        event.preventDefault();
        const input = document.querySelector(selectors.refineInput);
        if (!input) {
            return;
        }
        const query = input.value.trim();
        if (!query) {
            renderResult({ message: 'Veuillez préciser votre recherche.' });
            return;
        }
        const base = state.matches.length ? state.matches : state.members;
        const matches = matchMembers(query, base);
        state.matches = matches;

        if (!matches.length) {
            exitDetailView();
            renderResult({
                message: 'Aucun résultat après affinement. Essayez un autre critère ou créez une nouvelle fiche.',
                showCreate: true,
            });
            return;
        }

        if (matches.length === 1) {
            state.selectedMember = matches[0];
            populateDetail(state.selectedMember);
            setFormDisabled(true);
            showElement(selectors.detailSection, true);
            showElement(selectors.refinePanel, false);
            renderResult({
                message: `Member found: ${state.selectedMember.firstName || ''} ${state.selectedMember.lastName || ''}`.trim(),
                showView: true,
            });
            window.setTimeout(() => {
                document.querySelector(selectors.detailSection)?.scrollIntoView({ behavior: 'smooth' });
            }, 150);
            return;
        }

        renderResult({
            message: `Encore ${matches.length} adhérents trouvés. Ajoutez un critère supplémentaire.`,
        });
    };

    const handleToggleEdit = () => {
        if (!state.selectedMember) {
            return;
        }
        state.editMode = !state.editMode;
        clearFeedback();
        setFormDisabled(!state.editMode);
        if (!state.editMode) {
            populateDetail(state.selectedMember);
        }
    };

    const handleDetailSubmit = async (event) => {
        event.preventDefault();
        if (!state.selectedMember) {
            return;
        }
        const form = event.currentTarget;
        const formData = new FormData(form);
        const payload = {};
        formData.forEach((value, key) => {
            if (value instanceof File) {
                payload[key] = value;
            } else {
                payload[key] = value;
            }
        });

        if (!payload.lastname || !payload.firstname || !payload.birthdate) {
            showFeedback('Merci de compléter les champs obligatoires (nom, prénom, date de naissance).', true);
            return;
        }

        try {
            const file = payload.photoFile;
            if (file instanceof File && file.size) {
                payload.photo = await readFileAsDataUrl(file);
                payload.photoName = file.name;
            }
        } catch (error) {
            console.error('Photo update error:', error);
            showFeedback('Impossible de lire la nouvelle photo.', true);
            return;
        }

        const member = state.members.find((item) => item.id === state.selectedMember.id);
        if (!member) {
            showFeedback('Impossible de retrouver cette fiche adhérent.', true);
            return;
        }

        const { count: paymentPlanCount, plan: paymentPlanEntries } = extractPaymentPlanFromForm(form);

        member.status = payload.status || member.status;
        member.lastName = payload.lastname || '';
        member.firstName = payload.firstname || '';
        member.birthdate = payload.birthdate || '';
        member.gender = payload.gender || '';
        member.phone = payload.phone || '';
        member.category = payload.category || '';
        member.address = payload.address || '';
        member.email = payload.email || '';
        member.parentLastName = payload.parentLastname || '';
        member.parentFirstName = payload.parentFirstname || '';
        member.parentPhone = payload.parentPhone || '';
        member.passSport = booleanFromValue(payload.passSport);
        member.passSportAmount = numberFromValue(payload.passSportAmount);
        member.ticketLoisirCaf = booleanFromValue(payload.ticketLoisirCaf);
        member.imageRights = payload.imageRights || 'Non demande';
        member.insurance = booleanFromValue(payload.insurance);
        member.cni = booleanFromValue(payload.cni);
        member.medicalCertificate = booleanFromValue(payload.medicalCertificate);
        member.injury = payload.injury || '';
        if (typeof payload.photo === 'string') {
            member.photo = payload.photo;
        }
        if (payload.photo === '') {
            member.photo = '';
        }
        if (payload.photoName) {
            member.photoName = payload.photoName;
        }
        if (payload.photo && !payload.photoName) {
            member.photoName = member.photoName || 'photo.png';
        }
        member.passSportReference = payload.passSportReference || '';
        member.assuranceReference = payload.assuranceReference || '';
        const totals = computePaymentTotals(member.passSportAmount, state.paymentDrafts);
        member.payments = clonePayments(state.paymentDrafts);
        member.totalPaid = totals.totalPaid;
        member.remaining = totals.remaining;
        member.totalDue = totals.totalDue;
        state.paymentTotals = totals;
        member.role = payload.role || '';
        member.username = payload.username || '';
        member.password = payload.password || '';
        member.updatedAt = new Date().toISOString();

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

        state.selectedMember = member;
        persistMembers();
        populateDetail(member);
        setFormDisabled(true);
        state.editMode = false;
        showFeedback('Fiche adhérent mise à jour avec succès.');
    };

    const handleViewDetails = () => {
        const section = document.querySelector(selectors.detailSection);
        if (!section) {
            return;
        }
        section.scrollIntoView({ behavior: 'smooth' });
    };

    const handleCreateRequest = () => {
        window.location.href = `${getBasePath()}user.html#add-member`;
    };

    const bindEvents = () => {
        const searchForm = document.querySelector(selectors.searchForm);
        const refineForm = document.querySelector(selectors.refineForm);
        const toggleButton = document.querySelector(selectors.toggleEdit);
        const detailForm = document.querySelector(selectors.detailForm);
        const viewBtn = document.querySelector(selectors.viewButton);
        const createBtn = document.querySelector(selectors.createButton);
        const quitBtn = document.querySelector(selectors.quitButton);
        const openCreateBtn = document.querySelector(selectors.openCreate);
        const logoutBtn = document.querySelector(selectors.logout);
        const paymentAddButton = document.querySelector(selectors.paymentAddButton);
        const paymentForm = document.querySelector(selectors.paymentForm);
        const paymentCancel = document.querySelector(selectors.paymentCancel);
        const paymentList = document.querySelector(selectors.paymentList);
        const passSportField = detailForm?.elements?.namedItem('passSportAmount');
        const paymentCountField = detailForm?.elements?.namedItem('paymentCount');

        if (searchForm) {
            searchForm.addEventListener('submit', handleSearchSubmit);
        }
        if (refineForm) {
            refineForm.addEventListener('submit', handleRefineSubmit);
        }
        if (toggleButton) {
            toggleButton.addEventListener('click', handleToggleEdit);
        }
        if (detailForm) {
            detailForm.addEventListener('submit', handleDetailSubmit);
        }
        if (viewBtn) {
            viewBtn.addEventListener('click', handleViewDetails);
        }
        if (createBtn) {
            createBtn.addEventListener('click', handleCreateRequest);
        }
        if (quitBtn) {
            quitBtn.addEventListener('click', exitDetailView);
        }
        if (openCreateBtn) {
            openCreateBtn.addEventListener('click', handleCreateRequest);
        }
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                try {
                    localStorage.removeItem('qbbcSession');
                } catch (error) {
                    console.error('Logout error:', error);
                }
                window.location.href = `${getBasePath()}index.html`;
            });
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

        window.addEventListener('qbbc-members-updated', () => {
            const stored = getStoredMembers();
            if (stored && Array.isArray(stored)) {
                state.members = stored;
                if (state.selectedMember) {
                    const refreshed = state.members.find((item) => item.id === state.selectedMember.id);
                    if (refreshed) {
                        state.selectedMember = refreshed;
                        populateDetail(refreshed);
                    }
                }
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
    };

    const init = async () => {
        if (!ensureSession()) {
            return;
        }
        await loadMembers();
        bindEvents();
    };

    document.addEventListener('DOMContentLoaded', init);
})();
