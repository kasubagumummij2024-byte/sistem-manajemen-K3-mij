/* eslint-disable no-undef */

// --- KONFIGURASI FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyAJCgWgf2j4jDnnrhil16fhd38gxUb-aQQ",
    authDomain: "webapp-sistem-manajemen-k3.firebaseapp.com",
    projectId: "webapp-sistem-manajemen-k3",
    storageBucket: "webapp-sistem-manajemen-k3.firebasestorage.app",
    messagingSenderId: "1013812860223",
    appId: "1:1013812860223:web:1594b7aee1ca3bb6ef2f8a"
};

// --- Inisialisasi Firebase ---
let app, auth, db;
try {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    console.log("Firebase berhasil terinisialisasi.");
} catch (error) {
    console.error("Gagal inisialisasi Firebase:", error);
    const statusMessage = document.getElementById('status-message');
    if (statusMessage) {
        statusMessage.textContent = 'Gagal terhubung ke database.';
        statusMessage.className = 'error';
    }
}

// --- Variabel Global ---
let currentUser = null;

// --- Elemen UI Auth ---
let loginForm, emailInput, passwordInput, authStatus,
    logoutButton, userInfo, userEmail,
    adminArea, rekapBulanSelect, rekapTahunSelect,
    downloadRekapBtn, rekapStatus;

// --- Fungsi Autentikasi Anonim ---
async function signInAnonymously() {
    try {
        await auth.signInAnonymously();
        console.log("Berhasil login sebagai anonim.");
    } catch (error) {
        console.error("Error signing in anonymously:", error);
        authStatus.textContent = 'Gagal memulai sesi anonim.';
    }
}

// --- Matriks Risiko (Form 094) ---
const riskMatrix = {
    'A': { '1': 'H', '2': 'H', '3': 'E', '4': 'E', '5': 'E' },
    'B': { '1': 'M', '2': 'H', '3': 'H', '4': 'E', '5': 'E' },
    'C': { '1': 'L', '2': 'M', '3': 'H', '4': 'E', '5': 'E' },
    'D': { '1': 'L', '2': 'L', '3': 'M', '4': 'H', '5': 'E' },
    'E': { '1': 'L', '2': 'L', '3': 'M', '4': 'H', '5': 'H' }
};

// --- Peta Skor (Form 095) ---
const scoreMaps = {
    jelas: { 1: 15, 2: 30, 3: 50 },
    posisi: { 1: 10, 2: 20, 3: 30 },
    bersih: { 1: 5, 2: 10, 3: 20 }
};

// --- Fungsi Kalkulasi Risiko (Otomatis) ---
function calculateRisk(row) {
    const peluang = row.querySelector('[name="peluang"]').value;
    const akibat = row.querySelector('[name="akibat"]').value;
    const riskOutput = row.querySelector('[name="tingkatRisiko"]');
    
    if (peluang && akibat) {
        const riskLevel = riskMatrix[peluang][akibat];
        riskOutput.value = riskLevel;
        riskOutput.className = `risk-output risk-${riskLevel}`; // Untuk styling
    } else {
        riskOutput.value = '-';
        riskOutput.className = 'risk-output';
    }
}

// --- Fungsi Kalkulasi Skor Rambu (Otomatis) ---
function updateRambuScore(row) {
    // 1. Kondisi Jelas Terbaca
    const jelasChecks = [
        row.querySelector('[name="jelas_a"]').checked,
        row.querySelector('[name="jelas_b"]').checked,
        row.querySelector('[name="jelas_c"]').checked
    ];
    const jelasCount = jelasChecks.filter(Boolean).length;
    const skorJelas = scoreMaps.jelas[jelasCount] || 0;

    // 2. Kondisi Posisi Rambu
    const posisiChecks = [
        row.querySelector('[name="posisi_a"]').checked,
        row.querySelector('[name="posisi_b"]').checked,
        row.querySelector('[name="posisi_c"]').checked
    ];
    const posisiCount = posisiChecks.filter(Boolean).length;
    const skorPosisi = scoreMaps.posisi[posisiCount] || 0;

    // 3. Kondisi Kebersihan
    const bersihChecks = [
        row.querySelector('[name="bersih_a"]').checked,
        row.querySelector('[name="bersih_b"]').checked,
        row.querySelector('[name="bersih_c"]').checked
    ];
    const bersihCount = bersihChecks.filter(Boolean).length;
    const skorBersih = scoreMaps.bersih[bersihCount] || 0;

    // 4. Hitung Total dan Hasil
    const totalSkor = skorJelas + skorPosisi + skorBersih;
    const totalSkorOutput = row.querySelector('[name="totalSkor"]');
    const hasilOutput = row.querySelector('[name="hasil"]');

    totalSkorOutput.value = totalSkor;

    if (totalSkor >= 80) {
        hasilOutput.value = 'Bagus';
        hasilOutput.className = 'result-output result-bagus';
    } else if (totalSkor >= 65) {
        hasilOutput.value = 'Masih Layak';
        hasilOutput.className = 'result-output result-layak';
    } else {
        hasilOutput.value = 'Perlu Perbaikan';
        hasilOutput.className = 'result-output result-perbaikan';
    }
}


