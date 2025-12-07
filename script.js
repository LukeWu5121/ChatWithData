// Configuration
const API_BASE_URL = 'http://localhost:5000';

// Global state
let uploadedFileName = null;
let sessionId = null;  // Session ID from backend
let csvData = null;  // Only for frontend preview, not sent to backend
let csvHeaders = null;  // Only for frontend preview, not sent to backend

// Wait for the entire HTML document to load
document.addEventListener("DOMContentLoaded", () => {
    const csvFileInput = document.getElementById("csvFileInput");
    const uploadButton = document.getElementById("uploadButton");
    const fileName = document.getElementById("fileName");
    const chatWindow = document.getElementById("chatWindow");
    const messageInput = document.getElementById("messageInput");
    const sendButton = document.getElementById("sendButton");
    const loadingOverlay = document.getElementById("loadingOverlay");

    // File upload handler
    uploadButton.addEventListener("click", () => {
        csvFileInput.click();
    });

    csvFileInput.addEventListener("change", () => {
        handleFileUpload(csvFileInput, fileName);
    });

    // Send message handlers
    sendButton.addEventListener("click", () => {
        const question = messageInput.value.trim();
        if (question) {
            sendMessage(question);
        }
    });

    messageInput.addEventListener("keypress", (event) => {
        if (event.key === "Enter") {
            const question = messageInput.value.trim();
            if (question) {
                sendMessage(question);
            }
        }
    });
});

/**
 * Handle file upload
 */
async function handleFileUpload(fileInput, fileNameElement) {
    const file = fileInput.files[0];
        
        if (file) {
            uploadedFileName = file.name;
        fileNameElement.textContent = file.name;
            
            // Read and parse CSV file
            const reader = new FileReader();
        reader.onload = async (e) => {
                try {
                    const text = e.target.result;
                    const parsed = parseCSV(text);
                    csvData = parsed.data;
                    csvHeaders = parsed.headers;
                    
                addMessage("System", `File "${uploadedFileName}" uploaded successfully! Analyzing data...`);
                
                // Auto-Insights: Check backend for summary/insight
                try {
                    showLoading(true);
                    const formData = new FormData();
                    formData.append('file', file);
                    
                    const response = await fetch(`${API_BASE_URL}/upload`, {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        sessionId = data.session_id;  // Save session_id from backend
                        if (data.insight) {
                            addMessage("System", `💡 ${data.insight}`, false);
                        }
                    }
                } catch (error) {
                    console.error("Error fetching auto-insights:", error);
                } finally {
                    showLoading(false);
                }
                
                // Display data analysis
                    setTimeout(() => {
                        displayDataAnalysis(csvData, csvHeaders);
                    }, 500);
                    
                } catch (error) {
                    console.error("Error parsing CSV file:", error);
                addMessage("System", `Error parsing file: ${error.message}`);
                }
            };
            
            reader.onerror = () => {
            addMessage("System", "Error reading file. Please try again.");
            };
            
            reader.readAsText(file, 'UTF-8');
        } else {
        fileNameElement.textContent = "No file selected";
    }
}

/**
 * Send a message to the AI
 */
async function sendMessage(text) {
    if (!uploadedFileName) {
        addMessage("System", "Please upload a CSV file first before asking questions.");
        return;
    }

    if (!text || text.trim() === "") {
            return;
        }

    // Display user message
    addMessage("User", text);
            
    // Clear input field
    const messageInput = document.getElementById("messageInput");
    if (messageInput) {
            messageInput.value = "";
    }

    // Show loading
    showLoading(true);

    try {
        // Get selected model and prompt strategy
        const modelSelect = document.getElementById("modelSelect");
        const promptSelect = document.getElementById("promptSelect");
        const selectedModel = modelSelect ? modelSelect.value : "google";
        const selectedPrompt = promptSelect ? promptSelect.value : "direct";
        
        // Call backend API
        const response = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                question: text,
                session_id: sessionId,  // Only send session_id, not the whole CSV
                model: selectedModel,
                prompt_strategy: selectedPrompt  // Send prompt strategy
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("API Error Response:", errorText);
            throw new Error(`API error: ${response.status} - ${errorText}`);
        }

        let data;
        try {
            data = await response.json();
        } catch (jsonError) {
            console.error("JSON Parse Error:", jsonError);
            throw new Error("Invalid JSON response from server");
        }
        
        // Handle response
        const aiResponse = data.answer || data.response || "No response received.";
        addMessage("AI", aiResponse, true);

    } catch (error) {
        console.error("Error sending message:", error);
        let errorMessage = "Failed to fetch. Please try again.";
        
        if (error.message) {
            if (error.message.includes("Failed to fetch")) {
                errorMessage = `Unable to connect to backend server (${API_BASE_URL}). Please ensure the backend service is running.`;
                    } else {
                errorMessage = `Error: ${error.message}`;
            }
        }
        
        addMessage("System", errorMessage);
    } finally {
        showLoading(false);
    }
}

