// --- KONFIGURASI FIREBASE (SESUAI INPUT ANDA) ---
const firebaseConfig = {
  apiKey: "AIzaSyAJCgWgf2j4jDnnrhil16fhd38gxUb-aQQ",
  authDomain: "webapp-sistem-manajemen-k3.firebaseapp.com",
  projectId: "webapp-sistem-manajemen-k3",
  storageBucket: "webapp-sistem-manajemen-k3.firebasestorage.app",
  messagingSenderId: "1013812860223",
  appId: "1:1013812860223:web:1594b7aee1ca3bb6ef2f8a"
};

// --- INISIASI FIREBASE ---
// Gunakan API compat untuk sintaks yang lebih mudah (v9)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// --- MATRIKS RISIKO (DARI FORM 094) ---
// Format: riskMatrix[PELUANG][AKIBAT]
const riskMatrix = {
    'A': { '1': 'H', '2': 'H', '3': 'E', '4': 'E', '5': 'E' },
    'B': { '1': 'M', '2': 'H', '3': 'H', '4': 'E', '5': 'E' },
    'C': { '1': 'L', '2': 'M', '3': 'H', '4': 'E', '5': 'E' },
    'D': { '1': 'L', '2': 'L', '3': 'M', '4': 'H', '5': 'E' },
    'E': { '1': 'L', '2': 'L', '3': 'M', '4': 'H', '5': 'H' }
};

// --- DOM ELEMENTS ---
let k3Form, addBahayaBtn, addRambuBtn, bahayaList, rambuList, statusMessage, submitButton;

// --- FUNGSI UTAMA ---

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inisiasi Elemen DOM
    k3Form = document.getElementById('k3-form');
    addBahayaBtn = document.getElementById('add-bahaya');
    addRambuBtn = document.getElementById('add-rambu');
    bahayaList = document.getElementById('bahaya-list');
    rambuList = document.getElementById('rambu-list');
    statusMessage = document.getElementById('status-message');
    submitButton = document.getElementById('submit-button');

    // 2. Login Anonim ke Firebase
    auth.signInAnonymously().catch((error) => {
        console.error("Error signing in anonymously:", error);
        updateStatus("Gagal terhubung ke server. Coba refresh halaman.", true);
    });

    auth.onAuthStateChanged((user) => {
        if (user) {
            console.log("User UID:", user.uid);
            // User sudah login, aktifkan form
            submitButton.disabled = false;
        } else {
            // User belum login, nonaktifkan form
            submitButton.disabled = true;
        }
    });

    // 3. Pasang Event Listeners
    addBahayaBtn.addEventListener('click', addBahayaRow);
    addRambuBtn.addEventListener('click', addRambuRow);
    k3Form.addEventListener('submit', handleSubmitForm);

    // 4. Tambah baris awal
    addBahayaRow();
    addRambuRow();
});

// --- FUNGSI TAMBAH BARIS ---

function addBahayaRow() {
    const template = document.getElementById('bahaya-template');
    const newRow = template.content.cloneNode(true).firstElementChild;
    
    // Tambah event listener untuk kalkulasi otomatis
    const peluangSelect = newRow.querySelector('select[name="peluang"]');
    const akibatSelect = newRow.querySelector('select[name="akibat"]');
    
    peluangSelect.addEventListener('change', () => updateRiskLevel(newRow));
    akibatSelect.addEventListener('change', () => updateRiskLevel(newRow));
    
    bahayaList.appendChild(newRow);
}

function addRambuRow() {
    const template = document.getElementById('rambu-template');
    const newRow = template.content.cloneNode(true).firstElementChild;

    // Tambah event listener untuk kalkulasi otomatis
    const checkboxes = newRow.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.addEventListener('change', () => updateRambuScore(newRow));
    });

    rambuList.appendChild(newRow);
}

// Fungsi untuk hapus baris
window.removeRow = (button) => {
    button.closest('tr').remove();
}

// --- FUNGSI KALKULASI OTOMATIS ---

