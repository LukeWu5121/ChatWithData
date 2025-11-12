// Wait for the entire HTML document to load
document.addEventListener("DOMContentLoaded", () => {
    
    // 1. Get all HTML elements we need to manipulate
    const csvFileInput = document.getElementById("csvFileInput");
    const uploadButton = document.getElementById("uploadButton");
    const chatWindow = document.getElementById("chatWindow");
    const messageInput = document.getElementById("messageInput");
    const sendButton = document.getElementById("sendButton");

    // Store uploaded file name and parsed data for later use when asking questions
    let uploadedFileName = null;
    let csvData = null;
    let csvHeaders = null;

    // 2. When the upload button is clicked, trigger file input
    uploadButton.addEventListener("click", () => {
        csvFileInput.click();
    });

    // Handle file selection
    csvFileInput.addEventListener("change", () => {
        const file = csvFileInput.files[0];
        
        if (file) {
            console.log("Preparing to upload file:", file.name);
            uploadedFileName = file.name;
            
            // Read and parse CSV file
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const parsed = parseCSV(text);
                    csvData = parsed.data;
                    csvHeaders = parsed.headers;
                    
                    // Display upload success message
                    addMessageToChat("System", `File "${uploadedFileName}" uploaded successfully! Analyzing data...`);
                    
                    // Delay a bit, then display analysis results
                    setTimeout(() => {
                        displayDataAnalysis(csvData, csvHeaders);
                    }, 500);
                    
                } catch (error) {
                    console.error("Error parsing CSV file:", error);
                    addMessageToChat("System", `Error parsing file: ${error.message}`);
                }
            };
            
            reader.onerror = () => {
                addMessageToChat("System", "Error reading file. Please try again.");
            };
            
            reader.readAsText(file, 'UTF-8');

        } else {
            addMessageToChat("System", "Please select a CSV file first.");
        }
    });

    // 3. When the send button is clicked
    sendButton.addEventListener("click", () => {
        sendMessage();
    });

    // 4. When Enter key is pressed in the input field
    messageInput.addEventListener("keypress", (event) => {
        if (event.key === "Enter") {
            sendMessage();
        }
    });

    // Function to send messages
    function sendMessage() {
        const question = messageInput.value.trim(); // Get text from input field

        if (!uploadedFileName) {
            addMessageToChat("System", "Please upload a CSV file first before asking questions.");
            return;
        }

        if (question) {
            // a. Display user's question in chat window
            addMessageToChat("User", question);
            
            // b. Clear input field
            messageInput.value = "";

            // c. This is the second place where you need to coordinate with your backend partner
            // You will use fetch() API here to send 'question' and 'uploadedFileName'
            // to his/her /ask_question endpoint
            
            // --- This is a simulation ---
            // Simulate AI response after 1 second (based on local data)
            setTimeout(() => {
                let aiResponse = `Analyzing question about "${question}"...\n\n`;
                
                // Simple keyword matching to provide simulated answers
                const lowerQuestion = question.toLowerCase();
                if (csvData && csvHeaders) {
                    if (lowerQuestion.includes('row') || lowerQuestion.includes('rows') || lowerQuestion.includes('how many rows')) {
                        aiResponse += `The data has ${csvData.length} rows.`;
                    } else if (lowerQuestion.includes('column') || lowerQuestion.includes('columns') || lowerQuestion.includes('how many columns')) {
                        aiResponse += `The data has ${csvHeaders.length} columns: ${csvHeaders.join(', ')}.`;
                    } else if (lowerQuestion.includes('column name') || lowerQuestion.includes('field') || lowerQuestion.includes('headers')) {
                        aiResponse += `Column names include: ${csvHeaders.join(', ')}.`;
                    } else {
                        aiResponse += `(Simulated response) This is a sample answer about the data. When the backend API is ready, this will display intelligent answers based on actual data analysis.`;
                    }
                } else {
                    aiResponse += `(Simulated response) Please upload a CSV file first.`;
                }
                
                addMessageToChat("AI", aiResponse);
            }, 1000);
            // --- End of simulation ---
        }
    }

    // 5. CSV parsing function
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
            // Simple CSV parsing (handles quotes and commas)
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
            row.push(currentField.trim()); // Add the last field
            
            // Ensure row data length matches header length
            while (row.length < headers.length) {
                row.push('');
            }
            
            data.push(row.slice(0, headers.length));
        }
        
        return { headers, data };
    }

    // 6. Display data analysis results
    function displayDataAnalysis(data, headers) {
        if (!data || data.length === 0) {
            addMessageToChat("System", "Data is empty, cannot perform analysis.");
            return;
        }
        
        // Create AI message container
        const aiMessageDiv = document.createElement("div");
        aiMessageDiv.classList.add("message", "ai-message");
        aiMessageDiv.style.maxWidth = "100%";
        
        // Basic statistics
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
        `;
        
        // Try to generate charts
        const chartInfo = generateCharts(data, headers);
        if (chartInfo) {
            analysisHTML += chartInfo;
        }
        
        analysisHTML += `
                <p style="margin-top: 15px; color: #666; font-style: italic;">
                    💡 Tip: You can now ask me questions about this data!
                </p>
                
                <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #e0e0e0;">
                    <p style="margin-bottom: 10px; font-weight: 600; color: #333;">Quick Actions:</p>
                    <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                        <button class="quick-action-btn" data-action="example1" style="padding: 10px 20px; background-color: #007bff; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; transition: background-color 0.2s;">示例1</button>
                        <button class="quick-action-btn" data-action="example2" style="padding: 10px 20px; background-color: #28a745; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; transition: background-color 0.2s;">示例2</button>
                        <button class="quick-action-btn" data-action="example3" style="padding: 10px 20px; background-color: #ffc107; color: #333; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; transition: background-color 0.2s;">示例3</button>
                        <button class="quick-action-btn" data-action="example4" style="padding: 10px 20px; background-color: #dc3545; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; transition: background-color 0.2s;">示例4</button>
                    </div>
                </div>
            </div>
        `;
        
        aiMessageDiv.innerHTML = analysisHTML;
        chatWindow.appendChild(aiMessageDiv);
        
        // Add event listeners to quick action buttons
        const quickActionButtons = aiMessageDiv.querySelectorAll('.quick-action-btn');
        quickActionButtons.forEach(button => {
            button.addEventListener('click', () => {
                const action = button.getAttribute('data-action');
                handleQuickAction(action, data, headers);
            });
            
            // Add hover effect
            button.addEventListener('mouseenter', () => {
                button.style.opacity = '0.8';
            });
            button.addEventListener('mouseleave', () => {
                button.style.opacity = '1';
            });
        });
        
        // Auto scroll to bottom
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    // Handle quick action button clicks
    function handleQuickAction(action, data, headers) {
        let response = '';
        
        switch(action) {
            case 'example1':
                response = `You clicked 示例1! This is a sample action. The dataset has ${data.length} rows and ${headers.length} columns.`;
                break;
            case 'example2':
                response = `You clicked 示例2! This is another sample action. The first column is "${headers[0] || 'N/A'}" and the last column is "${headers[headers.length - 1] || 'N/A'}".`;
                break;
            case 'example3':
                response = `You clicked 示例3! This is a third sample action. The data contains ${data.length.toLocaleString()} records.`;
                break;
            case 'example4':
                response = `You clicked 示例4! This is the fourth sample action. Available columns: ${headers.join(', ')}.`;
                break;
            default:
                response = `Unknown action: ${action}`;
        }
        
        // Display the response as an AI message
        addMessageToChat("AI", response);
    }

    // 7. Generate charts
    function generateCharts(data, headers) {
        if (!data || data.length === 0 || !headers || headers.length === 0) {
            return null;
        }
        
        let chartsHTML = '<h5 style="margin-top: 20px; margin-bottom: 10px;">📈 Data Visualization:</h5>';
        let chartCount = 0;
        
        // Find numeric columns
        const numericColumns = [];
        headers.forEach((header, index) => {
            // Check first 100 rows of data, if most are numbers, consider it a numeric column
            let numericCount = 0;
            const sampleSize = Math.min(100, data.length);
            
            for (let i = 0; i < sampleSize; i++) {
                const value = data[i][index];
                if (value && !isNaN(parseFloat(value)) && isFinite(value)) {
                    numericCount++;
                }
            }
            
            if (numericCount > sampleSize * 0.7) { // More than 70% are numbers
                numericColumns.push({ header, index });
            }
        });
        
        // If there are numeric columns, generate charts
        if (numericColumns.length > 0) {
            numericColumns.slice(0, 2).forEach((col, chartIndex) => {
                const chartId = `chart-${Date.now()}-${chartIndex}`;
                const values = data.map(row => parseFloat(row[col.index]) || 0).filter(v => !isNaN(v));
                
                if (values.length > 0) {
                    chartsHTML += `
                        <div style="margin-bottom: 20px;">
                            <p style="font-weight: bold; margin-bottom: 5px;">${col.header} Distribution</p>
                            <canvas id="${chartId}" style="max-height: 200px;"></canvas>
                        </div>
                    `;
                    
                    // Delay chart creation to ensure DOM is updated
                    setTimeout(() => {
                        const ctx = document.getElementById(chartId);
                        if (ctx) {
                            // If there's a large amount of data, sample it
                            let displayValues = values;
                            let displayLabels = values.map((_, i) => `#${i + 1}`);
                            
                            if (values.length > 50) {
                                // Sample display
                                const step = Math.ceil(values.length / 50);
                                displayValues = [];
                                displayLabels = [];
                                for (let i = 0; i < values.length; i += step) {
                                    displayValues.push(values[i]);
                                    displayLabels.push(`#${i + 1}`);
                                }
                            }
                            
                            new Chart(ctx, {
                                type: 'line',
                                data: {
                                    labels: displayLabels,
                                    datasets: [{
                                        label: col.header,
                                        data: displayValues,
                                        borderColor: '#007bff',
                                        backgroundColor: 'rgba(0, 123, 255, 0.1)',
                                        tension: 0.4
                                    }]
                                },
                                options: {
                                    responsive: true,
                                    maintainAspectRatio: true,
                                    plugins: {
                                        legend: {
                                            display: false
                                        }
                                    },
                                    scales: {
                                        y: {
                                            beginAtZero: false
                                        }
                                    }
                                }
                            });
                        }
                    }, 100);
                    
                    chartCount++;
                }
            });
        }
        
        // If there's categorical data, generate bar chart
        if (numericColumns.length === 0 && headers.length > 0) {
            // Find first non-empty column as category
            let categoryIndex = 0;
            for (let i = 0; i < headers.length; i++) {
                const nonEmptyCount = data.filter(row => row[i] && row[i].trim() !== '').length;
                if (nonEmptyCount > data.length * 0.5) {
                    categoryIndex = i;
                    break;
                }
            }
            
            // Count category frequency
            const categoryCounts = {};
            data.forEach(row => {
                const category = row[categoryIndex] || 'Unknown';
                categoryCounts[category] = (categoryCounts[category] || 0) + 1;
            });
            
            // Get top 10 most frequent categories
            const sortedCategories = Object.entries(categoryCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);
            
            if (sortedCategories.length > 0) {
                const chartId = `chart-category-${Date.now()}`;
                chartsHTML += `
                    <div style="margin-bottom: 20px;">
                        <p style="font-weight: bold; margin-bottom: 5px;">${headers[categoryIndex]} Category Statistics</p>
                        <canvas id="${chartId}" style="max-height: 200px;"></canvas>
                    </div>
                `;
                
                setTimeout(() => {
                    const ctx = document.getElementById(chartId);
                    if (ctx) {
                        new Chart(ctx, {
                            type: 'bar',
                            data: {
                                labels: sortedCategories.map(c => c[0]),
                                datasets: [{
                                    label: 'Count',
                                    data: sortedCategories.map(c => c[1]),
                                    backgroundColor: 'rgba(0, 123, 255, 0.6)',
                                    borderColor: '#007bff',
                                    borderWidth: 1
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: true,
                                plugins: {
                                    legend: {
                                        display: false
                                    }
                                },
                                scales: {
                                    y: {
                                        beginAtZero: true
                                    }
                                }
                            }
                        });
                    }
                }, 100);
            }
        }
        
        return chartCount > 0 || chartsHTML.includes('canvas') ? chartsHTML : null;
    }

    // 8. Helper function to add messages to chat window
    function addMessageToChat(sender, text) {
        const messageDiv = document.createElement("div");
        messageDiv.classList.add("message");

        if (sender === "User") {
            messageDiv.classList.add("user-message");
        } else if (sender === "AI") {
            messageDiv.classList.add("ai-message");
        } else {
            messageDiv.classList.add("system-message");
        }

        messageDiv.textContent = text;
        chatWindow.appendChild(messageDiv);

        // Auto scroll to bottom
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
});