/**
 * Show/hide loading overlay
 */
function showLoading(show) {
    const loadingOverlay = document.getElementById("loadingOverlay");
    if (loadingOverlay) {
        if (show) {
            loadingOverlay.classList.add("show");
        } else {
            loadingOverlay.classList.remove("show");
        }
    }
}

/**
 * Add a message to the chat window (supports HTML)
 */
function addMessage(sender, content, isHTML = false) {
    const chatWindow = document.getElementById("chatWindow");
    if (!chatWindow) return;

    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message");

    if (sender === "User") {
        messageDiv.classList.add("user-message");
    } else if (sender === "AI") {
        messageDiv.classList.add("ai-message");
    } else {
        messageDiv.classList.add("system-message");
    }

    if (isHTML) {
        messageDiv.innerHTML = content;
    } else {
        messageDiv.textContent = content;
    }

    chatWindow.appendChild(messageDiv);

    // Add copy buttons to code blocks
    if (isHTML) {
        const preElements = messageDiv.querySelectorAll('pre');
        preElements.forEach((pre) => {
            addCopyButtonToCodeBlock(pre);
        });
    }

    // Auto scroll to bottom
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

/**
 * Add copy button to a code block (pre element)
 */
function addCopyButtonToCodeBlock(preElement) {
    // Check if button already exists
    if (preElement.parentElement && preElement.parentElement.querySelector('.copy-code-btn')) {
        return;
    }

    // Check if already wrapped in container
    let container = preElement.parentElement;
    if (!container || !container.classList.contains('code-block-container')) {
        container = document.createElement('div');
        container.className = 'code-block-container';
        preElement.parentNode.insertBefore(container, preElement);
        container.appendChild(preElement);
    }

    // Create copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-code-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.setAttribute('aria-label', 'Copy code to clipboard');
    container.appendChild(copyBtn);

    // Add click event to copy code
    copyBtn.addEventListener('click', async () => {
        const codeText = preElement.textContent || preElement.innerText;
        
        try {
            await navigator.clipboard.writeText(codeText);
            
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            copyBtn.classList.add('copied');
            
            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.classList.remove('copied');
            }, 2000);
        } catch (err) {
            console.error('Failed to copy code:', err);
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = codeText;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                copyBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyBtn.textContent = 'Copy';
                }, 2000);
            } catch (fallbackErr) {
                console.error('Fallback copy failed:', fallbackErr);
                copyBtn.textContent = 'Failed';
            }
            document.body.removeChild(textArea);
        }
    });
}

/**
 * Parse CSV text into headers and data
 */
    function parseCSV(text) {
        const lines = text.split('\n').filter(line => line.trim() !== '');
        if (lines.length === 0) {
            throw new Error("CSV file is empty");
        }
        
        // Parse headers
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        
        // Parse data rows
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const row = [];
            let currentField = '';
            let insideQuotes = false;
            
            for (let j = 0; j < lines[i].length; j++) {
                const char = lines[i][j];
                
                if (char === '"') {
                    insideQuotes = !insideQuotes;
                } else if (char === ',' && !insideQuotes) {
                    row.push(currentField.trim());
                    currentField = '';
                } else {
                    currentField += char;
                }
            }
        row.push(currentField.trim());
            
            // Ensure row data length matches header length
            while (row.length < headers.length) {
                row.push('');
            }
            
            data.push(row.slice(0, headers.length));
        }
        
        return { headers, data };
    }

/**
 * Display data analysis results
 */
    function displayDataAnalysis(data, headers) {
        if (!data || data.length === 0) {
        addMessage("System", "Data is empty, cannot perform analysis.");
            return;
        }
        
        const rowCount = data.length;
        const colCount = headers.length;
        
        let analysisHTML = `
            <div style="padding: 10px;">
                <h4 style="margin-top: 0; color: #007bff;">📊 Data Analysis Report</h4>
                <p><strong>File Name:</strong> ${uploadedFileName}</p>
                <p><strong>Number of Rows:</strong> ${rowCount.toLocaleString()}</p>
                <p><strong>Number of Columns:</strong> ${colCount}</p>
                <p><strong>Column Names:</strong> ${headers.join(", ")}</p>
                
                <h5 style="margin-top: 15px; margin-bottom: 10px;">First 5 Rows Preview:</h5>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <thead>
                            <tr style="background-color: #f0f0f0;">
                                ${headers.map(h => `<th style="padding: 8px; border: 1px solid #ddd; text-align: left;">${h}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${data.slice(0, 5).map(row => 
                                `<tr>${row.map(cell => `<td style="padding: 8px; border: 1px solid #ddd;">${cell || '(empty)'}</td>`).join('')}</tr>`
                            ).join('')}
                        </tbody>
                    </table>
                </div>
                <p style="margin-top: 15px; color: #666; font-style: italic;">
                💡 Tip: You can now ask questions about this data!
            </p>
            </div>
        `;
        
    addMessage("AI", analysisHTML, true);
}
