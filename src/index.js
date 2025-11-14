require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const puppeteer = require('puppeteer');
const ejs = require('ejs');
const path = require('path');
const JSZip = require('jszip');
const fs = require('fs');
const exceljs = require('exceljs');

// --- Inisialisasi Firebase Admin ---
let serviceAccount;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON); }
    else { const keyPath = process.env.FIREBASE_KEY_PATH || './serviceAccountKey.json'; serviceAccount = require(path.resolve(keyPath)); }
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("Firebase Admin SDK terinisialisasi.");
} catch (error) { console.error("Gagal inisialisasi Firebase Admin:", error.message); process.exit(1); }

// --- PERSIAPAN LOGO UNTUK PDF ---
let logoDataUrl = 'https://madrasah.istiqlal.or.id/template/blue/images/logo-mij.png'; // Fallback
const logoPath = path.join(__dirname, '../public/images/logo-mij.png');
try {
    const logoBuffer = fs.readFileSync(logoPath);
    logoDataUrl = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    console.log("Logo lokal berhasil dimuat untuk PDF.");
} catch (err) {
    console.warn(`Gagal memuat logo lokal dari ${logoPath}, menggunakan URL fallback. Error: ${err.message}`);
}
// --- AKHIR PERSIAPAN LOGO ---

const db = admin.firestore();
const app = express();

app.use(cors()); app.use(express.json()); app.use(express.static(path.join(__dirname, '../public')));

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

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, '../public/index.html')); });

app.get('/api/laporan/:id/download', async (req, res) => {
    let browser = null;
    try {
        const docId = req.params.id;
        const doc = await db.collection('laporanK3').doc(docId).get();
        if (!doc.exists) return res.status(404).send('Laporan tidak ditemukan');
        const data = doc.data();
        
        const templatePath = path.join(__dirname, 'template-laporan-content-only.ejs');
        const html = await ejs.renderFile(templatePath, { 
            data: data, 
            formatDate: formatDate,
            logoDataUrl: logoDataUrl
        }); 

        browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'], headless: "new" });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });

        const pdfBuffer = await page.pdf({
            format: 'A4', landscape: true, printBackground: true,
            displayHeaderFooter: false, 
            margin: { top: '25px', bottom: '30px', left: '25px', right: '25px' }, 
            timeout: 60000
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="laporan-k3-${docId}.pdf"`);
        res.send(pdfBuffer);
    } catch (error) { console.error('Error generating single PDF:', error); res.status(500).send({ message: 'Gagal membuat PDF', error: error.message });
    } finally { if (browser) await browser.close(); }
});

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
        
        for (const doc of snapshot.docs) {
            const docId = doc.id;
            const data = doc.data();
            
            console.log(`Processing PDF for ${docId}...`);
            const page = await browser.newPage();
            try {
                const html = await ejs.renderFile(templatePath, {
                    data: data,
                    formatDate: formatDate,
                    logoDataUrl: logoDataUrl
                });
                
                await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
                const pdfBuffer = await page.pdf({
                    format: 'A4', landscape: true, printBackground: true,
                    displayHeaderFooter: false, 
                    margin: { top: '25px', bottom: '30px', left: '25px', right: '25px' }, 
                    timeout: 60000
                });
                const fileName = `laporan-k3-${docId}.pdf`;
                zip.file(fileName, pdfBuffer);
                console.log(`Added ${fileName} to ZIP.`);
            } catch (pageError) {
                console.error(`Failed PDF ${docId}:`, pageError);
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

// --- ENDPOINT BARU UNTUK REKAP EXCEL ---
app.get('/api/rekap/excel-bundle', checkAuth, async (req, res) => {
    console.log(`Rekap EXCEL by: ${req.user.email}`);
    try {
        const { month, year } = req.query;
        if (!month || !year) return res.status(400).send('Bulan dan Tahun diperlukan.');

        const startY = parseInt(year); const startM = parseInt(month) - 1;
        const startDate = new Date(Date.UTC(startY, startM, 1, 0, 0, 0));
        const endY = startM === 11 ? startY + 1 : startY; const endM = startM === 11 ? 0 : startM + 1;
        const endDate = new Date(Date.UTC(endY, endM, 1, 0, 0, 0));

        const snapshot = await db.collection('laporanK3')
            .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
            .where('createdAt', '<', admin.firestore.Timestamp.fromDate(endDate))
            .get();

        if (snapshot.empty) {
            console.log("No reports found for the selected period.");
            return res.status(404).send("Tidak ada laporan ditemukan.");
        }

        const workbook = new exceljs.Workbook();
        workbook.creator = 'Sistem K3 MIJ';
        workbook.lastModifiedBy = req.user.email;
        workbook.created = new Date();
        
        const sheet = workbook.addWorksheet(`Rekap K3 ${month}-${year}`);

        sheet.columns = [
            { header: 'ID Laporan', key: 'id', width: 25 },
            { header: 'Tgl Submit', key: 'tglSubmit', width: 15, style: { numFmt: 'dd-mm-yyyy' } },
            { header: 'Status', key: 'status', width: 18 },
            { header: 'Pelaksana', key: 'pelaksana', width: 25 },
            { header: 'Satker', key: 'satker', width: 15 },
            { header: 'Nama Kegiatan', key: 'namaKegiatan', width: 35 },
            { header: 'Lokasi', key: 'lokasi', width: 30 },
            { header: 'Tgl Penilaian', key: 'tglPenilaian', width: 15, style: { numFmt: 'dd-mm-yyyy' } },
            { header: 'Tgl Kegiatan', key: 'tglKegiatan', width: 15, style: { numFmt: 'dd-mm-yyyy' } },
            { header: 'Reviewer K3', key: 'reviewerK3', width: 25 },
            { header: 'Approver TU', key: 'approverTU', width: 25 },
        ];
        
        sheet.getRow(1).font = { bold: true };

        snapshot.forEach(doc => {
            const data = doc.data();
            sheet.addRow({
                id: doc.id,
                tglSubmit: data.createdAt ? data.createdAt.toDate() : null,
                status: data.statusLaporan ? data.statusLaporan.replace(/_/g, ' ') : 'N/A',
                pelaksana: data.pelaksana,
                satker: data.satker,
                namaKegiatan: data.namaKegiatan,
                lokasi: data.lokasiKegiatan,
                tglPenilaian: data.tanggalPenilaian ? new Date(data.tanggalPenilaian) : null,
                tglKegiatan: data.tanggalKegiatan ? new Date(data.tanggalKegiatan) : null,
                reviewerK3: data.diperiksaOlehK3_nama || '-',
                approverTU: data.disetujuiOlehTU_nama || '-'
            });
        });
        
        const fileName = `rekap-k3-mij-${year}-${month}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        await workbook.xlsx.write(res);
        res.end();
        console.log(`Sent ${fileName}`);

    } catch (error) {
        console.error('Error generating Excel rekap:', error);
        res.status(500).send(error.message || 'Gagal membuat rekap Excel');
    }
});
// --- AKHIR ENDPOINT EXCEL ---

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Server K3 MIJ running on http://localhost:${PORT}`); });