function updateRiskLevel(row) {
    const peluang = row.querySelector('select[name="peluang"]').value;
    const akibat = row.querySelector('select[name="akibat"]').value;
    const output = row.querySelector('output[name="tingkatRisiko"]');
    
    if (peluang && akibat) {
        const risk = riskMatrix[peluang][akibat];
        output.textContent = risk;
        output.dataset.risk = risk; // Untuk styling CSS
    } else {
        output.textContent = '-';
        output.dataset.risk = '';
    }
}

function updateRambuScore(row) {
    let skorJelas = 0;
    let skorPosisi = 0;
    let skorBersih = 0;

    // Hitung Skor Jelas Terbaca
    const jelasCheck = [
        row.querySelector('input[name="jelas_a"]').checked,
        row.querySelector('input[name="jelas_b"]').checked,
        row.querySelector('input[name="jelas_c"]').checked
    ];
    const countJelas = jelasCheck.filter(Boolean).length;
    if (countJelas === 3) skorJelas = 50;
    else if (countJelas === 2) skorJelas = 30;
    else if (countJelas === 1) skorJelas = 15;

    // Hitung Skor Posisi Rambu
    const posisiCheck = [
        row.querySelector('input[name="posisi_a"]').checked,
        row.querySelector('input[name="posisi_b"]').checked,
        !row.querySelector('input[name="posisi_c"]').checked // Indikator C bernilai negatif (hilang/jatuh)
    ];
    // Note: Logika "posisi_c" (Rambu hilang/hampir jatuh) sedikit ambigu di form.
    // Asumsi saya: centang jika TIDAK hilang/jatuh. Jika form asli berarti 'centang jika hilang', logikanya perlu dibalik.
    // Di sini saya asumsikan C (Hilang/Jatuh) adalah indikator BURUK, jadi TIDAK DICENTANG itu bagus.
    // Mari kita sederhanakan: A dan B adalah baik. C adalah buruk.
    // Skor 30 jika A & B & !C. Skor 20 jika (A & B) atau (A & !C) atau (B & !C). Skor 10 jika (A) atau (B) atau (!C).
    // KITA IKUTI FORM: Anggap A, B, C adalah indikator POSITIF (A=Tepat, B=Tdk Geser, C=TIDAK Hilang)
    // Jadi di UI "C. Rambu hilang/hampir jatuh" harus diubah jadi "C. Rambu utuh/tidak jatuh"
    // Saya akan gunakan logika "jumlah centang" sesuai permintaan
    const countPosisi = [
        row.querySelector('input[name="posisi_a"]').checked,
        row.querySelector('input[name="posisi_b"]').checked,
        row.querySelector('input[name="posisi_c"]').checked // DIBACA: "C. Tidak Hilang/Jatuh"
    ].filter(Boolean).length;
    if (countPosisi === 3) skorPosisi = 30;
    else if (countPosisi === 2) skorPosisi = 20;
    else if (countPosisi === 1) skorPosisi = 10;
    
    // Hitung Skor Kebersihan
    const bersihCheck = [
        row.querySelector('input[name="bersih_a"]').checked,
        row.querySelector('input[name="bersih_b"]').checked,
        row.querySelector('input[name="bersih_c"]').checked
    ];
    const countBersih = bersihCheck.filter(Boolean).length;
    if (countBersih === 3) skorBersih = 20;
    else if (countBersih === 2) skorBersih = 10;
    else if (countBersih === 1) skorBersih = 5;

    // Hitung Total & Hasil
    const totalSkor = skorJelas + skorPosisi + skorBersih;
    let hasil = '-';
    if (totalSkor >= 80) hasil = 'Bagus';
    else if (totalSkor >= 65) hasil = 'Layak'; // Antara 65 s/d 79
    else hasil = 'Perbaikan'; // Kurang dari 65
    
    // Update UI
    row.querySelector('output[name="totalSkor"]').textContent = totalSkor;
    const outputHasil = row.querySelector('output[name="hasil"]');
    outputHasil.textContent = hasil;
    outputHasil.dataset.hasil = hasil.split(' ')[0]; // "Bagus", "Layak", "Perbaikan"
}

// --- FUNGSI SUBMIT FORM ---

