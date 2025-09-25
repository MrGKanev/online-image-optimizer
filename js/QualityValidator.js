/**
 * QualityValidator - Ensures lossless image conversion
 * Performs pixel-by-pixel comparison and generates quality metrics
 */

class QualityValidator {
    constructor() {
        this.validationResults = new Map();
        this.crypto = window.crypto || window.msCrypto;
    }

    /**
     * Validate if conversion is truly lossless
     * @param {ImageData} originalImageData - Original image data
     * @param {Blob} convertedBlob - Converted image blob
     * @param {string} format - Target format (webp/avif)
     * @returns {Promise<ValidationResult>}
     */
    async validateConversion(originalImageData, convertedBlob, format) {
        try {
            const convertedImageData = await this.blobToImageData(convertedBlob);
            
            // Perform multiple validation checks
            const pixelComparison = this.comparePixels(originalImageData, convertedImageData);
            const dimensionCheck = this.compareDimensions(originalImageData, convertedImageData);
            const hashComparison = await this.compareHashes(originalImageData, convertedImageData);
            
            // Calculate quality metrics
            const qualityMetrics = this.calculateQualityMetrics(originalImageData, convertedImageData);
            
            const result = {
                isLossless: pixelComparison.isIdentical && dimensionCheck.isIdentical,
                format: format,
                pixelComparison: pixelComparison,
                dimensionCheck: dimensionCheck,
                hashComparison: hashComparison,
                qualityMetrics: qualityMetrics,
                timestamp: Date.now()
            };

            return result;
        } catch (error) {
            console.error('Validation error:', error);
            return {
                isLossless: false,
                format: format,
                error: error.message,
                timestamp: Date.now()
            };
        }
    }

