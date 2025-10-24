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
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else {
        const keyPath = process.env.FIREBASE_KEY_PATH || './serviceAccountKey.json';
        serviceAccount = require(path.resolve(keyPath));
    }
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin SDK terinisialisasi.");
} catch (error) {
    console.error("Gagal inisialisasi Firebase Admin:", error.message);
    process.exit(1);
}

const db = admin.firestore();
const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// --- Middleware Autentikasi Admin ---
async function checkAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).send('Unauthorized: No token provided.');
    }
    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        if (decodedToken.firebase.sign_in_provider === 'anonymous') {
            return res.status(403).send('Unauthorized: Anonymous users cannot access this resource.');
        }
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Token verification failed:', error.code);
        return res.status(403).send('Unauthorized: Invalid token.');
    }
}

// --- Fungsi Helper Format Tanggal ---
function formatDate(input) {
    if (!input) return '-';
    let date;
    if (input.toDate) {
        date = input.toDate();
    } else if (typeof input === 'string' && input.includes('-')) {
        date = new Date(input);
        date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
    } else if (input instanceof Date) {
        date = input;
    } else { return input; }
    try {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    } catch (e) { console.error("Error formatting date:", input, e); return '-'; }
}

// --- (DIMODIFIKASI) Template Header PDF v4 ---
// Teks di tengah, logo kiri, nomor kanan

const pdfHeaderTemplateIdentifikasi = `
<div style="font-family: Arial, sans-serif; width: 100%; border-bottom: 2px solid #000; padding: 5px 20px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between;">
    <div style="width: 100px; flex-shrink: 0;">
        <img src="https://madrasah.istiqlal.or.id/template/blue/images/logo-mij.png" style="width: 90px; height: auto;">
    </div>
    <div style="flex-grow: 1; text-align: center; padding: 0 15px;">
        <div style="font-size: 18pt; font-weight: bold; color: #000; margin: 0;">MADRASAH ISTIQLAL JAKARTA</div>
        <div style="font-size: 14pt; font-weight: normal; color: #333; margin: 0;">RELIGIUS - CERDAS - BERBUDAYA</div>
    </div>
    <div style="width: 150px; text-align: right; font-size: 9pt; color: #555; flex-shrink: 0;">
        No. 094/F/BU/01/03/2023
    </div>
</div>
`;

const pdfHeaderTemplateInspeksi = `
<div style="font-family: Arial, sans-serif; width: 100%; border-bottom: 2px solid #000; padding: 5px 20px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between;">
    <div style="width: 80px; flex-shrink: 0;">
        <img src="https://madrasah.istiqlal.or.id/template/blue/images/logo-mij.png" style="width: 70px; height: auto;">
    </div>
    <div style="flex-grow: 1; text-align: center; padding: 0 15px;">
        <div style="font-size: 16pt; margin: 0; font-weight: bold;">Madrasah Istiqlal Jakarta</div>
        <div style="font-size: 11pt; margin: 0; font-weight: normal; color: #333;">Masjid istiqlal, Taman Wijaya Kusuma Jakarta Pusat</div>
    </div>
    <div style="width: 150px; text-align: right; font-size: 9pt; color: #555; flex-shrink: 0;">
         No. 095/F/BU/00/09/2022
    </div>
</div>
`;

// --- (DIHAPUS) Template Footer PDF ---
// const pdfFooterTemplate... (dihapus)


