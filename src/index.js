require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const puppeteer = require('puppeteer');
const ejs = require('ejs');
const path = require('path');
const JSZip = require('jszip');

// --- Inisialisasi Firebase Admin ---
let serviceAccount;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON); }
    else { const keyPath = process.env.FIREBASE_KEY_PATH || './serviceAccountKey.json'; serviceAccount = require(path.resolve(keyPath)); }
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("Firebase Admin SDK terinisialisasi.");
} catch (error) { console.error("Gagal inisialisasi Firebase Admin:", error.message); process.exit(1); }

const db = admin.firestore();
const app = express();

// --- Middleware ---
app.use(cors()); app.use(express.json()); app.use(express.static(path.join(__dirname, '../public')));

// --- Middleware Autentikasi Admin ---
async function checkAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) { return res.status(403).send('Unauthorized: No token provided.'); }
    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        if (decodedToken.firebase.sign_in_provider === 'anonymous') { return res.status(403).send('Unauthorized: Anonymous users cannot access this resource.'); }
        req.user = decodedToken; next();
    } catch (error) { console.error('Token verification failed:', error.code); return res.status(403).send('Unauthorized: Invalid token.'); }
}

// --- Fungsi Helper Format Tanggal ---
function formatDate(input) {
    if (!input) return '-'; let date;
    if (input.toDate) { date = input.toDate(); }
    else if (typeof input === 'string' && input.match(/^\d{4}-\d{2}-\d{2}$/)) { date = new Date(input); date.setMinutes(date.getMinutes() + date.getTimezoneOffset()); }
    else if (input instanceof Date) { date = input; }
    else { console.warn("Invalid date input:", input); return '-'; }
    try {
        if (isNaN(date.getTime())) { console.warn("Resulting invalid date:", input); return '-'; }
        const day = String(date.getDate()).padStart(2, '0'); const month = String(date.getMonth() + 1).padStart(2, '0'); const year = date.getFullYear();
        if (year <= 0) { console.warn("Invalid year:", input, year); return '-'; }
        return `${day}-${month}-${year}`;
    } catch (e) { console.error("Error formatting date:", input, e); return '-'; }
}

// --- Template Header PDF ---
const pdfHeaderTemplateIdentifikasi = `<div style="font-family: Arial, sans-serif; width: 100%; border-bottom: 1px solid #000; padding-bottom: 5px; margin: 0 25px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between;"><div style="width: 100px; flex-shrink: 0;"><img src="https://madrasah.istiqlal.or.id/template/blue/images/logo-mij.png" style="width: 90px; height: auto;"></div><div style="flex-grow: 1; text-align: center; padding: 0 10px;"><div style="font-size: 16pt; font-weight: bold; color: #000; margin: 0;">MADRASAH ISTIQLAL JAKARTA</div><div style="font-size: 12pt; font-weight: normal; color: #333; margin: 0;">RELIGIUS - CERDAS - BERBUDAYA</div></div><div style="width: 150px; text-align: right; font-size: 8pt; color: #555; flex-shrink: 0; align-self: flex-start;">No. 094/F/BU/01/03/2023</div></div>`;
const pdfHeaderTemplateInspeksi = `<div style="font-family: Arial, sans-serif; width: 100%; border-bottom: 1px solid #000; padding-bottom: 5px; margin: 0 25px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between;"><div style="width: 80px; flex-shrink: 0;"><img src="https://madrasah.istiqlal.or.id/template/blue/images/logo-mij.png" style="width: 70px; height: auto;"></div><div style="flex-grow: 1; text-align: center; padding: 0 10px;"><div style="font-size: 14pt; margin: 0; font-weight: bold;">Madrasah Istiqlal Jakarta</div><div style="font-size: 10pt; margin: 0; font-weight: normal; color: #333;">Masjid istiqlal, Taman Wijaya Kusuma Jakarta Pusat</div></div><div style="width: 150px; text-align: right; font-size: 8pt; color: #555; flex-shrink: 0; align-self: flex-start;">No. 095/F/BU/00/09/2022</div></div>`;

// --- Endpoint 1: Menyajikan Halaman Utama ---
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, '../public/index.html')); });