// --- Fungsi Tambah/Hapus Baris ---
function addRow(templateId, listId, setupListeners) {
    const template = document.getElementById(templateId);
    if (!template) {
        console.error(`Template with ID ${templateId} not found.`);
        return;
    }
    const list = document.getElementById(listId);
    if (!list) {
        console.error(`List with ID ${listId} not found.`);
        return;
    }
    const newRow = template.content.cloneNode(true);
    
    if (setupListeners) {
        setupListeners(newRow.firstElementChild);
    }
    
    list.appendChild(newRow);
}

// Fungsi ini global karena dipanggil dari onclick di HTML
window.removeRow = function(button) {
    button.closest('tr').remove();
}

// --- Fungsi Submit Form Utama ---
async function handleSubmitForm(event) {
    event.preventDefault(); 
    const form = event.target;
    const statusMessage = document.getElementById('status-message');
    const submitButton = document.getElementById('submit-button');

    if (!auth || !auth.currentUser) {
        statusMessage.textContent = 'Sesi tidak ditemukan. Silakan refresh halaman.';
        statusMessage.className = 'error';
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Menyimpan...';
    statusMessage.textContent = '';
    
    try {
        // 1. Kumpulkan Data Utama
        const formData = new FormData(form);
        const mainData = {
            pelaksana: formData.get('pelaksana'),
            satker: formData.get('satker'),
            namaKegiatan: formData.get('namaKegiatan'),
            lokasiKegiatan: formData.get('lokasiKegiatan'), 
            tanggalPenilaian: formData.get('tanggalPenilaian'),
            tanggalKegiatan: formData.get('tanggalKegiatan'),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(), 
            createdBy: auth.currentUser.uid,
            isAnonymous: auth.currentUser.isAnonymous 
        };

        // 2. Kumpulkan Data Bahaya (Array)
        const bahayaRows = document.querySelectorAll('#bahaya-list tr');
        const bahayaData = [];
        bahayaRows.forEach(row => {
            bahayaData.push({
                identifikasi: row.querySelector('[name="identifikasi"]').value,
                risiko: row.querySelector('[name="risiko"]').value,
                peluang: row.querySelector('[name="peluang"]').value,
                akibat: row.querySelector('[name="akibat"]').value,
                tingkatRisiko: row.querySelector('[name="tingkatRisiko"]').value,
                pengendalian: row.querySelector('[name="pengendalian"]').value,
            });
        });

        // 3. Kumpulkan Data Rambu (Array)
        const rambuRows = document.querySelectorAll('#rambu-list tr');
        const rambuData = [];
        rambuRows.forEach(row => {
            rambuData.push({
                namaRambu: row.querySelector('[name="namaRambu"]').value,
                lokasi: row.querySelector('[name="lokasi"]').value,
                jenisRambu: row.querySelector('[name="jenisRambu"]').value,
                kondisiJelas: {
                    jelas_a: row.querySelector('[name="jelas_a"]').checked,
                    jelas_b: row.querySelector('[name="jelas_b"]').checked,
                    jelas_c: row.querySelector('[name="jelas_c"]').checked,
                },
                kondisiPosisi: {
                    posisi_a: row.querySelector('[name="posisi_a"]').checked,
                    posisi_b: row.querySelector('[name="posisi_b"]').checked,
                    posisi_c: row.querySelector('[name="posisi_c"]').checked,
                },
                kondisiBersih: {
                    bersih_a: row.querySelector('[name="bersih_a"]').checked,
                    bersih_b: row.querySelector('[name="bersih_b"]').checked,
                    bersih_c: row.querySelector('[name="bersih_c"]').checked,
                },
                totalSkor: parseInt(row.querySelector('[name="totalSkor"]').value, 10),
                hasil: row.querySelector('[name="hasil"]').value,
                tindakanPerbaikan: row.querySelector('[name="tindakanPerbaikan"]').value,
            });
        });

        // 4. Gabungkan semua data
        const finalReport = {
            ...mainData,
            daftarBahaya: bahayaData,
            inspeksiRambu: rambuData
        };

        // 5. Simpan ke Firestore
        const docRef = await db.collection('laporanK3').add(finalReport);
        console.log("Laporan berhasil disimpan dengan ID:", docRef.id);
        
        statusMessage.innerHTML = `Laporan berhasil disimpan! <br> <a href="/api/laporan/${docRef.id}/download" target="_blank">Download PDF (ID: ${docRef.id})</a>`;
        statusMessage.className = 'success';
        form.reset(); 
        document.getElementById('bahaya-list').innerHTML = ''; 
        document.getElementById('rambu-list').innerHTML = ''; 
        addRow('bahaya-template', 'bahaya-list', setupBahayaListeners);
        addRow('rambu-template', 'rambu-list', setupRambuListeners);

    } catch (error) {
        console.error("Error saving document:", error);
        statusMessage.textContent = 'Gagal menyimpan laporan. Cek konsol (F12) untuk detail.';
        statusMessage.className = 'error';
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Submit Laporan';
    }
}

// --- Fungsi Setup Listeners untuk Baris Baru ---
function setupBahayaListeners(row) {
    const selects = row.querySelectorAll('select');
    selects.forEach(select => {
        select.addEventListener('change', () => calculateRisk(row));
    });
}

function setupRambuListeners(row) {
    const checkboxes = row.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => updateRambuScore(row));
    });
}

