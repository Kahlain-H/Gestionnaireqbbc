'use strict';

// Handles interactive behaviours for the stock management page
const StockApp = (() => {
    const stockSelectors = {
        tableBody: '[data-stock-body]',
        searchInput: '[data-stock-search]',
        statusFilter: '[data-stock-filter]',
    };

    const dataFiles = {
        stock: 'stock.json',
    };

    const state = {
        stock: [],
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

    const loadStock = async () => {
        const response = await fetch(getDataUrl(dataFiles.stock), { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Fetch status ${response.status}`);
        }
        return response.json();
    };

    const formatNumber = (value) => new Intl.NumberFormat('fr-FR').format(Number(value) || 0);

    const formatCurrency = (value) => {
        if (value == null || value === '') {
            return '--';
        }
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 2,
        }).format(Number(value) || 0);
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

    const renderStockTable = async () => {
        const tableBody = document.querySelector(stockSelectors.tableBody);
        if (!tableBody) {
            return;
        }

        if (!state.stock.length) {
            state.stock = await loadStock();
        }

        const searchInput = document.querySelector(stockSelectors.searchInput);
        const statusFilter = document.querySelector(stockSelectors.statusFilter);

        const statusLabels = {
            available: 'En stock',
            ordered: 'Command\u00E9',
            out: 'Rupture',
        };

        const buildRows = (items) => items.map((item) => {
            const quantity = Number(item.quantity) || 0;
            const threshold = Number(item.alertThreshold) || 0;
            const isAlert = quantity <= threshold;
            const statusKey = (item.status || '').toLowerCase();
            const statusLabel = statusLabels[statusKey] || statusLabels.available;
            const badgeClass = statusKey === 'out' ? 'badges badge-alert' : 'badges';

            return `
                <tr data-alert="${isAlert}">
                    <td>${item.product || '--'}</td>
                    <td>${item.category || '--'}</td>
                    <td>${formatNumber(quantity)}</td>
                    <td>${formatNumber(threshold)}</td>
                    <td>${formatCurrency(item.unitPrice)}</td>
                    <td>${formatDate(item.purchaseDate)}</td>
                    <td>${item.supplier || '--'}</td>
                    <td><span class="${badgeClass}">${statusLabel}</span></td>
                </tr>
            `.trim();
        }).join('');

        const applyFilters = () => {
            let filtered = [...state.stock];
            const searchValue = searchInput?.value.trim().toLowerCase();
            if (searchValue) {
                filtered = filtered.filter((item) => {
                    return [item.product, item.category, item.supplier]
                        .filter(Boolean)
                        .some((field) => field.toLowerCase().includes(searchValue));
                });
            }

            const statusValue = statusFilter?.value;
            if (statusValue && statusValue !== 'all') {
                filtered = filtered.filter((item) => (item.status || '').toLowerCase() === statusValue);
            }

            if (!filtered.length) {
                tableBody.innerHTML = '<tr><td colspan="8">Aucun produit ne correspond aux crit\u00E8res.</td></tr>';
                return;
            }

            tableBody.innerHTML = buildRows(filtered);
        };

        const bindControl = (element, eventName) => {
            if (!element || element.dataset.bound === 'true') {
                return;
            }
            element.addEventListener(eventName, applyFilters);
            element.dataset.bound = 'true';
        };

        bindControl(searchInput, 'input');
        bindControl(statusFilter, 'change');

        applyFilters();
    };

    const ensureSession = () => {
        const sessionRaw = localStorage.getItem('qbbcSession');
        if (!sessionRaw) {
            redirectToLogin();
            return false;
        }
        return true;
    };

    const initStockPage = () => {
        const stockPage = document.querySelector('.stock-page');
        if (!stockPage) {
            return;
        }

        if (!ensureSession()) {
            return;
        }

        renderStockTable().catch((error) => {
            console.error('Stock table error:', error);
        });
    };

    const init = () => {
        initStockPage();
    };

    return { init };
})();

document.addEventListener('DOMContentLoaded', StockApp.init);
