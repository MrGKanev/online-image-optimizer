// Application state
const state = {
    files: [],
    processing: false,
    completed: 0,
    totalSavings: 0,
    totalSizeReduction: 0
};

// Supported formats
const SUPPORTED_FORMATS = [
    'image/jpeg', 'image/jpg', 'image/png', 
    'image/gif', 'image/bmp', 'image/tiff', 'image/webp'
];

// DOM elements
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const processingArea = document.getElementById('processingArea');
const fileList = document.getElementById('fileList');
const statsSummary = document.getElementById('statsSummary');

// Initialize event listeners
function init() {
    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('dragover', handleDragOver);
    uploadZone.addEventListener('dragleave', handleDragLeave);
    uploadZone.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);
}

// Drag and drop handlers
function handleDragOver(e) {
    e.preventDefault();
    uploadZone.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    processFiles(files);
}

// Main file processing function
async function processFiles(files) {
    // Filter supported formats
    const validFiles = files.filter(file => SUPPORTED_FORMATS.includes(file.type));
    
    if (validFiles.length === 0) {
        alert('No supported image files found. Please select JPG, PNG, GIF, BMP, or TIFF files.');
        return;
    }

    // Show processing area
    processingArea.style.display = 'block';
    state.files = validFiles;
    state.processing = true;
    state.completed = 0;
    state.totalSavings = 0;
    state.totalSizeReduction = 0;

    // Create file items in DOM
    fileList.innerHTML = '';
    validFiles.forEach((file, index) => {
        const fileItem = createFileItem(file, index);
        fileList.appendChild(fileItem);
    });

    // Process files with limited concurrency
    const MAX_CONCURRENT = 3;
    for (let i = 0; i < validFiles.length; i += MAX_CONCURRENT) {
        const batch = validFiles.slice(i, i + MAX_CONCURRENT);
        const promises = batch.map((file, batchIndex) => 
            processImage(file, i + batchIndex)
        );
        await Promise.all(promises);
    }

    // Show final statistics
    showStatsSummary();
}

// Create file item DOM element
function createFileItem(file, index) {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    fileItem.id = `file-${index}`;
    
    fileItem.innerHTML = `
        <div class="file-header">
            <div class="file-name">${file.name}</div>
            <div class="file-status status-processing" id="status-${index}">Processing...</div>
        </div>
        <div class="file-progress">
            <div class="progress-bar" id="progress-${index}" style="width: 0%"></div>
        </div>
        <div class="file-results" id="results-${index}"></div>
    `;
    
    return fileItem;
}

// Process individual image
async function processImage(file, index) {
    try {
        updateProgress(index, 10);
        updateStatus(index, 'Processing...', 'processing');

        // Read file as ImageData
        const imageData = await loadImageAsImageData(file);
        updateProgress(index, 30);

        // Convert to lossless WebP
        updateStatus(index, 'Converting to WebP...', 'processing');
        const webpResult = await convertToWebP(imageData, file.name);
        updateProgress(index, 60);

        // Convert to lossless AVIF
        updateStatus(index, 'Converting to AVIF...', 'processing');
        const avifResult = await convertToAVIF(imageData, file.name);
        updateProgress(index, 90);

        // Compare and determine winner
        const originalSize = file.size;
        const webpSize = webpResult.size;
        const avifSize = avifResult.size;

        // Calculate savings correctly
        const webpSavings = calculateSavings(originalSize, webpSize);
        const avifSavings = calculateSavings(originalSize, avifSize);

        // Determine winner based on actual file size (smaller is better)
        const winner = webpSize <= avifSize ? 'webp' : 'avif';
        const bestResult = winner === 'webp' ? webpResult : avifResult;
        const bestSavingsValue = winner === 'webp' ? webpSavings.value : avifSavings.value;

        // Update statistics (only count actual savings, not increases)
        state.completed++;
        if (bestSavingsValue > 0) {
            state.totalSavings += bestSavingsValue;
            state.totalSizeReduction += (originalSize - bestResult.size);
        }

        // Update UI
        updateProgress(index, 100);
        updateStatus(index, 'Completed', 'completed');
        displayResults(index, {
            original: { size: originalSize, name: file.name },
            webp: { ...webpResult, savings: webpSavings },
            avif: { ...avifResult, savings: avifSavings },
            winner
        });

    } catch (error) {
        console.error('Error processing image:', error);
        updateStatus(index, 'Error', 'error');
        updateProgress(index, 100);
    }
}

// Calculate savings with correct logic
function calculateSavings(originalSize, convertedSize) {
    const difference = originalSize - convertedSize;
    const percentage = Math.abs(difference / originalSize * 100);
    
    if (convertedSize < originalSize) {
        return {
            value: percentage,
            text: `${percentage.toFixed(1)}% smaller`,
            isPositive: true
        };
    } else if (convertedSize > originalSize) {
        return {
            value: -percentage, // Negative for statistics
            text: `${percentage.toFixed(1)}% larger`,
            isPositive: false
        };
    } else {
        return {
            value: 0,
            text: 'Same size',
            isPositive: true
        };
    }
}