// --- Fungsi Handler Auth ---
async function handleLogin(e) {
    e.preventDefault();
    authStatus.textContent = '';
    const email = emailInput.value;
    const password = passwordInput.value;

    try {
        await auth.signInWithEmailAndPassword(email, password);
        console.log("Admin login berhasil");
        authStatus.textContent = '';
    } catch (error) {
        console.error("Gagal login:", error);
        authStatus.textContent = error.message;
    }
}

async function handleLogout() {
    try {
        await auth.signOut();
        console.log("Admin berhasil logout");
    } catch (error) {
        console.error("Gagal logout:", error);
    }
}

// --- Fungsi Handler Download Rekap PDF ZIP ---
async function handleDownloadRekapPDF() {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) {
        alert("Akses ditolak. Hanya admin yang bisa mengunduh rekap.");
        return;
    }

    const bulan = rekapBulanSelect.value;
    const tahun = rekapTahunSelect.value;
    const namaFile = `rekap-pdf-k3-mij-${tahun}-${bulan}.zip`;

    downloadRekapBtn.textContent = 'Membuat ZIP... (Mohon tunggu)';
    downloadRekapBtn.disabled = true;
    rekapStatus.textContent = 'Sedang mengambil data...';

    try {
        // 1. Dapatkan Token ID
        const token = await user.getIdToken();

        // 2. Minta file ZIP ke backend
        const response = await fetch(`/api/rekap/pdf-bundle?month=${bulan}&year=${tahun}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            rekapStatus.textContent = 'Sedang membuat file PDF... Ini mungkin perlu waktu lama.';
            // 3. Jika berhasil, ubah response menjadi Blob
            const blob = await response.blob();
            
            if (blob.type !== 'application/zip') {
                 // Cek jika response bukan zip (kemungkinan error/tidak ada data)
                 const text = await blob.text();
                 throw new Error(text || "Tidak ada laporan ditemukan.");
            }

            rekapStatus.textContent = 'Mengunduh file...';
            // 4. Buat URL sementara untuk blob
            const url = window.URL.createObjectURL(blob);
            // 5. Buat link <a> tersembunyi
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = namaFile;
            document.body.appendChild(a);
            a.click(); 
            window.URL.revokeObjectURL(url); 
            a.remove();
            rekapStatus.textContent = `Berhasil mengunduh ${namaFile}`;
        } else {
            // Jika backend menolak
            const errorText = await response.text();
            throw new Error(errorText || 'Gagal mengunduh rekap.');
        }
    } catch (error) {
        console.error("Gagal download rekap:", error);
        rekapStatus.textContent = `Gagal: ${error.message}`;
    } finally {
        downloadRekapBtn.textContent = 'Download Rekap (.zip)';
        downloadRekapBtn.disabled = false;
    }
}

// Fungsi untuk mengisi dropdown bulan/tahun
function populateDateSelectors() {
    const bulanSelect = document.getElementById('rekap-bulan');
    const tahunSelect = document.getElementById('rekap-tahun');
    
    const namaBulan = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    
    // Isi Bulan
    namaBulan.forEach((bulan, index) => {
        const option = document.createElement('option');
        option.value = (index + 1).toString().padStart(2, '0'); // 01, 02, ... 12
        option.textContent = bulan;
        bulanSelect.appendChild(option);
    });

    // Isi Tahun (misal: 5 tahun ke belakang)
    const tahunIni = new Date().getFullYear();
    for (let i = 0; i < 5; i++) {
        const tahun = tahunIni - i;
        const option = document.createElement('option');
        option.value = tahun;
        option.textContent = tahun;
        tahunSelect.appendChild(option);
    }

    // Set default ke bulan ini
    bulanSelect.value = (new Date().getMonth() + 1).toString().padStart(2, '0');
    tahunSelect.value = tahunIni;
}


// --- Event Listener Utama (Setelah DOM Siap) ---
document.addEventListener('DOMContentLoaded', () => {
    // Inisialisasi Elemen UI Auth
    loginForm = document.getElementById('login-form');
    emailInput = document.getElementById('email');
    passwordInput = document.getElementById('password');
    authStatus = document.getElementById('auth-status');
    logoutButton = document.getElementById('logout-button');
    userInfo = document.getElementById('user-info');
    userEmail = document.getElementById('user-email');
    adminArea = document.getElementById('admin-area');
    rekapBulanSelect = document.getElementById('rekap-bulan');
    rekapTahunSelect = document.getElementById('rekap-tahun');
    downloadRekapBtn = document.getElementById('download-rekap-pdf-btn');
    rekapStatus = document.getElementById('rekap-status');
    
    // Isi dropdown bulan/tahun
    populateDateSelectors();

    // Listener Status Auth Utama
    auth.onAuthStateChanged(user => {
        currentUser = user; 
        if (user) {
            if (user.isAnonymous) {
                // User Anonim
                console.log("Status: User Anonim");
                loginForm.classList.remove('hidden');
                userInfo.classList.add('hidden');
                adminArea.classList.add('hidden');
                authStatus.textContent = 'Login sebagai admin untuk mengunduh rekap.';
            } else {
                // User Admin (Sudah Login)
                console.log("Status: Admin Login", user.email);
                loginForm.classList.add('hidden');
                userInfo.classList.remove('hidden');
                adminArea.classList.remove('hidden'); // Tampilkan Area Admin
                userEmail.textContent = `Login sebagai: ${user.email}`;
                authStatus.textContent = '';
            }
        } else {
            // Tidak ada user sama sekali (misal: setelah logout)
            console.log("Status: Logged Out. Memulai sesi anonim...");
            signInAnonymously(); // Mulai sesi anonim baru
        }
    });

    // Tambah 1 baris awal saat halaman dimuat
    addRow('bahaya-template', 'bahaya-list', setupBahayaListeners);
    addRow('rambu-template', 'rambu-list', setupRambuListeners);
    
    // Listener untuk tombol "Tambah Baris"
    document.getElementById('add-bahaya').addEventListener('click', () => {
        addRow('bahaya-template', 'bahaya-list', setupBahayaListeners);
    });
    
    document.getElementById('add-rambu').addEventListener('click', () => {
        addRow('rambu-template', 'rambu-list', setupRambuListeners);
    });

    // Listener untuk Form Submit
    const k3Form = document.getElementById('k3-form');
    if (k3Form) {
        k3Form.addEventListener('submit', handleSubmitForm);
    }

    // Listener untuk Auth
    loginForm.addEventListener('submit', handleLogin);
    logoutButton.addEventListener('click', handleLogout);
    downloadRekapBtn.addEventListener('click', handleDownloadRekapPDF);
});