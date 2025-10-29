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

// --- Tentukan Email Approver ---
const KETUA_K3_EMAIL = "aguswahyudingumpul@gmail.com";
const KABAG_TU_EMAIL = "kabagtuumum@mij.sch.id";

// --- Variabel Global ---
let currentUser = null; let userRole = null; let currentReviewReportId = null;
let unsubscribeReviewListener = null; let allPublicReports = [];
let isPublicSearchReady = false; let isRevising = false; let currentRevisingId = null;

// --- Elemen UI ---
let mainContent, authContent, loginForm, registerForm, resetForm,
    loginEmailInput, loginPasswordInput, registerEmailInput, registerPasswordInput,
    registerConfirmPasswordInput, resetEmailInput, authStatusMessage, authCardTitle,
    userInfo, userEmail, logoutButton, adminArea, rekapBulanSelect,
    rekapTahunSelect, downloadRekapBtn, rekapStatus, reviewSection, reviewTitleElement,
    reviewListContainer, reviewListUl, reviewDetail, reviewReportIdSpan,
    reviewReportContent, reviewActions, reviewNotesTextarea, backToListBtn,
    publicViewSection, searchTermInput, searchBtn, publicListContainer, publicListUl,
    publicListStatus, k3Form, formTitle, submitButton,
    bahayaListContainer, rambuListContainer,
    togglePublicArchiveBtn;

// --- Inisialisasi Firebase ---
let app, auth, db;
try {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    console.log("Firebase initialized successfully.");
    // Panggil init UI setelah DOM siap
    document.addEventListener('DOMContentLoaded', initializeAppUI);
} catch (error) {
    console.error("Firebase initialization failed:", error);
    // Tampilkan error permanen jika init gagal
    document.addEventListener('DOMContentLoaded', () => {
        const authCard = document.querySelector('#auth-content .auth-card');
        if (authCard) { // Tampilkan di dalam kartu auth jika ada
            authCard.innerHTML = `<h3 style="color: red;">Error Kritis</h3><p>Gagal menginisialisasi sistem. Aplikasi tidak dapat berjalan. Silakan hubungi administrator atau cek konsol (F12) untuk detail teknis.</p><p>Error: ${error.message}</p>`;
            document.getElementById('auth-content')?.classList.remove('hidden');
        } else { // Fallback jika kartu auth tidak ada
            document.body.innerHTML = `<p style="color: red; padding: 2rem;">FATAL ERROR: Gagal koneksi ke sistem. Cek konsol (F12).</p>`;
        }
         // Pastikan konten utama disembunyikan jika init gagal
         document.getElementById('main-content')?.classList.add('hidden');
    });
}

// --- Helper Format Tanggal ---
function formatDate(input) {
    if (!input || typeof input.toDate !== 'function') {
        if (typeof input === 'string' && input.match(/^\d{4}-\d{2}-\d{2}$/)) {
             try {
                const date = new Date(input);
                 date.setMinutes(date.getMinutes() + date.getTimezoneOffset()); // Adjust for timezone
                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year = date.getFullYear();
                return `${day}-${month}-${year}`;
            } catch (e) { console.error("Error parsing date string:", input, e); return '-'; }
        }
        return '-';
    }
    try {
        const date = input.toDate();
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    } catch (e) { console.error("Error formatting timestamp:", input, e); return '-'; }
}

// --- Matriks Risiko & Skor ---
const riskMatrix = { 'A':{'1':'H','2':'H','3':'E','4':'E','5':'E'},'B':{'1':'M','2':'H','3':'H','4':'E','5':'E'},'C':{'1':'L','2':'M','3':'H','4':'E','5':'E'},'D':{'1':'L','2':'L','3':'M','4':'H','5':'E'},'E':{'1':'L','2':'L','3':'M','4':'H','5':'H'}};
const scoreMaps = { jelas:{1:15,2:30,3:50},posisi:{1:10,2:20,3:30},bersih:{1:5,2:10,3:20}};

// --- Fungsi Kalkulasi ---
function calculateRisk(cardElement) {
    const p=cardElement.querySelector('[name="peluang"]')?.value;
    const a=cardElement.querySelector('[name="akibat"]')?.value;
    const o=cardElement.querySelector('[name="tingkatRisiko"]');
    if(p && a && o){ const l=riskMatrix[p]?.[a]; o.value=l || '-'; o.className=`risk-output ${l ? `risk-${l}`:''}`; }
    else if(o){ o.value='-'; o.className='risk-output'; }
}
function updateRambuScore(cardElement){
    const jc=[cardElement.querySelector('[name="jelas_a"]')?.checked, cardElement.querySelector('[name="jelas_b"]')?.checked, cardElement.querySelector('[name="jelas_c"]')?.checked];
    const jn=jc.filter(Boolean).length; const sj=scoreMaps.jelas[jn]||0;
    const pc=[cardElement.querySelector('[name="posisi_a"]')?.checked, cardElement.querySelector('[name="posisi_b"]')?.checked, cardElement.querySelector('[name="posisi_c"]')?.checked];
    const pn=pc.filter(Boolean).length; const sp=scoreMaps.posisi[pn]||0;
    const bc=[cardElement.querySelector('[name="bersih_a"]')?.checked, cardElement.querySelector('[name="bersih_b"]')?.checked, cardElement.querySelector('[name="bersih_c"]')?.checked];
    const bn=bc.filter(Boolean).length; const sb=scoreMaps.bersih[bn]||0;
    const ts=sj+sp+sb;
    const tso=cardElement.querySelector('[name="totalSkor"]');
    const ho=cardElement.querySelector('[name="hasil"]');
    if (tso) tso.value=ts;
    if (ho) {
        if(ts>=80){ho.value='Bagus'; ho.className='result-output result-bagus';}
        else if(ts>=65){ho.value='Masih Layak'; ho.className='result-output result-layak';}
        else{ho.value='Perlu Perbaikan'; ho.className='result-output result-perbaikan';}
    }
}

