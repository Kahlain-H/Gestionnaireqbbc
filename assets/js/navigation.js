'use strict';

(() => {
    const getBasePath = () => {
        const base = document.body?.dataset.basePath || './';
        return base.endsWith('/') ? base : `${base}/`;
    };

    const fallbackTarget = () => `${getBasePath()}index.html`;

    const handleBack = () => {
        try {
            if (window.history.length > 1) {
                window.history.back();
                return;
            }
        } catch (error) {
            console.error('History navigation error:', error);
        }
        window.location.href = fallbackTarget();
    };

    const init = () => {
        const buttons = document.querySelectorAll('[data-action="go-back"]');
        buttons.forEach((button) => {
            button.addEventListener('click', handleBack);
        });
    };

    document.addEventListener('DOMContentLoaded', init);
})();
