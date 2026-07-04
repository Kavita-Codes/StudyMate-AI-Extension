// StudyMate AI - Content Script

// ----------------------------------------------------
// CORE UTILITIES & TEXT EXTRACTION
// ----------------------------------------------------
function getArticleText() {
    // List of selectors representing main content areas (ordered by priority)
    const mainSelectors = [
        "article",
        "main",
        "[role='main']",
        "#main-content",
        ".main-content",
        "#content",
        ".content",
        "#main",
        ".main",
        "#post-body",
        ".post-body"
    ];
    
    for (const selector of mainSelectors) {
        const el = document.querySelector(selector);
        if (el) {
            const text = el.innerText.trim();
            if (text.length > 100) {
                return text;
            }
        }
    }

    // Fallback: collect structural text elements
    const structuralSelectors = [
        "h1", "h2", "h3", "h4", "h5", "h6",
        "p", "li", "blockquote", "pre", "code"
    ];
    const elements = Array.from(document.querySelectorAll(structuralSelectors.join(",")));
    
    const textBlocks = elements
        .filter(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && el.innerText.trim().length > 0;
        })
        .map(el => el.innerText.trim());
        
    if (textBlocks.length > 0) {
        return textBlocks.join("\n\n");
    }

    // Absolute fallback
    return document.body.innerText.trim();
}

// ----------------------------------------------------
// PAGE HIGHLIGHTER UTILITIES
// ----------------------------------------------------
function highlightTextOnPage(text) {
    if (!text || !text.trim()) return;
    highlightTextNode(document.body, text);
}

function highlightTextNode(root, textToHighlight) {
    if (!root || !textToHighlight || !textToHighlight.trim()) return;
    
    const normalizedTarget = textToHighlight.replace(/\s+/g, ' ').trim();
    if (!normalizedTarget) return;

    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                const parent = node.parentNode;
                if (!parent) return NodeFilter.FILTER_REJECT;
                const tag = parent.tagName.toLowerCase();
                if (tag === 'script' || tag === 'style' || tag === 'textarea' || tag === 'noscript' || tag === 'mark') {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const nodesToReplace = [];
    let currentNode;
    while (currentNode = walker.nextNode()) {
        const nodeText = currentNode.nodeValue;
        const normalizedNodeText = nodeText.replace(/\s+/g, ' ');
        
        if (normalizedNodeText.includes(normalizedTarget)) {
            nodesToReplace.push({ node: currentNode, text: nodeText });
        }
    }

    for (const item of nodesToReplace) {
        const node = item.node;
        const nodeText = item.text;
        const index = nodeText.replace(/\s+/g, ' ').indexOf(normalizedTarget);
        
        let rawIndex = -1;
        let matchLength = 0;
        
        for (let i = 0; i < nodeText.length; i++) {
            const sub = nodeText.slice(i).replace(/\s+/g, ' ');
            if (sub.startsWith(normalizedTarget)) {
                rawIndex = i;
                let targetWords = normalizedTarget.split(' ');
                let wordIdx = 0;
                let j = i;
                while (wordIdx < targetWords.length && j < nodeText.length) {
                    while (j < nodeText.length && /\s/.test(nodeText[j])) j++;
                    let word = targetWords[wordIdx];
                    let wordMatch = true;
                    for (let k = 0; k < word.length; k++) {
                        if (nodeText[j + k] !== word[k]) {
                            wordMatch = false;
                            break;
                        }
                    }
                    if (wordMatch) {
                        j += word.length;
                        wordIdx++;
                    } else {
                        break;
                    }
                }
                matchLength = j - i;
                break;
            }
        }

        if (rawIndex !== -1 && matchLength > 0) {
            const parent = node.parentNode;
            if (!parent) continue;
            
            const before = nodeText.substring(0, rawIndex);
            const match = nodeText.substring(rawIndex, rawIndex + matchLength);
            const after = nodeText.substring(rawIndex + matchLength);
            
            const fragment = document.createDocumentFragment();
            
            if (before) {
                fragment.appendChild(document.createTextNode(before));
            }
            
            const mark = document.createElement('mark');
            mark.className = 'studymate-page-highlight';
            mark.style.background = 'rgba(234, 179, 8, 0.35)';
            mark.style.borderBottom = '2px solid rgba(234, 179, 8, 0.8)';
            mark.style.color = 'inherit';
            mark.style.borderRadius = '3px';
            mark.style.padding = '1px 3px';
            mark.style.margin = '0 1px';
            mark.textContent = match;
            fragment.appendChild(mark);
            
            if (after) {
                fragment.appendChild(document.createTextNode(after));
            }
            
            parent.replaceChild(fragment, node);
        }
    }
}

function restorePageHighlights() {
    chrome.storage.local.get({ highlights: [] }, (result) => {
        const currentUrl = window.location.href;
        const pageHighlights = result.highlights.filter(h => h.url === currentUrl);
        pageHighlights.forEach(h => {
            highlightTextOnPage(h.text);
        });
    });
}

// Restore highlights on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restorePageHighlights);
} else {
    restorePageHighlights();
}