// --- Fungsi Tambah/Hapus Kartu & Update Header ---
function addRow(templateId, containerId, setupListenersCallback) {
    const template = document.getElementById(templateId);
    const container = document.getElementById(containerId);
    if (!template || !container) { console.error(`Template ${templateId} atau Container ${containerId} tidak ditemukan`); return; }
    const newCard = template.content.cloneNode(true);
    const cardElement = newCard.querySelector('.form-card');
    if (!cardElement) { console.error(`Elemen .form-card tidak ditemukan di template ${templateId}`); return; }
    if (setupListenersCallback) { setupListenersCallback(cardElement); }
    container.appendChild(newCard);
    updateCardHeaders(containerId);
}
function updateCardHeaders(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const cards = container.querySelectorAll(':scope > .form-card');
    const isBahaya = containerId === 'bahaya-list';
    cards.forEach((card, index) => {
        const headerText = card.querySelector('.card-header h4');
        if (headerText) { headerText.textContent = `Item ${isBahaya ? 'Bahaya' : 'Rambu'} #${index + 1}`; }
    });
}
window.removeRow = function(elementToRemove) {
    if (elementToRemove && elementToRemove.parentNode) {
        const container = elementToRemove.closest('.card-list-container');
        const containerId = container ? container.id : null;
        elementToRemove.remove();
        if (containerId) updateCardHeaders(containerId);
    }
}

// --- Fungsi Setup Listeners untuk Kartu ---
function setupBahayaListeners(cardElement) {
    const selects = cardElement.querySelectorAll('select');
    selects.forEach(sel => { sel.addEventListener('change', () => calculateRisk(cardElement)); });
    calculateRisk(cardElement);
}
function setupRambuListeners(cardElement) {
    const checkboxes = cardElement.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => { cb.addEventListener('change', () => updateRambuScore(cardElement)); });
    updateRambuScore(cardElement);
}

