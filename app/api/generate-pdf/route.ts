import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { marked } from 'marked'; // Use ESM import for marked
import path from 'path';
import fs from 'fs/promises'; // Use promises API for async file reading

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let browser = null; // Define browser outside try block for finally clause

  try {
    // 1. Get Markdown content
    const body = await request.json();
    const markdownContent = body.markdown;
    if (!markdownContent) {
      return NextResponse.json({ error: 'Missing markdown content' }, { status: 400 });
    }

    // 2. Read CSS styles
    const cssPath = path.resolve(process.cwd(), 'public/pdf-styles.css');
    let cssStyles = '';
    try {
      cssStyles = await fs.readFile(cssPath, 'utf-8');
      console.log("Successfully read CSS styles.");
    } catch (readErr) {
      console.error(`Error reading CSS file at ${cssPath}:`, readErr);
      // Continue without custom styles if file read fails, or throw error
      // return NextResponse.json({ error: 'Failed to load PDF styles' }, { status: 500 });
    }

    // 3. Convert Markdown to HTML using Marked
    console.log("Converting Markdown to HTML...");
    const htmlContent = await marked(markdownContent); 
    console.log("Markdown conversion finished.");

    // 4. Prepare full HTML document with embedded styles
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Generated PDF</title>
        <style>
          /* Remove padding from body, use puppeteer margin instead */
          body { font-family: sans-serif; } 
          ${cssStyles} /* Embed styles from pdf-styles.css */
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `;

    // 5. Launch Puppeteer and generate PDF
    console.log("Launching Puppeteer...");
    // Add --no-sandbox for server environments if needed
    browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] }); 
    const page = await browser.newPage();
    console.log("Setting page content...");
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' }); // Wait for content to load
    console.log("Generating PDF...");
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      // Use puppeteer's margin option for physical page margins
      margin: { top: '1in', right: '1in', bottom: '1in', left: '1in' },
    });
    console.log("PDF generation finished.");

    // 6. Close the browser
    await browser.close();
    browser = null; // Ensure it's null after closing
    console.log("Puppeteer browser closed.");

    // 7. Return PDF response
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="analysis-result.pdf"',
      },
    });

  } catch (error: any) {
    console.error('API Route Error generating PDF with Puppeteer:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF using Puppeteer', details: error.message || String(error) },
      { status: 500 }
    );
  } finally {
    // Ensure browser is closed even if an error occurs mid-process
    if (browser) {
      console.log("Closing Puppeteer browser in finally block...");
      await browser.close();
    }
  }
} 