    /**
     * Convert blob to ImageData for pixel comparison
     * @param {Blob} blob - Image blob
     * @returns {Promise<ImageData>}
     */
    async blobToImageData(blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, img.width, img.height);
                resolve(imageData);
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
        });
    }

    /**
     * Compare pixels between two ImageData objects
     * @param {ImageData} original - Original image data
     * @param {ImageData} converted - Converted image data
     * @returns {Object} Comparison result
     */
    comparePixels(original, converted) {
        if (!original || !converted) {
            return { isIdentical: false, error: 'Missing image data' };
        }

        const originalData = original.data;
        const convertedData = converted.data;

        if (originalData.length !== convertedData.length) {
            return {
                isIdentical: false,
                error: 'Data length mismatch',
                originalLength: originalData.length,
                convertedLength: convertedData.length
            };
        }

        let differenceCount = 0;
        let maxDifference = 0;
        let totalDifference = 0;

        // Compare each pixel (RGBA values)
        for (let i = 0; i < originalData.length; i += 4) {
            const rDiff = Math.abs(originalData[i] - convertedData[i]);
            const gDiff = Math.abs(originalData[i + 1] - convertedData[i + 1]);
            const bDiff = Math.abs(originalData[i + 2] - convertedData[i + 2]);
            const aDiff = Math.abs(originalData[i + 3] - convertedData[i + 3]);

            const pixelDiff = rDiff + gDiff + bDiff + aDiff;

            if (pixelDiff > 0) {
                differenceCount++;
                totalDifference += pixelDiff;
                maxDifference = Math.max(maxDifference, pixelDiff);
            }
        }

        const totalPixels = originalData.length / 4;
        const differencePercentage = (differenceCount / totalPixels) * 100;

        return {
            isIdentical: differenceCount === 0,
            differenceCount: differenceCount,
            totalPixels: totalPixels,
            differencePercentage: differencePercentage.toFixed(4),
            maxDifference: maxDifference,
            averageDifference: differenceCount > 0 ? (totalDifference / differenceCount).toFixed(2) : 0
        };
    }

    /**
     * Compare image dimensions
     * @param {ImageData} original - Original image data
     * @param {ImageData} converted - Converted image data
     * @returns {Object} Dimension comparison result
     */
    compareDimensions(original, converted) {
        return {
            isIdentical: original.width === converted.width && original.height === converted.height,
            original: { width: original.width, height: original.height },
            converted: { width: converted.width, height: converted.height }
        };
    }

    /**
     * Generate and compare SHA-256 hashes of image data
     * @param {ImageData} original - Original image data
     * @param {ImageData} converted - Converted image data
     * @returns {Promise<Object>} Hash comparison result
     */
    async compareHashes(original, converted) {
        try {
            const originalHash = await this.generateImageHash(original);
            const convertedHash = await this.generateImageHash(converted);

            return {
                isIdentical: originalHash === convertedHash,
                originalHash: originalHash.substring(0, 16) + '...', // Truncate for display
                convertedHash: convertedHash.substring(0, 16) + '...'
            };
        } catch (error) {
            return {
                isIdentical: false,
                error: 'Hash generation failed: ' + error.message
            };
        }
    }

    /**
     * Generate SHA-256 hash of image data
     * @param {ImageData} imageData - Image data to hash
     * @returns {Promise<string>} Hash string
     */
    async generateImageHash(imageData) {
        const buffer = new ArrayBuffer(imageData.data.length);
        const view = new Uint8Array(buffer);
        
        for (let i = 0; i < imageData.data.length; i++) {
            view[i] = imageData.data[i];
        }

        const hashBuffer = await this.crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Calculate advanced quality metrics
     * @param {ImageData} original - Original image data
     * @param {ImageData} converted - Converted image data
     * @returns {Object} Quality metrics
     */
    calculateQualityMetrics(original, converted) {
        if (!original || !converted || original.data.length !== converted.data.length) {
            return { error: 'Cannot calculate metrics - invalid data' };
        }

        const originalData = original.data;
        const convertedData = converted.data;
        
        // Calculate Mean Squared Error (MSE)
        let mse = 0;
        const totalPixels = originalData.length / 4;

        for (let i = 0; i < originalData.length; i += 4) {
            const rError = originalData[i] - convertedData[i];
            const gError = originalData[i + 1] - convertedData[i + 1];
            const bError = originalData[i + 2] - convertedData[i + 2];
            
            mse += (rError * rError + gError * gError + bError * bError);
        }
        
        mse = mse / (totalPixels * 3); // Divide by total RGB values

        // Calculate Peak Signal-to-Noise Ratio (PSNR)
        const psnr = mse === 0 ? Infinity : 20 * Math.log10(255 / Math.sqrt(mse));

        // Simple structural similarity approximation
        const ssim = this.calculateSimpleSSIM(original, converted);

        return {
            mse: mse.toFixed(4),
            psnr: psnr === Infinity ? 'Perfect' : psnr.toFixed(2) + ' dB',
            ssim: ssim.toFixed(4),
            isPerfect: mse === 0
        };
    }

    /**
     * Calculate a simplified SSIM metric
     * @param {ImageData} original - Original image data
     * @param {ImageData} converted - Converted image data
     * @returns {number} SSIM value (0-1, 1 being perfect)
     */
    calculateSimpleSSIM(original, converted) {
        const originalData = original.data;
        const convertedData = converted.data;
        
        let meanOriginal = 0;
        let meanConverted = 0;
        const totalPixels = originalData.length / 4;

        // Calculate means
        for (let i = 0; i < originalData.length; i += 4) {
            meanOriginal += (originalData[i] + originalData[i + 1] + originalData[i + 2]) / 3;
            meanConverted += (convertedData[i] + convertedData[i + 1] + convertedData[i + 2]) / 3;
        }
        
        meanOriginal /= totalPixels;
        meanConverted /= totalPixels;

        // Calculate variances and covariance
        let varOriginal = 0;
        let varConverted = 0;
        let covariance = 0;

        for (let i = 0; i < originalData.length; i += 4) {
            const avgOriginal = (originalData[i] + originalData[i + 1] + originalData[i + 2]) / 3;
            const avgConverted = (convertedData[i] + convertedData[i + 1] + convertedData[i + 2]) / 3;
            
            const diffOriginal = avgOriginal - meanOriginal;
            const diffConverted = avgConverted - meanConverted;
            
            varOriginal += diffOriginal * diffOriginal;
            varConverted += diffConverted * diffConverted;
            covariance += diffOriginal * diffConverted;
        }
        
        varOriginal /= totalPixels;
        varConverted /= totalPixels;
        covariance /= totalPixels;

        // SSIM calculation with constants
        const c1 = 6.5025; // (k1 * L)^2 where k1=0.01, L=255
        const c2 = 58.5225; // (k2 * L)^2 where k2=0.03, L=255

        const numerator = (2 * meanOriginal * meanConverted + c1) * (2 * covariance + c2);
        const denominator = (meanOriginal * meanOriginal + meanConverted * meanConverted + c1) * 
                          (varOriginal + varConverted + c2);

        return denominator === 0 ? 1 : numerator / denominator;
    }

    /**
     * Generate validation summary for UI display
     * @param {ValidationResult} result - Validation result
     * @returns {Object} UI-friendly summary
     */
    generateValidationSummary(result) {
        if (result.error) {
            return {
                status: 'error',
                icon: '❌',
                title: 'Validation Failed',
                message: result.error,
                details: null
            };
        }

        if (result.isLossless) {
            return {
                status: 'success',
                icon: '✅',
                title: 'Perfect Lossless Conversion',
                message: 'Pixel-perfect conversion verified',
                details: `PSNR: ${result.qualityMetrics.psnr}, SSIM: ${result.qualityMetrics.ssim}`
            };
        } else {
            const pixelDiffPercent = parseFloat(result.pixelComparison.differencePercentage);
            
            if (pixelDiffPercent < 0.01) {
                return {
                    status: 'warning',
                    icon: '⚠️',
                    title: 'Near-Lossless Conversion',
                    message: `${result.pixelComparison.differenceCount} pixels differ (${pixelDiffPercent}%)`,
                    details: `Max difference: ${result.pixelComparison.maxDifference}/1020`
                };
            } else {
                return {
                    status: 'error',
                    icon: '❌',
                    title: 'Quality Loss Detected',
                    message: `${result.pixelComparison.differenceCount} pixels differ (${pixelDiffPercent}%)`,
                    details: `PSNR: ${result.qualityMetrics.psnr}, SSIM: ${result.qualityMetrics.ssim}`
                };
            }
        }
    }

    /**
     * Store validation result for later reference
     * @param {string} fileId - Unique file identifier
     * @param {ValidationResult} result - Validation result
     */
    storeValidationResult(fileId, result) {
        this.validationResults.set(fileId, result);
    }

    /**
     * Get stored validation result
     * @param {string} fileId - Unique file identifier
     * @returns {ValidationResult|null}
     */
    getValidationResult(fileId) {
        return this.validationResults.get(fileId) || null;
    }

    /**
     * Clear all stored validation results
     */
    clearValidationResults() {
        this.validationResults.clear();
    }
}

// Create global instance
window.QualityValidator = new QualityValidator();