// --- Fungsi Submit Form Utama ---
async function handleSubmitForm(event) {
    event.preventDefault();
    const statusMessage = document.getElementById('status-message');
    if (!submitButton || !statusMessage || !k3Form || !bahayaListContainer || !rambuListContainer) return;

    if (!auth.currentUser) {
        statusMessage.textContent = 'Anda harus login untuk mengirim laporan.'; statusMessage.className = 'error'; return;
    }

    submitButton.disabled = true; submitButton.textContent = 'Menyimpan...'; statusMessage.textContent = '';

    try {
        const formData = new FormData(k3Form);
        const mainData = {
            pelaksana: formData.get('pelaksana'), satker: formData.get('satker'),
            namaKegiatan: formData.get('namaKegiatan'), lokasiKegiatan: formData.get('lokasiKegiatan'),
            tanggalPenilaian: formData.get('tanggalPenilaian'), tanggalKegiatan: formData.get('tanggalKegiatan'),
        };
        const bahayaCards = bahayaListContainer.querySelectorAll(':scope > .form-card'); const bahayaData = [];
        bahayaCards.forEach(card => { bahayaData.push({
            identifikasi: card.querySelector('[name="identifikasi"]')?.value || '', risiko: card.querySelector('[name="risiko"]')?.value || '',
            peluang: card.querySelector('[name="peluang"]')?.value || '', akibat: card.querySelector('[name="akibat"]')?.value || '',
            tingkatRisiko: card.querySelector('[name="tingkatRisiko"]')?.value || '', pengendalian: card.querySelector('[name="pengendalian"]')?.value || ''
        }); });
        const rambuCards = rambuListContainer.querySelectorAll(':scope > .form-card'); const rambuData = [];
        rambuCards.forEach(card => { rambuData.push({
            namaRambu: card.querySelector('[name="namaRambu"]')?.value || '', lokasi: card.querySelector('[name="lokasi"]')?.value || '', jenisRambu: card.querySelector('[name="jenisRambu"]')?.value || '',
            kondisiJelas: { jelas_a: card.querySelector('[name="jelas_a"]')?.checked || false, jelas_b: card.querySelector('[name="jelas_b"]')?.checked || false, jelas_c: card.querySelector('[name="jelas_c"]')?.checked || false },
            kondisiPosisi: { posisi_a: card.querySelector('[name="posisi_a"]')?.checked || false, posisi_b: card.querySelector('[name="posisi_b"]')?.checked || false, posisi_c: card.querySelector('[name="posisi_c"]')?.checked || false },
            kondisiBersih: { bersih_a: card.querySelector('[name="bersih_a"]')?.checked || false, bersih_b: card.querySelector('[name="bersih_b"]')?.checked || false, bersih_c: card.querySelector('[name="bersih_c"]')?.checked || false },
            totalSkor: parseInt(card.querySelector('[name="totalSkor"]')?.value || '0', 10), hasil: card.querySelector('[name="hasil"]')?.value || '', tindakanPerbaikan: card.querySelector('[name="tindakanPerbaikan"]')?.value || ''
        }); });
        const finalReportData = { ...mainData, daftarBahaya: bahayaData, inspeksiRambu: rambuData };

        const downloadNote = `<span class="download-note">Dokumen ini dianggap sah tanpa memerlukan tanda tangan fisik lebih lanjut setelah memperoleh persetujuan dari Kabag TU & Umum.</span>`;

        if (isRevising && currentRevisingId) {
            await db.collection('laporanK3').doc(currentRevisingId).update({
                ...finalReportData, statusLaporan: 'Submitted',
                 diperiksaOlehK3_uid: null, diperiksaOlehK3_nama: null, tanggalDiperiksaK3: null, catatanK3: null,
                 disetujuiOlehTU_uid: null, disetujuiOlehTU_nama: null, tanggalDisetujuiTU: null, catatanTU: null,
                 lastRevisedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            statusMessage.innerHTML = `Laporan (ID: ${currentRevisingId.substring(0,6)}...) berhasil direvisi. <br><a href="/api/laporan/${currentRevisingId}/download" target="_blank">Download PDF Revisi</a> ${downloadNote}`;
            statusMessage.className = 'success';
            isRevising = false; currentRevisingId = null;
            if(formTitle) formTitle.textContent = "1. Informasi Kegiatan";
            submitButton.textContent = "Submit Laporan";
        } else {
            const docRef = await db.collection('laporanK3').add({
                ...finalReportData, createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: auth.currentUser.uid, isAnonymous: false, statusLaporan: 'Submitted',
                 diperiksaOlehK3_uid: null, diperiksaOlehK3_nama: null, tanggalDiperiksaK3: null, catatanK3: null,
                 disetujuiOlehTU_uid: null, disetujuiOlehTU_nama: null, tanggalDisetujuiTU: null, catatanTU: null
            });
            statusMessage.innerHTML = `Laporan berhasil disimpan! <a href="/api/laporan/${docRef.id}/download" target="_blank">Download PDF</a> ${downloadNote}`;
            statusMessage.className = 'success';
        }

        k3Form.reset();
        bahayaListContainer.innerHTML = ''; rambuListContainer.innerHTML = '';
        addRow('bahaya-template', 'bahaya-list', setupBahayaListeners);
        addRow('rambu-template', 'rambu-list', setupRambuListeners);

    } catch (error) {
        console.error("Error saving:", error);
        statusMessage.textContent = 'Gagal menyimpan laporan. ' + error.message; statusMessage.className = 'error';
    } finally {
        submitButton.disabled = false;
        if (!isRevising) { submitButton.textContent = 'Submit Laporan'; }
        else {
             isRevising = false; currentRevisingId = null;
             if(formTitle) formTitle.textContent = "1. Informasi Kegiatan";
             submitButton.textContent = "Submit Laporan";
        }
    }
}

// --- Fungsi Handler Auth ---
async function handleLogin(e) {
    e.preventDefault();
    if (!loginEmailInput || !loginPasswordInput || !authStatusMessage) return;
    authStatusMessage.textContent = 'Login...'; authStatusMessage.className = 'loading';
    try {
        await auth.signInWithEmailAndPassword(loginEmailInput.value, loginPasswordInput.value);
        authStatusMessage.textContent = ''; authStatusMessage.className = '';
    } catch (error) { console.error("Login Gagal:", error); authStatusMessage.textContent = error.message; authStatusMessage.className = 'error'; }
}
async function handleLogout() {
    console.log('Fungsi handleLogout terpanggil!'); console.log('Objek auth:', auth);
    if (!auth) { console.error("Objek Firebase Auth tidak tersedia saat logout."); alert("Gagal logout: konfigurasi error."); return; }
    try { await auth.signOut(); console.log("Logout OK"); }
    catch (error) { console.error("Logout Gagal:", error); alert("Gagal logout: " + error.message); }
}
async function handleRegister(e) {
    e.preventDefault();
    if (!registerEmailInput || !registerPasswordInput || !registerConfirmPasswordInput || !authStatusMessage) return;
    const email = registerEmailInput.value; const password = registerPasswordInput.value; const confirmPassword = registerConfirmPasswordInput.value;
    if (password !== confirmPassword) { authStatusMessage.textContent = 'Password tidak cocok.'; authStatusMessage.className = 'error'; return; }
    if (password.length < 6) { authStatusMessage.textContent = 'Password minimal 6 karakter.'; authStatusMessage.className = 'error'; return; }
    authStatusMessage.textContent = 'Mendaftarkan...'; authStatusMessage.className = 'loading';
    try {
        await auth.createUserWithEmailAndPassword(email, password);
        authStatusMessage.textContent = 'Registrasi berhasil! Anda otomatis login.'; authStatusMessage.className = 'success';
    } catch (error) { console.error("Registrasi Gagal:", error); authStatusMessage.textContent = 'Gagal registrasi: ' + error.message; authStatusMessage.className = 'error'; }
}
async function handlePasswordReset(e) {
    e.preventDefault();
    if (!resetEmailInput || !authStatusMessage) return;
    const email = resetEmailInput.value;
    authStatusMessage.textContent = 'Mengirim email reset...'; authStatusMessage.className = 'loading';
    try {
        await auth.sendPasswordResetEmail(email);
        authStatusMessage.textContent = 'Email reset password telah dikirim ke ' + email; authStatusMessage.className = 'success';
    } catch (error) { console.error("Reset Password Gagal:", error); authStatusMessage.textContent = 'Gagal mengirim email reset: ' + error.message; authStatusMessage.className = 'error'; }
}

// --- Fungsi Pencarian Publik ---
async function fetchPublicReports() {
     if (!auth.currentUser || !publicListStatus) return;
     isPublicSearchReady = false;
     publicListStatus.textContent = 'Memuat data...'; publicListStatus.className = 'loading';
     try {
         const snapshot = await db.collection('laporanK3').where('statusLaporan', '==', 'Approved_TU').get();
         allPublicReports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
         allPublicReports.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
         isPublicSearchReady = true;
         publicListStatus.textContent = ``; // Kosongkan status jika berhasil
         searchAndDisplayPublicReports(true); // Tampilkan semua
     } catch (error) { console.error("Error fetching public reports:", error); publicListStatus.textContent = 'Gagal memuat data publik.'; publicListStatus.className = 'error'; }
}
function searchAndDisplayPublicReports(showAll = false) {
    if (!publicListUl || !publicListStatus) return;
    if (!auth.currentUser){ publicListStatus.textContent = 'Silakan login untuk melihat laporan.'; publicListUl.innerHTML = ''; return; }
    if (!isPublicSearchReady) { publicListStatus.textContent = 'Data belum siap...'; return; }
    const searchTerm = searchTermInput ? searchTermInput.value.toLowerCase().trim() : '';
    publicListUl.innerHTML = '';
    const reportsToDisplay = showAll ? allPublicReports : allPublicReports.filter(r => (r.namaKegiatan||'').toLowerCase().includes(searchTerm) || (r.pelaksana||'').toLowerCase().includes(searchTerm) || (r.lokasiKegiatan||'').toLowerCase().includes(searchTerm));
    if (reportsToDisplay.length === 0) { publicListStatus.textContent = showAll ? 'Belum ada laporan publik.' : `Tidak ada hasil untuk "${searchTerm}".`; }
    else { publicListStatus.textContent = ''; }
    const downloadNote = `<span class="download-note">Dokumen ini dianggap sah tanpa memerlukan tanda tangan fisik lebih lanjut setelah memperoleh persetujuan dari Kabag TU & Umum.</span>`;
    reportsToDisplay.forEach(report => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div><strong>${report.namaKegiatan || 'Tanpa Nama'}</strong><br>
            <small>${report.pelaksana || '-'} | ${report.lokasiKegiatan || '-'} | ${formatDate(report.tanggalPenilaian)}</small></div>
            <div><a href="/api/laporan/${report.id}/download" target="_blank" class="btn btn-secondary btn-sm">PDF</a> ${downloadNote}</div>
        `;
        publicListUl.appendChild(li);
     });
}

// --- Fungsi Review Laporan ---
function loadReportsForReview() {
    if (!auth.currentUser || !reviewListUl) return;
    if (unsubscribeReviewListener) unsubscribeReviewListener();
    reviewListUl.innerHTML = '<li>Memuat...</li>';
    let query = db.collection('laporanK3');
    let title = "Status Laporan Saya";
    if (userRole === 'KetuaK3') { query = query.where('statusLaporan', 'in', ['Submitted', 'Rejected_TU']); title = "Review Laporan (Ketua K3)"; }
    else if (userRole === 'KabagTU') { query = query.where('statusLaporan', 'in', ['Reviewed_K3', 'Rejected_K3']); title = "Review Laporan (Kabag TU)"; }
    else { query = query.where('createdBy', '==', auth.currentUser.uid); }
    if(reviewTitleElement) reviewTitleElement.textContent = title;

    unsubscribeReviewListener = query.orderBy('createdAt', 'desc').onSnapshot(snapshot => {
        if (!reviewListUl) return;
        if (snapshot.empty) { reviewListUl.innerHTML = `<li>Tidak ada laporan untuk ${userRole === 'Pelaksana' ? 'Anda' : 'direview'}.</li>`; return; }
        reviewListUl.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
                const li = document.createElement('li');
                const isRevisable = ['Rejected_TU', 'Rejected_K3'].includes(data.statusLaporan) && data.createdBy === auth.currentUser.uid;
                // (BARU) Cek apakah sudah approved
                const isApproved = data.statusLaporan === 'Approved_TU';
                const downloadNote = `<span class="download-note" style="font-size: 0.7rem; display: block; text-align: right;">Dokumen sah tanpa ttd fisik stlh disetujui Kabag TU.</span>`; // Note kecil

                li.dataset.id = doc.id;
                li.innerHTML = `
                    <div><strong>${data.namaKegiatan || 'Tanpa Nama'}</strong><br><small>${data.pelaksana || '-'} | ${formatDate(data.tanggalPenilaian)}</small></div>
                    <div style="display:flex; flex-direction: column; gap:5px; align-items: flex-end;"> <div> ${isRevisable ? `<button class="btn btn-secondary btn-sm btn-revisi" data-id="${doc.id}">Revisi</button>` : ''}
                            ${isApproved ? `<a href="/api/laporan/${doc.id}/download" target="_blank" class="btn btn-secondary btn-sm">PDF</a>` : ''}
                            <span class="status status-${data.statusLaporan}">${data.statusLaporan.replace(/_/g,' ')}</span>
                        </div>
                        ${isApproved ? downloadNote : ''}
                    </div>`;

                // Logika event listener tidak berubah
                if (userRole !== 'Pelaksana') { li.style.cursor = 'pointer'; }
                else { li.style.cursor = 'default'; }
                reviewListUl.appendChild(li);
        });
    }, err => { console.error("Review listener error:", err); if (err.code === 'failed-precondition' && reviewListUl) { reviewListUl.innerHTML = '<li>Gagal: Indeks Firestore dibutuhkan. Cek konsol F12 untuk link pembuatan indeks.</li>'; } else if (reviewListUl) { reviewListUl.innerHTML = '<li>Gagal memuat data review.</li>'; } });
}

// --- Fungsi Load Revisi ---
async function loadReportForRevision(event, reportId) {
    if(event) event.stopPropagation();
    try {
        const doc = await db.collection('laporanK3').doc(reportId).get();
        if (!doc.exists) throw new Error("Laporan hilang.");
        const data = doc.data();
        if(data.createdBy !== auth.currentUser.uid) throw new Error("Anda bukan pembuat laporan ini.");
        if (!k3Form || !bahayaListContainer || !rambuListContainer || !formTitle || !submitButton) { throw new Error("Elemen form tidak ditemukan."); }

        k3Form.pelaksana.value = data.pelaksana||''; k3Form.satker.value = data.satker||'';
        k3Form.namaKegiatan.value = data.namaKegiatan||''; k3Form.lokasiKegiatan.value = data.lokasiKegiatan||'';
        k3Form.tanggalPenilaian.value = data.tanggalPenilaian||''; k3Form.tanggalKegiatan.value = data.tanggalKegiatan||'';

        bahayaListContainer.innerHTML='';
        if(data.daftarBahaya && data.daftarBahaya.length > 0) {
            data.daftarBahaya.forEach(item => { addRow('bahaya-template', 'bahaya-list', card => {
                 card.querySelector('[name="identifikasi"]').value = item.identifikasi || ''; card.querySelector('[name="risiko"]').value = item.risiko || '';
                 card.querySelector('[name="peluang"]').value = item.peluang || ''; card.querySelector('[name="akibat"]').value = item.akibat || '';
                 card.querySelector('[name="pengendalian"]').value = item.pengendalian || ''; calculateRisk(card); }); });
        } else { addRow('bahaya-template', 'bahaya-list', setupBahayaListeners); }

        rambuListContainer.innerHTML='';
        if(data.inspeksiRambu && data.inspeksiRambu.length > 0) {
            data.inspeksiRambu.forEach(item => { addRow('rambu-template', 'rambu-list', card => {
                 card.querySelector('[name="namaRambu"]').value = item.namaRambu || ''; card.querySelector('[name="lokasi"]').value = item.lokasi || '';
                 card.querySelector('[name="jenisRambu"]').value = item.jenisRambu || ''; card.querySelector('[name="tindakanPerbaikan"]').value = item.tindakanPerbaikan || '';
                 card.querySelector('[name="jelas_a"]').checked=item.kondisiJelas?.jelas_a || false; card.querySelector('[name="jelas_b"]').checked=item.kondisiJelas?.jelas_b || false; card.querySelector('[name="jelas_c"]').checked=item.kondisiJelas?.jelas_c || false;
                 card.querySelector('[name="posisi_a"]').checked=item.kondisiPosisi?.posisi_a || false; card.querySelector('[name="posisi_b"]').checked=item.kondisiPosisi?.posisi_b || false; card.querySelector('[name="posisi_c"]').checked=item.kondisiPosisi?.posisi_c || false;
                 card.querySelector('[name="bersih_a"]').checked=item.kondisiBersih?.bersih_a || false; card.querySelector('[name="bersih_b"]').checked=item.kondisiBersih?.bersih_b || false; card.querySelector('[name="bersih_c"]').checked=item.kondisiBersih?.bersih_c || false;
                 updateRambuScore(card); }); });
        } else { addRow('rambu-template', 'rambu-list', setupRambuListeners); }

        isRevising = true; currentRevisingId = reportId;
        formTitle.textContent = `Merevisi Laporan (ID: ${reportId.substring(0, 6)}...)`;
        submitButton.textContent = "Submit Revisi";
        k3Form.scrollIntoView({ behavior: 'smooth' });
    } catch (e) { alert("Gagal memuat data untuk revisi: " + e.message); console.error(e); }
}

// --- Fungsi Show Detail & Approval ---
async function showReportDetail(rId) {
    if (!reviewDetail || !reviewListContainer || !reviewReportContent || !reviewActions || !reviewReportIdSpan) return;
    currentReviewReportId = rId;
    reviewListContainer.classList.add('hidden'); reviewDetail.classList.remove('hidden');
    reviewReportContent.innerHTML = 'Loading...'; reviewActions.innerHTML = '';
    try {
        const doc = await db.collection('laporanK3').doc(rId).get();
        if (!doc.exists) { throw new Error("Laporan tidak ditemukan"); }
        const d = doc.data();
        reviewReportIdSpan.textContent = `(${rId.substring(0,6)}...)`;
        const downloadNote = `<span class="download-note">Dokumen ini dianggap sah tanpa memerlukan tanda tangan fisik lebih lanjut setelah memperoleh persetujuan dari Kabag TU & Umum.</span>`;
        reviewReportContent.innerHTML = `
            <p><strong>${d.namaKegiatan || 'Tanpa Nama'}</strong> (<span class="status status-${d.statusLaporan}">${d.statusLaporan.replace(/_/g,' ')}</span>)</p>
            <p><small>Pelaksana: ${d.pelaksana || '-'}, Lokasi: ${d.lokasiKegiatan || '-'}</small></p>
            ${d.catatanK3 ? `<p><em>Catatan K3: ${d.catatanK3}</em></p>` : ''}
            ${d.catatanTU ? `<p><em>Catatan TU: ${d.catatanTU}</em></p>` : ''}
            <p style="margin-top: 1rem;"><a href="/api/laporan/${rId}/download" target="_blank" class="btn btn-secondary btn-sm">Download PDF</a> ${downloadNote}</p>`;

        if(((userRole==='KetuaK3' && ['Submitted','Rejected_TU'].includes(d.statusLaporan)) ||
           (userRole==='KabagTU' && ['Reviewed_K3','Rejected_K3'].includes(d.statusLaporan))) ) {
            reviewActions.innerHTML = `<label for="review-notes">Catatan (wajib jika menolak):</label>
                <textarea id="review-notes" rows="3"></textarea>
                <div class="action-buttons"><button class="btn btn-approve">Setujui</button><button class="btn btn-reject">Tolak</button></div>`;
            reviewNotesTextarea = document.getElementById('review-notes');
            if (userRole === 'KetuaK3' && d.catatanK3) reviewNotesTextarea.value = d.catatanK3;
            else if (userRole === 'KabagTU' && d.catatanTU) reviewNotesTextarea.value = d.catatanTU;
        }
    } catch(e) { console.error("Error show detail:", e); reviewReportContent.innerHTML = `Gagal memuat detail: ${e.message}`; }
}
function backToList() { if(reviewDetail) reviewDetail.classList.add('hidden'); if(reviewListContainer) reviewListContainer.classList.remove('hidden'); currentReviewReportId=null; }
async function handleApproval(isApproved) {
    if(!currentReviewReportId || !reviewNotesTextarea) return;
    const notes = reviewNotesTextarea.value.trim();
    if(!isApproved && !notes) { alert("Wajib isi catatan jika menolak."); return; }
    let newStatus = isApproved ? (userRole==='KetuaK3'?'Reviewed_K3':'Approved_TU') : (userRole==='KetuaK3'?'Rejected_K3':'Rejected_TU');
    const updateData = { statusLaporan: newStatus }; const ts = firebase.firestore.FieldValue.serverTimestamp();
    const user = auth.currentUser;
    if (!user) { alert("Sesi tidak valid, silakan login ulang."); return; }

    if(userRole==='KetuaK3') {
        updateData.diperiksaOlehK3_uid=user.uid; updateData.diperiksaOlehK3_nama=user.email;
        updateData.tanggalDiperiksaK3=ts; updateData.catatanK3=notes||null;
        updateData.disetujuiOlehTU_uid=null; updateData.disetujuiOlehTU_nama=null; updateData.tanggalDisetujuiTU=null; updateData.catatanTU=null; // Reset TU
    } else { // KabagTU
        updateData.disetujuiOlehTU_uid=user.uid; updateData.disetujuiOlehTU_nama=user.email;
        updateData.tanggalDisetujuiTU=ts; updateData.catatanTU=notes||null;
        if(!isApproved) {
             updateData.statusLaporan = 'Submitted'; updateData.catatanTU = `(DITOLAK TU) ${notes}`;
             updateData.diperiksaOlehK3_uid=null; updateData.diperiksaOlehK3_nama=null; updateData.tanggalDiperiksaK3=null; updateData.catatanK3=null; // Reset K3
        }
    }
    reviewActions?.querySelectorAll('button').forEach(b => b.disabled = true);
    if(reviewNotesTextarea) reviewNotesTextarea.disabled = true;

    try { await db.collection('laporanK3').doc(currentReviewReportId).update(updateData); backToList(); }
    catch(e) {
        alert("Gagal update status: " + e.message); console.error(e);
        reviewActions?.querySelectorAll('button').forEach(b => b.disabled = false);
        if(reviewNotesTextarea) reviewNotesTextarea.disabled = false;
    }
}

// --- Fungsi Populate Tanggal & Download Rekap ---
function populateDateSelectors() {
    if (!rekapBulanSelect || !rekapTahunSelect) return;
    rekapBulanSelect.innerHTML = ''; rekapTahunSelect.innerHTML = '';
    const blns=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
    blns.forEach((b,i)=>{const o=document.createElement('option'); o.value=(i+1).toString().padStart(2,'0'); o.textContent=b; rekapBulanSelect.appendChild(o);});
    const thnI=new Date().getFullYear();
    for(let i=0;i<5;i++){const t=thnI-i; const o=document.createElement('option'); o.value=t; o.textContent=t; rekapTahunSelect.appendChild(o);}
    rekapBulanSelect.value=(new Date().getMonth()+1).toString().padStart(2,'0');
    rekapTahunSelect.value=thnI;
}
async function handleDownloadRekapPDF() {
    const user = auth.currentUser;
    if (!user) { alert("Sesi tidak valid. Silakan login ulang."); return; }
    if(!rekapBulanSelect || !rekapTahunSelect || !downloadRekapBtn || !rekapStatus) { console.error("Elemen rekap tidak ditemukan!"); return; }
    const bln=rekapBulanSelect.value; const thn=rekapTahunSelect.value; const fName=`rekap-pdf-k3-mij-${thn}-${bln}.zip`;
    downloadRekapBtn.textContent='Membuat ZIP...'; downloadRekapBtn.disabled=true; rekapStatus.textContent='Mengambil data...'; rekapStatus.className = 'loading';
    try {
        console.log(`Requesting rekap for ${thn}-${bln}`); const token = await user.getIdToken(); console.log("Got ID token for rekap.");
        const response = await fetch(`/api/rekap/pdf-bundle?month=${bln}&year=${thn}`,{ headers:{'Authorization':`Bearer ${token}`} });
        console.log(`Fetch response status: ${response.status}`);
        if(response.ok){
            rekapStatus.textContent='Memproses file...'; const blob = await response.blob(); console.log(`Blob received, type: ${blob.type}, size: ${blob.size}`);
            if(blob.type !== 'application/zip' || blob.size === 0) { const errorText = await response.text(); console.error("Server tidak mengembalikan ZIP:", errorText); throw new Error(errorText || "Server tidak mengembalikan file ZIP yang valid."); }
            rekapStatus.textContent='Mengunduh...'; const url=window.URL.createObjectURL(blob); const a=document.createElement('a'); a.style.display='none'; a.href=url; a.download=fName; document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); a.remove(); rekapStatus.textContent=`Berhasil mengunduh: ${fName}`; rekapStatus.className = 'success';
        } else { const errTxt = await response.text(); console.error(`Gagal download rekap (${response.status}):`, errTxt); throw new Error(errTxt || `Gagal mengunduh (${response.status})`); }
    } catch(error){ console.error("Gagal total download rekap:", error); rekapStatus.textContent=`Gagal: ${error.message}`; rekapStatus.className = 'error'; }
    finally { downloadRekapBtn.textContent='Download Rekap (.zip)'; downloadRekapBtn.disabled=false; }
}

// --- Helper Functions untuk Show/Hide Form Auth ---
function showLoginForm() {
    loginForm?.classList.remove('hidden'); registerForm?.classList.add('hidden'); resetForm?.classList.add('hidden');
    if(authCardTitle) authCardTitle.textContent = 'Login';
    if(authStatusMessage) {authStatusMessage.textContent = ''; authStatusMessage.className = '';}
}
function showRegisterForm() {
    loginForm?.classList.add('hidden'); registerForm?.classList.remove('hidden'); resetForm?.classList.add('hidden');
    if(authCardTitle) authCardTitle.textContent = 'Registrasi Akun Baru';
    if(authStatusMessage) {authStatusMessage.textContent = ''; authStatusMessage.className = '';}
}
function showResetForm() {
    loginForm?.classList.add('hidden'); registerForm?.classList.add('hidden'); resetForm?.classList.remove('hidden');
    if(authCardTitle) authCardTitle.textContent = 'Reset Password';
    if(authStatusMessage) {authStatusMessage.textContent = ''; authStatusMessage.className = '';}
}

// --- Fungsi Setup Listener Setelah Login ---
function setupLoggedInListeners() {
    console.log("Setting up logged in listeners...");
    if (!setupLoggedInListeners.initialized) { setupLoggedInListeners.initialized = new Map(); }
    const initialized = setupLoggedInListeners.initialized;
    const setupListener = (element, event, handler) => {
        if (element && !initialized.has(element)) { element.addEventListener(event, handler); initialized.set(element, true); console.log(`Listener ${event} attached to:`, element.id || element.tagName); }
        else if (!element) { console.warn(`Attempted to attach listener to non-existent element for event: ${event}`); }
    };

    setupListener(k3Form, 'submit', handleSubmitForm);
    setupListener(document.getElementById('add-bahaya'), 'click', () => addRow('bahaya-template','bahaya-list', setupBahayaListeners));
    setupListener(document.getElementById('add-rambu'), 'click', () => addRow('rambu-template','rambu-list', setupRambuListeners));
    setupListener(logoutButton, 'click', handleLogout);
    setupListener(searchBtn, 'click', () => searchAndDisplayPublicReports(false));
    setupListener(searchTermInput, 'keypress', e => { if(e.key==='Enter') searchAndDisplayPublicReports(false); });
    if (userRole !== 'Pelaksana') {
         if (rekapBulanSelect && !initialized.has(rekapBulanSelect)) { populateDateSelectors(); initialized.set(rekapBulanSelect, true); }
        setupListener(downloadRekapBtn, 'click', handleDownloadRekapPDF);
    }
    setupListener(backToListBtn, 'click', backToList);
    setupListener(reviewListUl, 'click', (event) => {
        const target = event.target; const listItem = target.closest('li');
        const reportId = target.classList.contains('btn-revisi') ? target.dataset.id : listItem?.dataset.id;
        if (target.classList.contains('btn-revisi') && reportId) { loadReportForRevision(event, reportId); }
        else if (listItem && userRole !== 'Pelaksana' && reportId) { showReportDetail(reportId); }
    });
    setupListener(reviewActions, 'click', (event) => {
         if (event.target.classList.contains('btn-approve')) { handleApproval(true); }
         else if (event.target.classList.contains('btn-reject')) { handleApproval(false); }
     });
    setupListener(togglePublicArchiveBtn, 'click', () => {
        console.log("Tombol 'Lihat Arsip' diklik!"); console.log("Element publicViewSection:", publicViewSection); console.log("Element togglePublicArchiveBtn:", togglePublicArchiveBtn);
        if (publicViewSection && togglePublicArchiveBtn) {
            const isHidden = publicViewSection.classList.contains('hidden'); console.log("Arsip saat ini tersembunyi:", isHidden);
            publicViewSection.classList.toggle('hidden'); togglePublicArchiveBtn.textContent = isHidden ? 'Sembunyikan Arsip Laporan Publik' : 'Lihat Arsip Laporan Publik'; console.log("Teks tombol diubah menjadi:", togglePublicArchiveBtn.textContent);
        } else { console.error("Elemen publicViewSection atau togglePublicArchiveBtn tidak ditemukan saat tombol diklik."); }
    });
}

// --- Fungsi Utama Inisialisasi UI dan Logic Aplikasi ---
function initializeAppUI() {
    console.log("initializeAppUI called");
    // Init UI Elements
    mainContent = document.getElementById('main-content'); authContent = document.getElementById('auth-content'); loginForm = document.getElementById('login-form'); registerForm = document.getElementById('register-form'); resetForm = document.getElementById('reset-form'); loginEmailInput = document.getElementById('login-email'); loginPasswordInput = document.getElementById('login-password'); registerEmailInput = document.getElementById('register-email'); registerPasswordInput = document.getElementById('register-password'); registerConfirmPasswordInput = document.getElementById('register-confirm-password'); resetEmailInput = document.getElementById('reset-email'); authStatusMessage = document.getElementById('auth-status-message'); authCardTitle = document.getElementById('auth-card-title'); userInfo=document.getElementById('user-info'); userEmail=document.getElementById('user-email'); logoutButton=document.getElementById('logout-button'); adminArea=document.getElementById('admin-area'); rekapBulanSelect=document.getElementById('rekap-bulan'); rekapTahunSelect=document.getElementById('rekap-tahun'); downloadRekapBtn=document.getElementById('download-rekap-pdf-btn'); rekapStatus=document.getElementById('rekap-status'); reviewSection=document.getElementById('review-section'); reviewTitleElement=document.getElementById('review-title'); reviewListContainer=document.getElementById('review-list-container'); reviewListUl=document.getElementById('review-list'); reviewDetail=document.getElementById('review-detail'); reviewReportIdSpan=document.getElementById('review-report-id'); reviewReportContent=document.getElementById('review-report-content'); reviewActions=document.getElementById('review-actions'); backToListBtn=document.getElementById('back-to-list-btn'); publicViewSection=document.getElementById('public-view-section'); searchTermInput=document.getElementById('search-term'); searchBtn=document.getElementById('search-btn'); publicListContainer=document.getElementById('public-list-container'); publicListUl=document.getElementById('public-list'); publicListStatus=document.getElementById('public-list-status'); k3Form=document.getElementById('k3-form'); formTitle=k3Form ? k3Form.querySelector('#form-title') : null; submitButton=document.getElementById('submit-button'); bahayaListContainer = document.getElementById('bahaya-list'); rambuListContainer = document.getElementById('rambu-list');
    togglePublicArchiveBtn = document.getElementById('toggle-public-archive-btn');

    // Cek elemen penting
    if (!mainContent || !authContent || !loginForm || !registerForm || !resetForm || !k3Form || !bahayaListContainer || !rambuListContainer || !togglePublicArchiveBtn || !publicViewSection ) { console.error("Elemen UI kritis tidak ditemukan! Periksa ID di HTML."); if (authStatusMessage) { authStatusMessage.textContent = "Error: Elemen UI penting hilang."; authStatusMessage.className = 'error'; authContent?.classList.remove('hidden'); } return; }

    // --- AUTH LISTENER UTAMA ---
    if (auth) {
        auth.onAuthStateChanged(user => {
            console.log("Auth state changed, user:", user);
            unsubscribeReviewListener && unsubscribeReviewListener();

            if (user) { // Pengguna Login
                currentUser = user;
                const emailLower = user.email ? user.email.toLowerCase() : '';
                if (emailLower === KETUA_K3_EMAIL.toLowerCase()) userRole = 'KetuaK3';
                else if (emailLower === KABAG_TU_EMAIL.toLowerCase()) userRole = 'KabagTU';
                else userRole = 'Pelaksana';
                console.log(`User Logged In: ${user.uid} (${userRole})`);

                mainContent.classList.remove('hidden'); authContent.classList.add('hidden');
                if(userEmail) userEmail.textContent = user.email;
                adminArea?.classList.toggle('hidden', userRole === 'Pelaksana');
                reviewSection?.classList.remove('hidden');

                // Hanya panggil setupLoggedInListeners jika belum pernah dipanggil
                if (!setupLoggedInListeners.initialized || !setupLoggedInListeners.initialized.has(k3Form)) {
                    setupLoggedInListeners();
                }

                fetchPublicReports();
                loadReportsForReview();

                if (bahayaListContainer && bahayaListContainer.children.length === 0) { addRow('bahaya-template', 'bahaya-list', setupBahayaListeners); }
                if (rambuListContainer && rambuListContainer.children.length === 0) { addRow('rambu-template', 'rambu-list', setupRambuListeners); }

            } else { // Pengguna Logout
                currentUser = null; userRole = null;
                console.log("User Logged Out");
                mainContent.classList.add('hidden'); authContent.classList.remove('hidden');
                showLoginForm();
                if (unsubscribeReviewListener) unsubscribeReviewListener();
                if(reviewListUl) reviewListUl.innerHTML = '';
                if(publicListUl) publicListUl.innerHTML = '';
                if(publicListStatus) publicListStatus.textContent = 'Silakan login untuk melihat laporan.';
                // Reset status listener terpasang
                if (setupLoggedInListeners.initialized) setupLoggedInListeners.initialized = new Map();
                 // Sembunyikan arsip publik saat logout
                publicViewSection?.classList.add('hidden');
                if(togglePublicArchiveBtn) togglePublicArchiveBtn.textContent = 'Lihat Arsip Laporan Publik';
            }
        });
    } else { console.error("Firebase Auth object is not available when setting up listener."); if(authStatusMessage){ authStatusMessage.textContent = "Error: Sistem autentikasi gagal dimuat."; authStatusMessage.className = 'error'; } mainContent?.classList.add('hidden'); authContent?.classList.remove('hidden'); showLoginForm(); }

    // --- Listener yang SELALU aktif (Auth Forms & Toggles) ---
    loginForm.addEventListener('submit', handleLogin); registerForm.addEventListener('submit', handleRegister); resetForm.addEventListener('submit', handlePasswordReset);
    document.getElementById('show-register')?.addEventListener('click', (e) => { e.preventDefault(); showRegisterForm(); });
    document.getElementById('show-reset')?.addEventListener('click', (e) => { e.preventDefault(); showResetForm(); });
    document.getElementById('show-login-from-register')?.addEventListener('click', (e) => { e.preventDefault(); showLoginForm(); });
    document.getElementById('show-login-from-reset')?.addEventListener('click', (e) => { e.preventDefault(); showLoginForm(); });

} // --- Akhir initializeAppUI ---