async function handleSubmitForm(e) {
    e.preventDefault();
    if (!auth.currentUser) {
        updateStatus("Anda belum terhubung ke server. Coba lagi.", true);
        return;
    }

    setSubmitting(true);

    try {
        // 1. Kumpulkan Data Utama
        const formData = new FormData(k3Form);
        const data = {
            pelaksana: formData.get('pelaksana'),
            satker: formData.get('satker'),
            namaKegiatan: formData.get('namaKegiatan'),
            tanggalPenilaian: formData.get('tanggalPenilaian'),
            tanggalKegiatan: formData.get('tanggalKegiatan'),
            createdAt: new Date().toISOString(),
            createdBy: auth.currentUser.uid,
            daftarBahaya: [],
            inspeksiRambu: []
        };

        // 2. Kumpulkan Data Daftar Bahaya
        const bahayaRows = bahayaList.querySelectorAll('.bahaya-row');
        for (const row of bahayaRows) {
            data.daftarBahaya.push({
                identifikasi: row.querySelector('[name="identifikasi"]').value,
                risiko: row.querySelector('[name="risiko"]').value,
                peluang: row.querySelector('[name="peluang"]').value,
                akibat: row.querySelector('[name="akibat"]').value,
                tingkatRisiko: row.querySelector('[name="tingkatRisiko"]').value,
                pengendalian: row.querySelector('[name="pengendalian"]').value,
            });
        }

        // 3. Kumpulkan Data Inspeksi Rambu
        const rambuRows = rambuList.querySelectorAll('.rambu-row');
        for (const row of rambuRows) {
            data.inspeksiRambu.push({
                namaRambu: row.querySelector('[name="namaRambu"]').value,
                lokasi: row.querySelector('[name="lokasi"]').value,
                jenisRambu: row.querySelector('[name="jenisRambu"]').value,
                kondisiJelas: {
                    a_tulisanUtuh: row.querySelector('[name="jelas_a"]').checked,
                    b_tidakPudar: row.querySelector('[name="jelas_b"]').checked,
                    c_bisaDilihat: row.querySelector('[name="jelas_c"]').checked,
                },
                kondisiPosisi: {
                    a_tepatLokasi: row.querySelector('[name="posisi_a"]').checked,
                    b_tidakBergeser: row.querySelector('[name="posisi_b"]').checked,
                    c_tidakHilang: row.querySelector('[name->[name="posisi_c"]').checked,
                },
                kondisiBersih: {
                    a_bersih: row.querySelector('[name="bersih_a"]').checked,
                    b_tidakBerdebu: row.querySelector('[name="bersih_b"]').checked,
                    c_tidakBerkarat: row.querySelector('[name="bersih_c"]').checked,
                },
                totalSkor: row.querySelector('[name="totalSkor"]').value,
                hasil: row.querySelector('[name="hasil"]').value,
                tindakanPerbaikan: row.querySelector('[name="tindakanPerbaikan"]').value,
            });
        }
        
        // 4. Simpan ke Firestore
        const docRef = await db.collection('laporanK3').add(data);
        
        // 5. Tampilkan Pesan Sukses & Link Download
        updateStatus(`Laporan berhasil disimpan (ID: ${docRef.id}).`, false);
        const downloadLink = document.createElement('a');
        downloadLink.href = `/api/laporan/${docRef.id}/download`;
        downloadLink.textContent = 'Download Laporan (PDF)';
        downloadLink.target = '_blank';
        statusMessage.appendChild(downloadLink);

        k3Form.reset();
        bahayaList.innerHTML = '';
        rambuList.innerHTML = '';
        addBahayaRow();
        addRambuRow();

    } catch (error) {
        console.error("Error submitting form:", error);
        updateStatus("Terjadi kesalahan saat menyimpan laporan.", true);
    } finally {
        setSubmitting(false);
    }
}

// --- FUNGSI HELPER UI ---

function setSubmitting(isSubmitting) {
    submitButton.disabled = isSubmitting;
    submitButton.textContent = isSubmitting ? 'Menyimpan...' : 'Submit Laporan';
}

function updateStatus(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.className = isError ? 'error' : 'success';
}
