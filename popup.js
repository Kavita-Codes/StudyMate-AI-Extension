// StudyMate AI - Popup Controller

document.addEventListener('DOMContentLoaded', () => {
    // Load and apply saved theme preference
    chrome.storage.sync.get({ theme: 'dark' }, (settings) => {
        if (settings.theme === 'light') {
            document.body.classList.add('light-theme');
        } else {
            document.body.classList.remove('light-theme');
        }
    });

    // State variables
    let detectedSelection = "";
    let activeAnalyzedText = ""; // Holds the text being analyzed for regenerate/follow-up
    let activeAction = "";       // Holds the action type for regenerate

    // DOM Elements
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabPanels = document.querySelectorAll('.tab-panel');
    const textSourceSelect = document.getElementById('text-source');
    const customTextWrapper = document.getElementById('custom-text-wrapper');
    const customTextInput = document.getElementById('custom-text-input');
    const selectionInfoBox = document.getElementById('selection-info-box');
    const selectionStatusText = document.getElementById('selection-status-text');
    
    const featureGroupSelect = document.getElementById('feature-group');
    const featureOptionSelect = document.getElementById('feature-option');
    const generateBtn = document.getElementById('generate-btn');
    
    // Tools DOM
    const toolNotes = document.getElementById('tool-notes');
    const toolFlashcards = document.getElementById('tool-flashcards');
    const toolQuiz = document.getElementById('tool-quiz');
    const cleanTextInput = document.getElementById('clean-text-input');
    const cleanCopyBtn = document.getElementById('clean-copy-btn');
    
    // Library DOM
    const highlightsContainer = document.getElementById('highlights-container');
    const clearHighlightsBtn = document.getElementById('clear-highlights-btn');
    
    // Result Slider DOM
    const resultViewer = document.getElementById('result-viewer');
    const closeResultBtn = document.getElementById('close-result-btn');
    const resultBadgeText = document.getElementById('result-badge-text');
    const resultContentBody = document.getElementById('result-content-body');
    const resultCopyBtn = document.getElementById('result-copy-btn');
    const resultSaveBtn = document.getElementById('result-save-btn');
    const resultRegenBtn = document.getElementById('result-regen-btn');
    const followUpInput = document.getElementById('follow-up-input');
    const followUpSubmitBtn = document.getElementById('follow-up-submit-btn');
    
    // Global Header Settings Gear
    const settingsBtn = document.getElementById('settings-btn');
    
    // Toast DOM
    const popupToast = document.getElementById('popup-toast');

    // ----------------------------------------------------
    // CONSTANTS & CONFIGURATIONS
    // ----------------------------------------------------
    const featureOptions = {
        summarize: [
            { value: "summary_short", label: "Short Summary" },
            { value: "summary_bullet", label: "Bullet Summary" },
            { value: "summary_keypoints", label: "Key Points" },
            { value: "summary_exam", label: "Exam Notes" },
            { value: "summary_linkedin", label: "LinkedIn Summary" }
        ],
        explain: [
            { value: "explain_simple", label: "Simple English" },
            { value: "explain_hinglish", label: "Hinglish" },
            { value: "explain_beginner", label: "Beginner" },
            { value: "explain_professional", label: "Professional" },
            { value: "explain_examples", label: "Real-life Examples" }
        ],
        translate: [
            { value: "translate_hindi", label: "Hindi" },
            { value: "translate_english", label: "English" },
            { value: "translate_french", label: "French" },
            { value: "translate_german", label: "German" },
            { value: "translate_japanese", label: "Japanese" }
        ]
    };

    // ----------------------------------------------------
    // INITIALIZATION & TAB SWITCHING
    // ----------------------------------------------------
    // Load options for chosen feature category
    function populateOptions(group) {
        featureOptionSelect.innerHTML = "";
        const options = featureOptions[group] || [];
        options.forEach(opt => {
            const el = document.createElement('option');
            el.value = opt.value;
            el.textContent = opt.label;
            featureOptionSelect.appendChild(el);
        });
    }

    populateOptions(featureGroupSelect.value);
    
    featureGroupSelect.addEventListener('change', (e) => {
        populateOptions(e.target.value);
    });

    // Tab switcher
    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            const targetTab = link.getAttribute('data-tab');
            
            // Toggle active link
            tabLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            // Toggle active panel
            tabPanels.forEach(p => p.classList.remove('active'));
            document.getElementById(targetTab).classList.add('active');
            
            // Refetch library if library tab is selected
            if (targetTab === 'tab-library') {
                loadHighlights();
            }
        });
    });

    // Open options page
    settingsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    // ----------------------------------------------------
    // DETECTION OF ACTIVE PAGE CONTEXT
    // ----------------------------------------------------
    // Query selection on current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab || !activeTab.id) return;
        
        // Prevent executing scripts on restricted chrome:// tabs
        if (activeTab.url && (activeTab.url.startsWith("chrome://") || activeTab.url.startsWith("https://chrome.google.com/webstore"))) {
            selectionStatusText.textContent = "Scripting restricted on this tab. Switch to 'Paste Custom Text'.";
            textSourceSelect.value = "custom";
            handleSourceChange();
            return;
        }

        chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: () => window.getSelection().toString()
        }, (results) => {
            if (results && results[0] && results[0].result && results[0].result.trim().length > 0) {
                detectedSelection = results[0].result.trim();
                textSourceSelect.value = "selection";
                selectionStatusText.innerHTML = `Selected text detected: <strong>${detectedSelection.length} chars</strong>.`;
            } else {
                detectedSelection = "";
                textSourceSelect.value = "page";
                selectionStatusText.textContent = "No text selected. Analyzing full article instead.";
            }
            handleSourceChange();
        });
    });

    // Source selection dropdown handler
    function handleSourceChange() {
        const val = textSourceSelect.value;
        if (val === 'custom') {
            customTextWrapper.classList.remove('hidden');
            selectionInfoBox.classList.add('hidden');
        } else {
            customTextWrapper.classList.add('hidden');
            selectionInfoBox.classList.remove('hidden');
        }
    }
    
    textSourceSelect.addEventListener('change', handleSourceChange);

    // Helper: Toast notifications
    function showToast(message, isError = false) {
        popupToast.textContent = message;
        if (isError) {
            popupToast.style.background = "rgba(239, 68, 68, 0.9)";
        } else {
            popupToast.style.background = "rgba(30, 41, 59, 0.9)";
        }
        popupToast.classList.remove('hidden');
        setTimeout(() => {
            popupToast.classList.add('hidden');
        }, 2200);
    }

    // ----------------------------------------------------
    // TEXT GENERATION CONTROLLERS
    // ----------------------------------------------------
    // Markdown-to-HTML parser (matches content.js)
    function parseMarkdown(text) {
        if (!text) return "";
        let html = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
            
        html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        const lines = html.split('\n');
        let inList = false;
        let resultLines = [];
        
        for (let line of lines) {
            const trimmed = line.trim();
            const bulletMatch = trimmed.match(/^[-*+]\s+(.*)$/);
            
            if (bulletMatch) {
                if (!inList) {
                    resultLines.push('<ul>');
                    inList = true;
                }
                resultLines.push(`<li>${bulletMatch[1]}</li>`);
            } else {
                if (inList) {
                    resultLines.push('</ul>');
                    inList = false;
                }
                
                if (trimmed) {
                    if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<li')) {
                        resultLines.push(line);
                    } else {
                        resultLines.push(`<p>${line}</p>`);
                    }
                } else {
                    resultLines.push('<br/>');
                }
            }
        }
        if (inList) resultLines.push('</ul>');
        return resultLines.join('\n');
    }

    // Trigger loading spinner in Result View
    function showResultLoading(badgeText) {
        resultBadgeText.textContent = badgeText.replace(/_/g, ' ').toUpperCase();
        resultContentBody.innerHTML = `
            <div class="result-loader-container">
                <div class="result-spinner"></div>
                <p>Generating insights...</p>
            </div>
        `;
        resultViewer.classList.remove('hidden');
        // Hide control buttons during load
        resultCopyBtn.classList.add('hidden');
        resultSaveBtn.classList.add('hidden');
        resultRegenBtn.classList.add('hidden');
    }

    // Render output or error in Result View
    function showResultOutput(content, isSuccess = true) {
        if (isSuccess) {
            resultContentBody.innerHTML = `
                <div class="markdown-body">${parseMarkdown(content)}</div>
            `;
            resultCopyBtn.classList.remove('hidden');
            resultSaveBtn.classList.remove('hidden');
            resultRegenBtn.classList.remove('hidden');
        } else {
            resultContentBody.innerHTML = `
                <div class="result-error-box">
                    <strong>Generation Failed</strong>
                    <p>${content}</p>
                </div>
            `;
            resultCopyBtn.classList.add('hidden');
            resultSaveBtn.classList.add('hidden');
            resultRegenBtn.classList.remove('hidden');
        }
    }

    // Unified helper to extract relevant text source
    function getSelectedTextSource(callback) {
        const sourceVal = textSourceSelect.value;
        
        if (sourceVal === 'custom') {
            const customVal = customTextInput.value.trim();
            if (!customVal) {
                showToast("Please enter some text in the textarea first.", true);
                return;
            }
            callback(customVal);
        } else if (sourceVal === 'selection') {
            if (!detectedSelection) {
                showToast("No selection found. Select text or choose another source.", true);
                return;
            }
            callback(detectedSelection);
        } else {
            // Full article page extraction
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const activeTab = tabs[0];
                if (!activeTab || !activeTab.id) {
                    showToast("Could not locate active page.", true);
                    return;
                }
                
                showToast("Extracting full page text...");
                chrome.tabs.sendMessage(activeTab.id, { type: "GET_ARTICLE_TEXT" }, (response) => {
                    if (chrome.runtime.lastError || !response || !response.text) {
                        showToast("Failed to extract page text. Check if page is loaded.", true);
                        return;
                    }
                    callback(response.text);
                });
            });
        }
    }

    // Execute AI pipeline call
    function runAIGeneration(text, action, customPrompt = "") {
        activeAnalyzedText = text;
        activeAction = action;
        
        showResultLoading(action);
        
        chrome.runtime.sendMessage({
            type: "GENERATE_AI",
            text: text,
            action: action,
            customPrompt: customPrompt
        }, (response) => {
            if (response && response.success) {
                showResultOutput(response.result, true);
            } else {
                showResultOutput(response?.error || "Unknown AI error occurred.", false);
            }
        });
    }

    // Click Analyze button trigger
    generateBtn.addEventListener('click', () => {
        getSelectedTextSource((text) => {
            const action = featureOptionSelect.value;
            runAIGeneration(text, action);
        });
    });

    // ----------------------------------------------------
    // STUDY TOOLS & COPY CLEAN IMPLEMENTATIONS
    // ----------------------------------------------------
    toolNotes.addEventListener('click', () => {
        getSelectedTextSource((text) => {
            runAIGeneration(text, "generate_notes");
        });
    });

    toolFlashcards.addEventListener('click', () => {
        getSelectedTextSource((text) => {
            runAIGeneration(text, "generate_flashcards");
        });
    });

    toolQuiz.addEventListener('click', () => {
        getSelectedTextSource((text) => {
            runAIGeneration(text, "generate_quiz");
        });
    });

    // Copy clean logic
    cleanCopyBtn.addEventListener('click', () => {
        const input = cleanTextInput.value;
        if (!input.trim()) {
            showToast("Enter messy text first.", true);
            return;
        }
        
        // Remove duplicate spaces, tab spaces, and excess line breaks
        const cleaned = input
            .replace(/[ \t]+/g, ' ')           // Collapse horizontal space
            .replace(/\s*\n\s*/g, '\n')        // Collapse whitespace around newlines
            .replace(/\n{3,}/g, '\n\n')        // Limit breaks to maximum double newline
            .trim();
            
        navigator.clipboard.writeText(cleaned).then(() => {
            cleanTextInput.value = cleaned;
            showToast("Cleaned text copied!");
        }).catch(() => {
            showToast("Failed to copy cleaned text.", true);
        });
    });

    // ----------------------------------------------------
    // SAVED LIBRARY CONTROLS
    // ----------------------------------------------------
    function loadHighlights() {
        highlightsContainer.innerHTML = "";
        
        chrome.storage.local.get({ highlights: [] }, (result) => {
            const highlights = result.highlights;
            if (highlights.length === 0) {
                highlightsContainer.innerHTML = `
                    <div class="empty-state">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:#6b7280"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                        <p>No highlights saved yet. Highlight page text and select "Save Highlight" from right-click menu!</p>
                    </div>
                `;
                return;
            }
            
            // Sort by timestamp descending
            highlights.sort((a,b) => b.timestamp - a.timestamp);
            
            highlights.forEach((h, index) => {
                const date = new Date(h.timestamp).toLocaleDateString(undefined, {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                });
                
                const card = document.createElement('div');
                card.className = 'highlight-card';
                card.innerHTML = `
                    <div class="hl-text">"${h.text}"</div>
                    <div class="hl-meta">
                        <span class="hl-source" title="${h.url}">${h.title || 'Saved Item'}</span>
                        <span class="hl-date">${date}</span>
                    </div>
                    <div class="hl-actions">
                        <button class="hl-action-btn hl-explain-btn" data-index="${index}">Explain</button>
                        <button class="hl-action-btn hl-copy-btn" data-index="${index}">Copy</button>
                        <button class="hl-action-btn hl-delete-btn" data-index="${index}">Delete</button>
                    </div>
                `;
                highlightsContainer.appendChild(card);
                
                // Explain trigger on highlight
                card.querySelector('.hl-explain-btn').addEventListener('click', () => {
                    runAIGeneration(h.text, "explain_simple");
                });
                
                // Copy trigger on highlight
                card.querySelector('.hl-copy-btn').addEventListener('click', () => {
                    navigator.clipboard.writeText(h.text).then(() => {
                        showToast("Highlight copied!");
                    });
                });
                
                // Delete trigger on highlight
                card.querySelector('.hl-delete-btn').addEventListener('click', () => {
                    deleteHighlight(index);
                });
            });
        });
    }

    function deleteHighlight(index) {
        chrome.storage.local.get({ highlights: [] }, (result) => {
            const highlights = result.highlights;
            // Sort to match order of index rendered
            highlights.sort((a,b) => b.timestamp - a.timestamp);
            highlights.splice(index, 1);
            
            chrome.storage.local.set({ highlights }, () => {
                showToast("Highlight deleted.");
                loadHighlights();
            });
        });
    }

    clearHighlightsBtn.addEventListener('click', () => {
        if (confirm("Are you sure you want to clear all saved highlights?")) {
            chrome.storage.local.set({ highlights: [] }, () => {
                showToast("All highlights cleared.");
                loadHighlights();
            });
        }
    });

    // ----------------------------------------------------
    // RESULT ACTIONS (SLIDER PANEL CONTROLS)
    // ----------------------------------------------------
    closeResultBtn.addEventListener('click', () => {
        resultViewer.classList.add('hidden');
        // Clear follow-up inputs
        followUpInput.value = "";
    });

    // Copy result text
    resultCopyBtn.addEventListener('click', () => {
        const textEl = resultContentBody.querySelector('.markdown-body');
        if (!textEl) return;
        
        navigator.clipboard.writeText(textEl.innerText).then(() => {
            showToast("Result copied!");
        }).catch(() => {
            showToast("Failed to copy.", true);
        });
    });

    // Save analyzed source text as highlight
    resultSaveBtn.addEventListener('click', () => {
        if (!activeAnalyzedText) return;
        
        chrome.storage.local.get({ highlights: [] }, (result) => {
            const highlights = result.highlights;
            const exists = highlights.some(h => h.text.trim() === activeAnalyzedText.trim());
            
            if (!exists) {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    const activeTab = tabs[0];
                    highlights.push({
                        text: activeAnalyzedText,
                        url: activeTab ? activeTab.url : "",
                        title: activeTab ? activeTab.title : "StudyMate AI",
                        timestamp: Date.now()
                    });
                    
                    chrome.storage.local.set({ highlights }, () => {
                        showToast("Highlight saved to library!");
                    });
                });
            } else {
                showToast("Already saved to library.");
            }
        });
    });

    // Regenerate action
    resultRegenBtn.addEventListener('click', () => {
        if (!activeAnalyzedText || !activeAction) return;
        runAIGeneration(activeAnalyzedText, activeAction);
    });

    // Interactive Ask AI follow-up inside result screen
    const submitFollowUp = () => {
        const question = followUpInput.value.trim();
        if (!question || !activeAnalyzedText) return;
        followUpInput.value = "";
        
        // Re-use current active text for follow-up context
        runAIGeneration(activeAnalyzedText, "ask_ai", question);
    };

    followUpInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitFollowUp();
    });
    
    followUpSubmitBtn.addEventListener('click', submitFollowUp);
});