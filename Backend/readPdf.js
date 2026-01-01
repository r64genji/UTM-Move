const fs = require('fs');
const pdf = require('pdf-parse');
const path = require('path');

// Debug: Check what pdf-parse exports
console.log('pdf-parse export type:', typeof pdf);

// Path to the PDF file (one level up from Backend)
const pdfPath = path.join(__dirname, '../Jadual-Shuttle-Kampus-Sesi-2025-2026.pdf');

// Read the PDF
const dataBuffer = fs.readFileSync(pdfPath);

// If it's a function, call it. If it's an object with a default property, use that.
let parseFunc = pdf;
if (typeof parseFunc !== 'function' && pdf.default) {
    parseFunc = pdf.default;
}

if (typeof parseFunc !== 'function') {
    console.error('CRITICAL ERROR: pdf-parse did not export a function.', pdf);
    // Usually pdf-parse exports a function, so this is weird if it happens.
} else {
    parseFunc(dataBuffer).then(function (data) {
        // PDF info
        console.log('Pages:', data.numpages);
        console.log('Metadata:', data.info);
        // PDF text
        console.log('--- PDF TEXT START ---');
        console.log(data.text);
        console.log('--- PDF TEXT END ---');
    }).catch(err => {
        console.error('Error reading PDF:', err);
    });
}
