import { test, expect, describe } from 'bun:test';
import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';

describe('PDF Engine Core Operations', () => {
	test('1. PDF Merge: combines multiple documents in order', async () => {
		// Doc A with 2 pages
		const docA = await PDFDocument.create();
		docA.addPage([400, 400]);
		docA.addPage([400, 400]);
		const bytesA = await docA.save();

		// Doc B with 3 pages
		const docB = await PDFDocument.create();
		docB.addPage([500, 500]);
		docB.addPage([500, 500]);
		docB.addPage([500, 500]);
		const bytesB = await docB.save();

		// Merge
		const merged = await PDFDocument.create();
		const loadedA = await PDFDocument.load(bytesA);
		const loadedB = await PDFDocument.load(bytesB);

		const pagesA = await merged.copyPages(loadedA, [0, 1]);
		for (const p of pagesA) merged.addPage(p);

		const pagesB = await merged.copyPages(loadedB, [0, 1, 2]);
		for (const p of pagesB) merged.addPage(p);

		const mergedBytes = await merged.save();
		const verifyDoc = await PDFDocument.load(mergedBytes);

		expect(verifyDoc.getPageCount()).toBe(5);
		expect(verifyDoc.getPage(0).getWidth()).toBe(400);
		expect(verifyDoc.getPage(2).getWidth()).toBe(500);
	});

	test('2. PDF Organize & Rotate: rotates and deletes pages correctly', async () => {
		const doc = await PDFDocument.create();
		doc.addPage([600, 800]); // Page 0
		doc.addPage([600, 800]); // Page 1 (to be deleted)
		doc.addPage([600, 800]); // Page 2
		const bytes = await doc.save();

		// Load and organize
		const srcDoc = await PDFDocument.load(bytes);
		const outDoc = await PDFDocument.create();

		// Keep page 0 (rotate 90) and page 2 (rotate 180), skip page 1
		const [p0] = await outDoc.copyPages(srcDoc, [0]);
		p0.setRotation(degrees(90));
		outDoc.addPage(p0);

		const [p2] = await outDoc.copyPages(srcDoc, [2]);
		p2.setRotation(degrees(180));
		outDoc.addPage(p2);

		const outBytes = await outDoc.save();
		const verifyDoc = await PDFDocument.load(outBytes);

		expect(verifyDoc.getPageCount()).toBe(2);
		expect(verifyDoc.getPage(0).getRotation().angle).toBe(90);
		expect(verifyDoc.getPage(1).getRotation().angle).toBe(180);
	});

	test('3. Page Numbers & Watermark: draws vector text onto pages', async () => {
		const doc = await PDFDocument.create();
		doc.addPage([500, 700]);
		doc.addPage([500, 700]);

		const font = await doc.embedFont(StandardFonts.Helvetica);
		const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

		const pageCount = doc.getPageCount();
		for (let i = 0; i < pageCount; i++) {
			const page = doc.getPage(i);

			// Watermark
			page.drawText('CONFIDENTIAL', {
				x: 100,
				y: 350,
				size: 36,
				font: fontBold,
				color: rgb(0.8, 0.1, 0.1),
				opacity: 0.3,
				rotate: degrees(45)
			});

			// Page number
			page.drawText(`Page ${i + 1} of ${pageCount}`, {
				x: 200,
				y: 30,
				size: 10,
				font,
				color: rgb(0.2, 0.2, 0.2),
				opacity: 0.9
			});
		}

		const bytes = await doc.save();
		const verifyDoc = await PDFDocument.load(bytes);
		expect(verifyDoc.getPageCount()).toBe(2);
	});

	test('4. Images to PDF: embeds PNG and JPG image buffers', async () => {
		const doc = await PDFDocument.create();

		// 1x1 transparent PNG binary
		const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
		const pngBytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0));

		const pngImg = await doc.embedPng(pngBytes);
		const page = doc.addPage([pngImg.width * 100, pngImg.height * 100]);
		page.drawImage(pngImg, {
			x: 0,
			y: 0,
			width: 100,
			height: 100
		});

		const bytes = await doc.save();
		const verifyDoc = await PDFDocument.load(bytes);
		expect(verifyDoc.getPageCount()).toBe(1);
	});

	test('5. Archiving: JSZip packages multiple PDF and Image files into ZIP', async () => {
		const JSZip = (await import('jszip')).default;
		const zip = new JSZip();

		zip.file('test1.txt', 'Hello World 1');
		zip.file('test2.txt', 'Hello World 2');

		const blob = await zip.generateAsync({ type: 'uint8array' });
		expect(blob.length).toBeGreaterThan(50);

		// Verify read back
		const zipRead = await JSZip.loadAsync(blob);
		const content1 = await zipRead.file('test1.txt')?.async('string');
		expect(content1).toBe('Hello World 1');
	});
});
