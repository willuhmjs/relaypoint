import { Poppler } from 'node-poppler';
import fs from 'fs/promises';
import path from 'path';
import { env } from '$env/dynamic/private';

// System dependency: Ensure Poppler is installed on your server.
// For Debian/Ubuntu: sudo apt-get install poppler-utils

/**
 * Converts an Office document (e.g. .pptx/.ppt) into a PDF buffer using a
 * Gotenberg (LibreOffice-backed) HTTP service. Office documents can't be
 * rasterized directly by Poppler, so this feeds the existing PDF->PNG
 * pipeline in convertPdfToImages.
 */
export async function convertOfficeToPdf(fileBuffer: Buffer, filename: string): Promise<Buffer> {
    const gotenbergUrl = env.GOTENBERG_URL;
    if (!gotenbergUrl) {
        throw new Error('GOTENBERG_URL is not configured on the server.');
    }

    const formData = new FormData();
    formData.append('files', new Blob([fileBuffer]), filename);

    const response = await fetch(`${gotenbergUrl}/forms/libreoffice/convert`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Gotenberg conversion failed (${response.status}): ${body}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

/**
 * Converts a PDF file into a series of PNG images using node-poppler.
 * @param pdfBuffer The buffer of the PDF file.
 * @param outputPrefix A prefix for the output image filenames.
 * @returns An array of buffers, where each buffer is a PNG image.
 */
export async function convertPdfToImages(pdfBuffer: Buffer, outputPrefix: string): Promise<Buffer[]> {
    // The path to the poppler binaries can be specified here if not in PATH
    const poppler = new Poppler(); 
    const tempDir = path.join('/tmp', `relaypoint-conversion-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const tempPdfPath = path.join(tempDir, 'source.pdf');
    await fs.writeFile(tempPdfPath, pdfBuffer);

    const options = {
        pngFile: true,
    };
    
    // Corrected arguments: The output path is the second argument, options is the third.
    const outputPath = path.join(tempDir, outputPrefix);
    await poppler.pdfToCairo(tempPdfPath, outputPath, options);

    const files = await fs.readdir(tempDir);
    // The library automatically adds page numbers, e.g., 'prefix-1.png', 'prefix-2.png'
    const imageFiles = files
        .filter(f => f.startsWith(outputPrefix) && f.endsWith('.png'))
        .sort((a, b) => {
            const numA = parseInt(a.match(/-(\d+)\.png$/)?.[1] || '0');
            const numB = parseInt(b.match(/-(\d+)\.png$/)?.[1] || '0');
            return numA - numB;
        });

    if (imageFiles.length === 0) {
        throw new Error("PDF conversion resulted in no images. Check if Poppler is installed and accessible in the system's PATH.");
    }

    const imageBuffers: Buffer[] = [];
    for (const file of imageFiles) {
        const imagePath = path.join(tempDir, file);
        const buffer = await fs.readFile(imagePath);
        imageBuffers.push(buffer);
    }

    // Clean up temporary files
    await fs.rm(tempDir, { recursive: true, force: true });

    return imageBuffers;
}
