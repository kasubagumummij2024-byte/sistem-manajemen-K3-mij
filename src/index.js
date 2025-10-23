require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const puppeteer = require('puppeteer');
const ejs = require('ejs');
const path = require('path');

// --- INISIASI FIREBASE ADMIN (SERVER-SIDE) ---
let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    // Jika di Railway (produksi), baca dari environment variable
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
} else if (process.env.FIREBASE_KEY_PATH) {
    // Jika di lokal (development), baca dari file .env
    serviceAccount = require(path.resolve(process.env.FIREBASE_KEY_PATH));
} else {
    console.error("PENTING: Firebase Admin SDK tidak terkonfigurasi. Set FIREBASE_SERVICE_ACCOUNT_JSON atau FIREBASE_KEY_PATH");
}

if (serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const app = express();

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
// Menyajikan file statis dari folder 'public' (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, '../public'))); 

// --- ENDPOINTS ---

// Endpoint untuk download PDF
app.get('/api/laporan/:id/download', async (req, res) => {
    try {
        if (!admin.apps.length) {
           throw new Error("Firebase Admin SDK belum siap.");
        }

        // 1. Ambil data dari Firestore
        const docId = req.params.id;
        const doc = await db.collection('laporanK3').doc(docId).get();
        
        if (!doc.exists) {
            return res.status(404).send('Laporan tidak ditemukan');
        }
        const data = doc.data();

        // Helper untuk format tanggal
        data.formatDate = (isoString) => {
            if (!isoString) return '-';
            return new Date(isoString).toLocaleDateString('id-ID', {
                day: '2-digit', month: 'long', year: 'numeric'
            });
        };

        // 2. Render HTML menggunakan EJS
        const templatePath = path.join(__dirname, 'template-laporan.ejs');
        const html = await ejs.renderFile(templatePath, { data: data });

        // 3. Generate PDF menggunakan Puppeteer
        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
        });

        await browser.close();

        // 4. Kirim PDF ke user
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="laporan-k3-${docId}.pdf"`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).send({ message: 'Gagal membuat PDF', error: error.message });
    }
});

// Serve Halaman Utama
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});


// --- START SERVER ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