// Simple Markdown parser to render clean structured HTML in the overlay
function parseMarkdown(text) {
    if (!text) return "";
    
    // Escape HTML special characters
    let html = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
        
    // Headers
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
    
    // Bold: **text**
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic: *text*
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Inline code: `code`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Split into lines to parse lists and paragraphs
    const lines = html.split('\n');
    let inList = false;
    let resultLines = [];
    
    for (let line of lines) {
        const trimmed = line.trim();
        // Check for bullet list (-, *, +)
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
                // If it already looks like an HTML block (headers, lists), don't wrap in p tag
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
    if (inList) {
        resultLines.push('</ul>');
    }
    
    return resultLines.join('\n');
}

// ----------------------------------------------------
// TOAST NOTIFICATIONS
// ----------------------------------------------------
function showToast(message) {
    let style = document.getElementById('studymate-toast-styles');
    if (!style) {
        style = document.createElement('style');
        style.id = 'studymate-toast-styles';
        style.innerHTML = `
            .studymate-toast {
                position: fixed;
                bottom: 24px;
                right: 24px;
                background: rgba(30, 30, 35, 0.95);
                backdrop-filter: blur(12px);
                color: #ffffff;
                padding: 12px 24px;
                border-radius: 12px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                border: 1px solid rgba(255,255,255,0.15);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 14px;
                font-weight: 500;
                z-index: 2147483647;
                opacity: 0;
                transform: translateY(20px) scale(0.95);
                transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .studymate-toast.visible {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        `;
        document.head.appendChild(style);
    }
    
    const toast = document.createElement('div');
    toast.className = 'studymate-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Trigger transition
    setTimeout(() => toast.classList.add('visible'), 20);
    
    // Auto-remove toast
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 350);
    }, 3000);
}

// ----------------------------------------------------
// SHADOW DOM OVERLAY COMPONENT
// ----------------------------------------------------
let overlayContainer = null;
let currentSelection = "";
let currentAction = "";