// Load image as ImageData
function loadImageAsImageData(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, img.width, img.height);
            resolve({
                data: imageData,
                width: img.width,
                height: img.height,
                canvas: canvas
            });
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

// Convert to lossless WebP
async function convertToWebP(imageData, originalName) {
    return new Promise((resolve) => {
        imageData.canvas.toBlob((blob) => {
            resolve({
                blob: blob,
                size: blob.size,
                format: 'WebP',
                filename: originalName.replace(/\.[^/.]+$/, '.webp')
            });
        }, 'image/webp', 1.0); // Quality 1.0 for lossless
    });
}

// Convert to lossless AVIF (fallback if not supported)
async function convertToAVIF(imageData, originalName) {
    return new Promise((resolve) => {
        // Test AVIF support
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        
        canvas.toBlob((testBlob) => {
            if (testBlob) {
                // AVIF supported
                imageData.canvas.toBlob((avifBlob) => {
                    resolve({
                        blob: avifBlob,
                        size: avifBlob.size,
                        format: 'AVIF',
                        filename: originalName.replace(/\.[^/.]+$/, '.avif')
                    });
                }, 'image/avif', 1.0);
            } else {
                // AVIF not supported - return very large size so WebP wins
                resolve({
                    blob: null,
                    size: Infinity,
                    format: 'AVIF (Not Supported)',
                    filename: originalName.replace(/\.[^/.]+$/, '.avif'),
                    unsupported: true
                });
            }
        }, 'image/avif', 1.0);
    });
}

// Update progress bar
function updateProgress(index, percentage) {
    const progressBar = document.getElementById(`progress-${index}`);
    if (progressBar) {
        progressBar.style.width = `${percentage}%`;
    }
}

// Update status
function updateStatus(index, text, type) {
    const statusEl = document.getElementById(`status-${index}`);
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.className = `file-status status-${type}`;
    }
}

// Display results
function displayResults(index, results) {
    const resultsEl = document.getElementById(`results-${index}`);
    
    const webpCard = createResultCard('WebP', results.webp, results.winner === 'webp');
    const avifCard = createResultCard('AVIF', results.avif, results.winner === 'avif');
    const originalCard = createResultCard('Original', results.original, false, true);
    
    resultsEl.innerHTML = `
        ${originalCard}
        ${webpCard}
        ${avifCard}
    `;

    // Store results for download
    if (!window.results) window.results = {};
    window.results[index] = results;
}

// Create result card HTML
function createResultCard(format, result, isWinner, isOriginal = false) {
    const winnerClass = isWinner ? 'winner' : '';
    const formatClass = isWinner ? 'winner' : '';
    
    if (isOriginal) {
        return `
            <div class="result-card ${winnerClass}">
                <div class="result-format ${formatClass}">${format}</div>
                <div class="result-size">${formatFileSize(result.size)}</div>
            </div>
        `;
    }
    
    if (result.unsupported) {
        return `
            <div class="result-card">
                <div class="result-format">AVIF</div>
                <div class="result-size">Not Supported</div>
                <div class="result-savings negative">Browser doesn't support AVIF encoding</div>
            </div>
        `;
    }
    
    const savingsClass = result.savings.isPositive ? 'positive' : 'negative';
    const downloadButton = result.blob ? 
        `<button class="download-btn" onclick="downloadFile(${Object.keys(window.results || {}).length}, '${format.toLowerCase()}')">Download</button>` : '';
    
    return `
        <div class="result-card ${winnerClass}">
            <div class="result-format ${formatClass}">${format} ${isWinner ? '(Best)' : ''}</div>
            <div class="result-size">${formatFileSize(result.size)}</div>
            <div class="result-savings ${savingsClass}">${result.savings.text}</div>
            ${downloadButton}
        </div>
    `;
}

// Download file
function downloadFile(index, format) {
    const results = window.results[index];
    if (!results) return;

    const result = results[format];
    if (!result.blob || result.unsupported) return;

    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    if (bytes === Infinity) return 'N/A';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Show final statistics
function showStatsSummary() {
    if (state.completed === 0) return;

    const avgSavings = state.completed > 0 ? (state.totalSavings / state.completed).toFixed(1) : '0.0';
    const totalReduction = formatFileSize(Math.max(0, state.totalSizeReduction));

    document.getElementById('totalFiles').textContent = state.completed;
    document.getElementById('totalSavings').textContent = avgSavings + '%';
    document.getElementById('totalSize').textContent = totalReduction;

    statsSummary.style.display = 'block';
}

// Clear results
function clearResults() {
    processingArea.style.display = 'none';
    statsSummary.style.display = 'none';
    fileList.innerHTML = '';
    fileInput.value = '';
    if (window.results) {
        window.results = {};
    }
    
    // Reset state
    state.files = [];
    state.processing = false;
    state.completed = 0;
    state.totalSavings = 0;
    state.totalSizeReduction = 0;
}

// Initialize the application
document.addEventListener('DOMContentLoaded', init);