// --- Endpoint 2: Generate PDF Tunggal ---
app.get('/api/laporan/:id/download', async (req, res) => {
    let browser = null;
    try {
        const docId = req.params.id;
        const doc = await db.collection('laporanK3').doc(docId).get();
        if (!doc.exists) return res.status(404).send('Laporan tidak ditemukan');
        const data = doc.data();
        
        // Pilih header
        const headerTemplate = (data.inspeksiRambu && data.inspeksiRambu.length > 0)
                               ? pdfHeaderTemplateInspeksi
                               : pdfHeaderTemplateIdentifikasi;

        const templatePath = path.join(__dirname, 'template-laporan-content-only.ejs');
        // Pass helper di sini
        const html = await ejs.renderFile(templatePath, { data: data, formatDate: formatDate }); 

        browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'], headless: "new" });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });

        const pdfBuffer = await page.pdf({
            format: 'A4', landscape: true, printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: headerTemplate,
            footerTemplate: '<div></div>', // (POIN 3) Footer Kosong
            margin: { top: '90px', bottom: '30px', left: '25px', right: '25px' }, // Margin bottom kecil
            timeout: 60000
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="laporan-k3-${docId}.pdf"`);
        res.send(pdfBuffer);
    } catch (error) { console.error('Error generating single PDF:', error); res.status(500).send({ message: 'Gagal membuat PDF', error: error.message });
    } finally { if (browser) await browser.close(); }
});

// --- Endpoint 3: Download Rekap PDF .ZIP ---
app.get('/api/rekap/pdf-bundle', checkAuth, async (req, res) => {
    console.log(`Rekap PDF by: ${req.user.email}`);
    let browser = null;
    try {
        const { month, year } = req.query;
        if (!month || !year) return res.status(400).send('Bulan dan Tahun diperlukan.');

        const startY = parseInt(year); const startM = parseInt(month) - 1;
        const startDate = new Date(Date.UTC(startY, startM, 1, 0, 0, 0));
        const endY = startM === 11 ? startY + 1 : startY; const endM = startM === 11 ? 0 : startM + 1;
        const endDate = new Date(Date.UTC(endY, endM, 1, 0, 0, 0));

        console.log(`Query range: >= ${startDate.toISOString()} to < ${endDate.toISOString()}`);
        const snapshot = await db.collection('laporanK3')
            .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
            .where('createdAt', '<', admin.firestore.Timestamp.fromDate(endDate))
            .get();

        if (snapshot.empty) {
             console.log("No reports found for the selected period.");
             return res.status(404).send("Tidak ada laporan ditemukan.");
        }
        console.log(`${snapshot.size} reports found. Creating ZIP...`);

        const zip = new JSZip();
        const templatePath = path.join(__dirname, 'template-laporan-content-only.ejs');

        browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'], headless: "new" });
        const headerRekap = pdfHeaderTemplateIdentifikasi; // Header konsisten

        for (const doc of snapshot.docs) {
            const docId = doc.id;
            const data = doc.data();
            
            console.log(`Processing PDF for ${docId}...`);
            const page = await browser.newPage();
            try {
                // *** INI PERBAIKANNYA (Poin 1) ***
                // Pass formatDate sebagai OPSI terpisah ke EJS
                const html = await ejs.renderFile(templatePath, {
                    data: data,
                    formatDate: formatDate // <-- Teruskan fungsi sebagai opsi
                });
                
                await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
                const pdfBuffer = await page.pdf({
                    format: 'A4', landscape: true, printBackground: true,
                    displayHeaderFooter: true,
                    headerTemplate: headerRekap,
                    footerTemplate: '<div></div>', // (POIN 3) Footer Kosong
                    margin: { top: '90px', bottom: '30px', left: '25px', right: '25px' }, // Margin bottom kecil
                    timeout: 60000
                });
                const fileName = `laporan-k3-${docId}.pdf`;
                zip.file(fileName, pdfBuffer);
                console.log(`Added ${fileName} to ZIP.`);
            } catch (pageError) {
                 console.error(`Failed PDF ${docId}:`, pageError); // Log error lengkap
                 zip.file(`ERROR-${docId}.txt`, `Gagal membuat PDF:\n${pageError.stack || pageError.message}`);
             } finally {
                 await page.close();
             }
        }

        console.log("Generating ZIP buffer...");
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        const zipFileName = `rekap-k3-mij-${year}-${month}.zip`;
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
        res.send(zipBuffer);
        console.log(`Sent ${zipFileName}`);
    } catch (error) {
        console.error('Error generating PDF ZIP:', error);
        res.status(500).send(error.message || 'Gagal membuat rekap ZIP');
    } finally {
        if (browser) {
            await browser.close();
            console.log("Browser closed.");
        }
    }
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Server K3 MIJ running on http://localhost:${PORT}`); });