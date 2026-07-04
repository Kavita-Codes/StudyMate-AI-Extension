// StudyMate AI - Options Page Controller

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const apiKeyInput = document.getElementById('api-key');
    const toggleApiKeyBtn = document.getElementById('toggle-api-key');
    const modelSelect = document.getElementById('model-select');
    const customModelWrapper = document.getElementById('custom-model-wrapper');
    const customModelInput = document.getElementById('custom-model-input');
    const languageSelect = document.getElementById('language-select');
    const summaryLengthSelect = document.getElementById('summary-length-select');
    const themeSelect = document.getElementById('theme-select');
    const saveButton = document.getElementById('save-button');
    const successMessage = document.getElementById('success-message');

    // 1. Load saved settings from chrome.storage.sync
    chrome.storage.sync.get({
        geminiApiKey: '',
        model: 'gemini-2.5-flash',
        language: 'English',
        summaryLength: 'summary_short',
        theme: 'dark'
    }, (settings) => {
        apiKeyInput.value = settings.geminiApiKey;
        
        // Check if the loaded model is a standard option or custom
        const standardModels = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash-8b'];
        if (standardModels.includes(settings.model)) {
            modelSelect.value = settings.model;
            customModelWrapper.classList.add('hidden');
        } else {
            modelSelect.value = 'custom';
            customModelInput.value = settings.model;
            customModelWrapper.classList.remove('hidden');
        }
        
        languageSelect.value = settings.language;
        summaryLengthSelect.value = settings.summaryLength;
        themeSelect.value = settings.theme;
        
        // Apply theme to the options page body
        applyTheme(settings.theme);
    });

    // 2. Toggle password field visibility
    toggleApiKeyBtn.addEventListener('click', () => {
        const currentType = apiKeyInput.getAttribute('type');
        if (currentType === 'password') {
            apiKeyInput.setAttribute('type', 'text');
            toggleApiKeyBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
            `;
        } else {
            apiKeyInput.setAttribute('type', 'password');
            toggleApiKeyBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            `;
        }
    });

    // Toggle custom model input on model dropdown change
    modelSelect.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
            customModelWrapper.classList.remove('hidden');
        } else {
            customModelWrapper.classList.add('hidden');
        }
    });

    // 3. Theme live preview on change
    themeSelect.addEventListener('change', (e) => {
        applyTheme(e.target.value);
    });

    function applyTheme(theme) {
        if (theme === 'light') {
            document.body.classList.add('light-theme');
        } else {
            document.body.classList.remove('light-theme');
        }
    }

    // 4. Save settings to chrome.storage.sync
    saveButton.addEventListener('click', () => {
        const geminiApiKey = apiKeyInput.value.trim();
        let model = modelSelect.value;
        if (model === 'custom') {
            model = customModelInput.value.trim();
            if (!model) {
                alert("Please enter a custom model name.");
                return;
            }
        }
        
        const language = languageSelect.value;
        const summaryLength = summaryLengthSelect.value;
        const theme = themeSelect.value;

        chrome.storage.sync.set({
            geminiApiKey,
            model,
            language,
            summaryLength,
            theme
        }, () => {
            // Show feedback success text
            successMessage.classList.remove('hidden');
            
            // Auto hide success text
            setTimeout(() => {
                successMessage.classList.add('hidden');
            }, 3000);
        });
    });
});