function createOverlay(initialAction, initialSelection) {
    currentSelection = initialSelection || "";
    currentAction = initialAction || "";
    
    if (overlayContainer) {
        updateOverlayState(initialAction, initialSelection);
        return;
    }
    
    overlayContainer = document.createElement('div');
    overlayContainer.id = 'studymate-overlay-root';
    overlayContainer.style.position = 'fixed';
    overlayContainer.style.top = '80px';
    overlayContainer.style.right = '30px';
    overlayContainer.style.zIndex = '2147483646';
    
    const shadow = overlayContainer.attachShadow({ mode: 'open' });
    
    // Injection of modern CSS styles directly inside Shadow DOM
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        :host {
            all: initial;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        * {
            box-sizing: border-box;
        }
        .overlay-card {
            width: 380px;
            background: rgba(23, 23, 27, 0.85);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 18px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
            color: #f3f4f6;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            font-size: 14px;
            line-height: 1.6;
            transition: height 0.3s ease;
        }
        
        /* Drag Header */
        .card-header {
            padding: 14px 18px;
            background: rgba(255, 255, 255, 0.04);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: move;
            user-select: none;
        }
        .header-title {
            font-weight: 700;
            font-size: 15px;
            letter-spacing: 0.5px;
            background: linear-gradient(135deg, #a5b4fc 0%, #818cf8 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .close-btn {
            background: transparent;
            border: none;
            color: #9ca3af;
            font-size: 20px;
            cursor: pointer;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: all 0.2s;
        }
        .close-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
        }
        
        /* Card Body */
        .card-body {
            padding: 16px 18px;
            display: flex;
            flex-direction: column;
            max-height: 480px;
            overflow-y: auto;
        }
        
        /* Custom Scrollbar */
        .card-body::-webkit-scrollbar {
            width: 6px;
        }
        .card-body::-webkit-scrollbar-track {
            background: transparent;
        }
        .card-body::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.15);
            border-radius: 4px;
        }
        .card-body::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        .action-badge {
            align-self: flex-start;
            padding: 3px 8px;
            background: rgba(129, 140, 248, 0.15);
            border: 1px solid rgba(129, 140, 248, 0.3);
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            color: #a5b4fc;
            margin-bottom: 12px;
            letter-spacing: 0.5px;
        }
        
        .selected-text-preview {
            font-size: 12px;
            color: #9ca3af;
            background: rgba(0, 0, 0, 0.2);
            padding: 8px 12px;
            border-radius: 8px;
            border-left: 3px solid #818cf8;
            margin-bottom: 16px;
            max-height: 60px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        /* Output & Loader */
        .output-container {
            flex-grow: 1;
            min-height: 100px;
            margin-bottom: 16px;
        }
        
        .output-text {
            color: #e5e7eb;
        }
        .output-text p {
            margin: 0 0 10px 0;
        }
        .output-text p:last-child {
            margin-bottom: 0;
        }
        .output-text ul, .output-text ol {
            margin: 0 0 10px 0;
            padding-left: 20px;
        }
        .output-text li {
            margin-bottom: 5px;
        }
        .output-text h3 {
            font-size: 15px;
            margin: 14px 0 6px 0;
            color: #ffffff;
            font-weight: 600;
        }
        .output-text code {
            font-family: monospace;
            background: rgba(255,255,255,0.08);
            padding: 2px 4px;
            border-radius: 4px;
            font-size: 13px;
        }
        
        /* Loader Animation */
        .loader-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 24px 0;
            gap: 12px;
            color: #9ca3af;
        }
        .spinner {
            width: 28px;
            height: 28px;
            border: 3px solid rgba(255, 255, 255, 0.1);
            border-top-color: #818cf8;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .error-message {
            color: #f87171;
            background: rgba(248, 113, 113, 0.08);
            border: 1px solid rgba(248, 113, 113, 0.2);
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 13px;
        }
        
        /* Ask AI / Input Box */
        .interactive-section {
            display: flex;
            gap: 8px;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            padding: 4px 8px;
            align-items: center;
            margin-top: 8px;
        }
        .interactive-section input {
            flex-grow: 1;
            background: transparent;
            border: none;
            outline: none;
            color: #ffffff;
            padding: 8px 4px;
            font-size: 13px;
        }
        .interactive-section input::placeholder {
            color: #6b7280;
        }
        .interactive-section button {
            background: #818cf8;
            border: none;
            border-radius: 8px;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background 0.2s;
        }
        .interactive-section button:hover {
            background: #6366f1;
        }
        .send-icon {
            width: 14px;
            height: 14px;
            fill: #ffffff;
        }
        
        /* Footer Controls */
        .card-footer {
            padding: 12px 18px;
            background: rgba(0, 0, 0, 0.25);
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }
        .footer-btn {
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #d1d5db;
            padding: 6px 12px;
            border-radius: 8px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .footer-btn:hover {
            background: rgba(255, 255, 255, 0.12);
            color: #ffffff;
            border-color: rgba(255, 255, 255, 0.2);
        }
        .footer-btn.primary {
            background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
            border: none;
            color: #ffffff;
            font-weight: 500;
        }
        .footer-btn.primary:hover {
            background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
        }
        
        .hidden {
            display: none !important;
        }
    `;
    
    // HTML structure inside shadow root
    const cardEl = document.createElement('div');
    cardEl.className = 'overlay-card';
    cardEl.id = 'studymate-card';
    cardEl.innerHTML = `
        <div class="card-header" id="studymate-header">
            <div class="header-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                StudyMate AI
            </div>
            <button class="close-btn" id="studymate-close">&times;</button>
        </div>
        <div class="card-body">
            <div class="action-badge" id="studymate-badge">Action</div>
            <div class="selected-text-preview" id="studymate-preview"></div>
            
            <div class="output-container" id="studymate-output">
                <!-- Swapped in by JS -->
            </div>
            
            <div class="interactive-section" id="studymate-ask-section">
                <input type="text" placeholder="Ask follow-up or custom question..." id="studymate-ask-input" />
                <button id="studymate-ask-submit" title="Send Question">
                    <svg viewBox="0 0 24 24" class="send-icon"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
            </div>
        </div>
        <div class="card-footer" id="studymate-footer">
            <button class="footer-btn" id="studymate-copy">Copy</button>
            <button class="footer-btn" id="studymate-save">Save Highlight</button>
            <button class="footer-btn" id="studymate-regen">Regenerate</button>
        </div>
    `;
    
    shadow.appendChild(styleEl);
    shadow.appendChild(cardEl);
    document.body.appendChild(overlayContainer);
    
    // Add event listeners inside shadow DOM
    shadow.getElementById('studymate-close').addEventListener('click', closeOverlay);
    shadow.getElementById('studymate-copy').addEventListener('click', copyOverlayContent);
    shadow.getElementById('studymate-save').addEventListener('click', saveOverlayHighlight);
    shadow.getElementById('studymate-regen').addEventListener('click', regenerateOverlayContent);
    
    // Input submit handling
    const askInput = shadow.getElementById('studymate-ask-input');
    const askSubmit = shadow.getElementById('studymate-ask-submit');
    
    const submitCustomQuestion = () => {
        const question = askInput.value.trim();
        if (!question) return;
        askInput.value = "";
        
        currentAction = "ask_ai";
        updateOverlayState("ask_ai", currentSelection, "loading");
        
        chrome.runtime.sendMessage({
            type: "GENERATE_AI",
            text: currentSelection,
            action: "ask_ai",
            customPrompt: question
        }, (response) => {
            if (response && response.success) {
                updateOverlayState("ask_ai", currentSelection, "success", response.result);
            } else {
                updateOverlayState("ask_ai", currentSelection, "error", response?.error || "AI call failed.");
            }
        });
    };
    
    askInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitCustomQuestion();
    });
    askSubmit.addEventListener('click', submitCustomQuestion);
    
    // Make overlay draggable
    const header = shadow.getElementById('studymate-header');
    makeDraggable(overlayContainer, header);
    
    updateOverlayState(initialAction, initialSelection, "loading");
}

function updateOverlayState(action, selection, state = "loading", content = "") {
    if (!overlayContainer) return;
    
    const shadow = overlayContainer.shadowRoot;
    currentAction = action;
    currentSelection = selection;
    
    // Update Badge
    const badge = shadow.getElementById('studymate-badge');
    badge.textContent = action.replace(/_/g, ' ');
    
    // Update Preview
    const preview = shadow.getElementById('studymate-preview');
    preview.textContent = `"${selection}"`;
    
    // Update Content
    const outputContainer = shadow.getElementById('studymate-output');
    
    if (state === "loading") {
        outputContainer.innerHTML = `
            <div class="loader-container">
                <div class="spinner"></div>
                <div>StudyMate is thinking...</div>
            </div>
        `;
        shadow.getElementById('studymate-footer').classList.add('hidden');
    } else if (state === "error") {
        outputContainer.innerHTML = `
            <div class="error-message">
                <strong>Error:</strong> ${content}
            </div>
        `;
        shadow.getElementById('studymate-footer').classList.remove('hidden');
    } else {
        // Success
        outputContainer.innerHTML = `
            <div class="output-text" id="studymate-output-text">
                ${parseMarkdown(content)}
            </div>
        `;
        shadow.getElementById('studymate-footer').classList.remove('hidden');
    }
}

function closeOverlay() {
    if (overlayContainer) {
        overlayContainer.remove();
        overlayContainer = null;
    }
}

function copyOverlayContent() {
    if (!overlayContainer) return;
    const shadow = overlayContainer.shadowRoot;
    const textEl = shadow.getElementById('studymate-output-text');
    if (!textEl) return;
    
    // Use innerText to fetch only text content, preserving lists/line breaks
    const text = textEl.innerText;
    navigator.clipboard.writeText(text).then(() => {
        showToast("Output copied to clipboard!");
    }).catch(err => {
        console.error("Failed to copy:", err);
        showToast("Failed to copy content.");
    });
}

function saveOverlayHighlight() {
    if (!currentSelection) return;
    
    chrome.runtime.sendMessage({
        type: "SAVE_HIGHLIGHT_DIRECT",
        text: currentSelection,
        url: window.location.href,
        title: document.title
    }, (response) => {
        if (response && response.success) {
            showToast("Highlight saved locally!");
        } else {
            showToast(response?.error || "Highlight is already saved.");
        }
    });
}

function regenerateOverlayContent() {
    if (!currentSelection) return;
    
    updateOverlayState(currentAction, currentSelection, "loading");
    
    chrome.runtime.sendMessage({
        type: "GENERATE_AI",
        text: currentSelection,
        action: currentAction
    }, (response) => {
        if (response && response.success) {
            updateOverlayState(currentAction, currentSelection, "success", response.result);
        } else {
            updateOverlayState(currentAction, currentSelection, "error", response?.error || "AI call failed.");
        }
    });
}

// Draggable Helper
function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e = e || window.event;
        // Check if user clicked on button inside header (e.g. close button)
        if (e.target.closest('button')) return;
        
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        // Calculate new top and left position
        const newTop = element.offsetTop - pos2;
        const newLeft = element.offsetLeft - pos1;
        
        element.style.top = newTop + "px";
        element.style.left = newLeft + "px";
        element.style.right = "auto"; // Unlock right positioning
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

// ----------------------------------------------------
// RUNTIME MESSAGE LISTENERS
// ----------------------------------------------------
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.type === "GET_ARTICLE_TEXT") {
        const text = getArticleText();
        sendResponse({ text: text });
    }
    
    else if (req.type === "SHOW_TOAST") {
        showToast(req.message);
    }
    
    else if (req.type === "OPEN_OVERLAY") {
        // If user initiated Ask AI from context menu, trigger input directly.
        if (req.action === "ask_ai") {
            createOverlay(req.action, req.selection);
            updateOverlayState(req.action, req.selection, "success", "What would you like to ask about this selection? Use the input box below!");
        } else {
            createOverlay(req.action, req.selection);
        }
        sendResponse({ success: true });
    }
    
    else if (req.type === "UPDATE_OVERLAY") {
        if (req.success) {
            updateOverlayState(currentAction, currentSelection, "success", req.result);
        } else {
            updateOverlayState(currentAction, currentSelection, "error", req.result);
        }
        sendResponse({ success: true });
    }
    
    return true; 
});