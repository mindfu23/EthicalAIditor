/**
 * File Parser Utility for EthicalAIditor
 * 
 * Supports parsing various document formats:
 * - .txt, .md (plain text)
 * - .docx (Microsoft Word)
 * - .pdf (PDF documents)
 */

import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/**
 * Parse a file and extract its text content
 * 
 * @param {File} file - The file to parse
 * @returns {Promise<{text: string, type: string}>} - Extracted text and file type
 */
export async function parseFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  
  switch (extension) {
    case 'txt':
    case 'md':
      return parseTextFile(file);
    case 'docx':
      return parseDocxFile(file);
    case 'pdf':
      return parsePdfFile(file);
    case 'doc':
      throw new Error('.doc format is not supported. Please convert to .docx or .pdf');
    default:
      throw new Error(`Unsupported file format: .${extension}`);
  }
}

/**
 * Parse plain text files (.txt, .md)
 */
async function parseTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve({ 
      text: e.target.result, 
      type: file.name.endsWith('.md') ? 'md' : 'txt' 
    });
    reader.onerror = () => reject(new Error('Failed to read text file'));
    reader.readAsText(file);
  });
}

/**
 * Parse Microsoft Word .docx files using mammoth.js
 */
async function parseDocxFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        const result = await mammoth.extractRawText({ arrayBuffer });
        
        if (result.messages.length > 0) {
          console.warn('Mammoth warnings:', result.messages);
        }
        
        resolve({ text: result.value, type: 'docx' });
      } catch (error) {
        reject(new Error(`Failed to parse .docx: ${error.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read .docx file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse PDF files using pdf.js
 */
async function parsePdfFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        let fullText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map(item => item.str)
            .join(' ');
          fullText += pageText + '\n\n';
        }
        
        resolve({ text: fullText.trim(), type: 'pdf' });
      } catch (error) {
        reject(new Error(`Failed to parse PDF: ${error.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read PDF file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Get supported file extensions for the file input
 */
export const SUPPORTED_EXTENSIONS = '.txt,.md,.docx,.pdf';

/**
 * Check if a file is supported
 */
export function isFileSupported(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return ['txt', 'md', 'docx', 'pdf'].includes(ext);
}

/**
 * Get word count from text
 */
export function getWordCount(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Get character count from text
 */
export function getCharCount(text) {
  if (!text) return 0;
  return text.length;
}