// --- Endpoint 1: Menyajikan Halaman Utama ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// --- Endpoint 2: Generate PDF Tunggal ---
// (DIMODIFIKASI) displayHeaderFooter=true, footerTemplate=kosong, margin.bottom dikurangi
app.get('/api/laporan/:id/download', async (req, res) => {
    let browser = null;
    try {
        const docId = req.params.id;
        const doc = await db.collection('laporanK3').doc(docId).get();
        if (!doc.exists) return res.status(404).send('Laporan tidak ditemukan');
        const data = doc.data();
        data.formatDate = formatDate;

        // Pilih header (misal, selalu pakai header 094)
        const headerTemplate = pdfHeaderTemplateIdentifikasi;

        const templatePath = path.join(__dirname, 'template-laporan-content-only.ejs');
        const html = await ejs.renderFile(templatePath, { data: data });

        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            headless: true
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            landscape: true,
            printBackground: true,
            displayHeaderFooter: true,        // Tetap true untuk header
            headerTemplate: headerTemplate,     // Pakai header
            footerTemplate: '<div></div>',      // Footer kosong
            margin: {
                top: '90px',  // Ruang untuk header (sesuaikan jika perlu)
                bottom: '30px', // Ruang bawah minimal
                left: '25px',
                right: '25px'
            },
            timeout: 60000
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="laporan-k3-${docId}.pdf"`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('Error generating single PDF:', error);
        res.status(500).send({ message: 'Gagal membuat PDF', error: error.message });
    } finally {
        if (browser) await browser.close();
    }
});

// --- Endpoint 3: Download Rekap PDF .ZIP ---
// (DIMODIFIKASI) displayHeaderFooter=true, footerTemplate=kosong, margin.bottom dikurangi
app.get('/api/rekap/pdf-bundle', checkAuth, async (req, res) => {
    console.log(`Rekap PDF bulanan diminta oleh: ${req.user.email}`);
    let browser = null;

    try {
        const { month, year } = req.query;
        if (!month || !year) return res.status(400).send('Month and year are required.');

        const startYear = parseInt(year);
        const startMonth = parseInt(month) - 1;
        const startDate = new Date(Date.UTC(startYear, startMonth, 1, 0, 0, 0));
        const endYear = startMonth === 11 ? startYear + 1 : startYear;
        const endMonth = startMonth === 11 ? 0 : startMonth + 1;
        const endDate = new Date(Date.UTC(endYear, endMonth, 1, 0, 0, 0));

        console.log(`Mencari laporan dari >= ${startDate.toISOString()} sampai < ${endDate.toISOString()}`);
        const snapshot = await db.collection('laporanK3')
            .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
            .where('createdAt', '<', admin.firestore.Timestamp.fromDate(endDate))
            .get();

        if (snapshot.empty) return res.status(404).send("Tidak ada laporan ditemukan.");

        console.log(`Menemukan ${snapshot.size} laporan. Membuat ZIP...`);

        const zip = new JSZip();
        const templatePath = path.join(__dirname, 'template-laporan-content-only.ejs');

        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            headless: true
        });

        // Pilih header untuk rekap (misal, pakai header 094)
        const headerRekap = pdfHeaderTemplateIdentifikasi;

        for (const doc of snapshot.docs) {
            const docId = doc.id;
            const data = doc.data();
            data.formatDate = formatDate;

            console.log(`Memproses PDF untuk ${docId}...`);
            const page = await browser.newPage();
            try {
                const html = await ejs.renderFile(templatePath, { data: data });
                await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });

                const pdfBuffer = await page.pdf({
                    format: 'A4',
                    landscape: true,
                    printBackground: true,
                    displayHeaderFooter: true,        // Tetap true untuk header
                    headerTemplate: headerRekap,        // Pakai header
                    footerTemplate: '<div></div>',      // Footer kosong
                    margin: {
                        top: '90px',  // Ruang header
                        bottom: '30px', // Ruang bawah minimal
                        left: '25px',
                        right: '25px'
                    },
                    timeout: 60000
                });

                const fileName = `laporan-k3-${docId}.pdf`;
                zip.file(fileName, pdfBuffer);
                console.log(`Added ${fileName} to ZIP.`);

            } catch (pageError) {
                console.error(`Gagal memproses PDF ${docId}:`, pageError);
                zip.file(`ERROR-${docId}.txt`, `Gagal: ${pageError.message}`);
            } finally {
                await page.close();
            }
        }

        console.log("Membuat file ZIP...");
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });

        const zipFileName = `rekap-k3-mij-${year}-${month}.zip`;
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
        res.send(zipBuffer);
        console.log(`Sent ${zipFileName}`);

    } catch (error) {
        console.error('Error generating PDF ZIP:', error);
        res.status(500).send({ message: 'Gagal membuat rekap ZIP', error: error.message });
    } finally {
        if (browser) {
            await browser.close();
            console.log("Browser ditutup.");
        }
    }
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server K3 MIJ berjalan di http://localhost:${PORT}`);
});