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

// --- (REVISI) Tentukan Email Approver ---
const KETUA_K3_EMAIL = "aguswahyudingumpul@gmail.com";
const KABAG_TU_EMAIL = "kabagtuumum@mij.sch.id|kasubagumummij2024@gmail.com";

// --- Inisialisasi Firebase ---
let app, auth, db;
try {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    console.log("Firebase initialized.");
} catch (error) {
    console.error("Firebase initialization failed:", error);
}

// --- Variabel Global ---
let currentUser = null;
let userRole = 'Pelaksana'; // Default
let currentReviewReportId = null;
let unsubscribeReviewListener = null;
let allPublicReports = []; // Cache untuk pencarian publik
let isPublicSearchReady = false;
let isRevising = false; // Flag untuk mode revisi
let currentRevisingId = null; // ID laporan yang direvisi

// --- Elemen UI (diisi saat DOMContentLoaded) ---
let loginForm, emailInput, passwordInput, authStatus, logoutButton, userInfo, userEmail,
    adminArea, rekapBulanSelect, rekapTahunSelect, downloadRekapBtn, rekapStatus,
    reviewSection, reviewListContainer, reviewListUl, reviewDetail, reviewReportIdSpan,
    reviewReportContent, reviewActions, reviewNotesTextarea, backToListBtn, k3Form,
    publicViewSection, searchTermInput, searchBtn, publicListContainer, publicListUl, publicListStatus,
    formTitle, submitButton;

// --- Helper Format Tanggal ---
function formatDate(input) {
    if (!input || typeof input.toDate !== 'function') {
        if (typeof input === 'string' && input.match(/^\d{4}-\d{2}-\d{2}$/)) {
             try {
                const date = new Date(input);
                 date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year = date.getFullYear();
                return `${day}-${month}-${year}`;
            } catch (e) { return '-'; }
        }
        return '-';
    }
    try {
        const date = input.toDate();
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    } catch (e) { return '-'; }
}

// --- Matriks Risiko & Skor ---
const riskMatrix = { 'A':{'1':'H','2':'H','3':'E','4':'E','5':'E'},'B':{'1':'M','2':'H','3':'H','4':'E','5':'E'},'C':{'1':'L','2':'M','3':'H','4':'E','5':'E'},'D':{'1':'L','2':'L','3':'M','4':'H','5':'E'},'E':{'1':'L','2':'L','3':'M','4':'H','5':'H'}};
const scoreMaps = { jelas:{1:15,2:30,3:50},posisi:{1:10,2:20,3:30},bersih:{1:5,2:10,3:20}};

// --- Fungsi Kalkulasi ---
function calculateRisk(row) { const p=row.querySelector('[name="peluang"]').value; const a=row.querySelector('[name="akibat"]').value; const o=row.querySelector('[name="tingkatRisiko"]'); if(p&&a){const l=riskMatrix[p][a]; o.value=l; o.className=`risk-output risk-${l}`;}else{o.value='-';o.className='risk-output';}}
function updateRambuScore(row){const jc=[row.querySelector('[name="jelas_a"]').checked,row.querySelector('[name="jelas_b"]').checked,row.querySelector('[name="jelas_c"]').checked]; const jn=jc.filter(Boolean).length; const sj=scoreMaps.jelas[jn]||0; const pc=[row.querySelector('[name="posisi_a"]').checked,row.querySelector('[name="posisi_b"]').checked,row.querySelector('[name="posisi_c"]').checked]; const pn=pc.filter(Boolean).length; const sp=scoreMaps.posisi[pn]||0; const bc=[row.querySelector('[name="bersih_a"]').checked,row.querySelector('[name="bersih_b"]').checked,row.querySelector('[name="bersih_c"]').checked]; const bn=bc.filter(Boolean).length; const sb=scoreMaps.bersih[bn]||0; const ts=sj+sp+sb; const tso=row.querySelector('[name="totalSkor"]'); const ho=row.querySelector('[name="hasil"]'); tso.value=ts; if(ts>=80){ho.value='Bagus'; ho.className='result-output result-bagus';}else if(ts>=65){ho.value='Masih Layak'; ho.className='result-output result-layak';}else{ho.value='Perlu Perbaikan'; ho.className='result-output result-perbaikan';}}

// --- Fungsi Tambah/Hapus Baris ---
function addRow(tId, lId, sLs){const t=document.getElementById(tId); if(!t) return; const l=document.getElementById(lId); if(!l) return; const nR=t.content.cloneNode(true); if(sLs){sLs(nR.firstElementChild);} l.appendChild(nR);}
window.removeRow = function(btn){btn.closest('tr').remove();}

// --- Fungsi Setup Listeners ---
function setupBahayaListeners(row) { const s=row.querySelectorAll('select'); s.forEach(sl=>{sl.addEventListener('change',()=>calculateRisk(row));});}
function setupRambuListeners(row) { const c=row.querySelectorAll('input[type="checkbox"]'); c.forEach(cb=>{cb.addEventListener('change',()=>updateRambuScore(row));});}

// --- Fungsi Submit Form Utama (Handle Revisi & Baru) ---
async function handleSubmitForm(event) {
    event.preventDefault();
    const statusMessage = document.getElementById('status-message');

    // Pastikan user terautentikasi (anonim atau login)
    if (!auth.currentUser) {
        statusMessage.textContent = 'Sedang mengautentikasi...';
        try { await auth.signInAnonymously(); } 
        catch (e) { statusMessage.textContent = 'Gagal autentikasi. Refresh halaman.'; statusMessage.className = 'error'; return; }
    }

    submitButton.disabled = true; submitButton.textContent = 'Menyimpan...'; statusMessage.textContent = '';
    
    try {
        const formData = new FormData(k3Form);
        const mainData = {
            pelaksana: formData.get('pelaksana'), satker: formData.get('satker'),
            namaKegiatan: formData.get('namaKegiatan'), lokasiKegiatan: formData.get('lokasiKegiatan'),
            tanggalPenilaian: formData.get('tanggalPenilaian'), tanggalKegiatan: formData.get('tanggalKegiatan'),
        };
        const bahayaRows = document.querySelectorAll('#bahaya-list tr'); const bahayaData = [];
        bahayaRows.forEach(r=>{bahayaData.push({identifikasi:r.querySelector('[name="identifikasi"]').value,risiko:r.querySelector('[name="risiko"]').value,peluang:r.querySelector('[name="peluang"]').value,akibat:r.querySelector('[name="akibat"]').value,tingkatRisiko:r.querySelector('[name="tingkatRisiko"]').value,pengendalian:r.querySelector('[name="pengendalian"]').value});});
        const rambuRows = document.querySelectorAll('#rambu-list tr'); const rambuData = [];
        rambuRows.forEach(r=>{rambuData.push({namaRambu:r.querySelector('[name="namaRambu"]').value,lokasi:r.querySelector('[name="lokasi"]').value,jenisRambu:r.querySelector('[name="jenisRambu"]').value,kondisiJelas:{jelas_a:r.querySelector('[name="jelas_a"]').checked,jelas_b:r.querySelector('[name="jelas_b"]').checked,jelas_c:r.querySelector('[name="jelas_c"]').checked},kondisiPosisi:{posisi_a:r.querySelector('[name="posisi_a"]').checked,posisi_b:r.querySelector('[name="posisi_b"]').checked,posisi_c:r.querySelector('[name="posisi_c"]').checked},kondisiBersih:{bersih_a:r.querySelector('[name="bersih_a"]').checked,bersih_b:r.querySelector('[name="bersih_b"]').checked,bersih_c:r.querySelector('[name="bersih_c"]').checked},totalSkor:parseInt(r.querySelector('[name="totalSkor"]').value,10)||0,hasil:r.querySelector('[name="hasil"]').value,tindakanPerbaikan:r.querySelector('[name="tindakanPerbaikan"]').value});});
        
        const finalReportData = { ...mainData, daftarBahaya: bahayaData, inspeksiRambu: rambuData };

        if (isRevising && currentRevisingId) {
            // --- MODE REVISI ---
            await db.collection('laporanK3').doc(currentRevisingId).update({
                ...finalReportData,
                statusLaporan: 'Submitted',
                diperiksaOlehK3_uid: null, diperiksaOlehK3_nama: null, tanggalDiperiksaK3: null, catatanK3: null,
                disetujuiOlehTU_uid: null, disetujuiOlehTU_nama: null, tanggalDisetujuiTU: null, catatanTU: null,
                lastRevisedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            statusMessage.innerHTML = `Laporan (ID: ${currentRevisingId}) berhasil direvisi.`;
            statusMessage.className = 'success';
            // Reset mode revisi
            isRevising = false; currentRevisingId = null;
            formTitle.textContent = "1. Informasi Kegiatan"; submitButton.textContent = "Submit Laporan";
        } else {
            // --- MODE SUBMIT BARU ---
            const docRef = await db.collection('laporanK3').add({
                ...finalReportData,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: auth.currentUser.uid,
                isAnonymous: auth.currentUser.isAnonymous,
                statusLaporan: 'Submitted',
                diperiksaOlehK3_uid: null, diperiksaOlehK3_nama: null, tanggalDiperiksaK3: null, catatanK3: null,
                disetujuiOlehTU_uid: null, disetujuiOlehTU_nama: null, tanggalDisetujuiTU: null, catatanTU: null
            });
            statusMessage.innerHTML = `Laporan berhasil disimpan! <a href="/api/laporan/${docRef.id}/download" target="_blank">Download PDF</a>`;
            statusMessage.className = 'success';
        }
        
        k3Form.reset();
        document.getElementById('bahaya-list').innerHTML = ''; document.getElementById('rambu-list').innerHTML = '';
        addRow('bahaya-template', 'bahaya-list', setupBahayaListeners); addRow('rambu-template', 'rambu-list', setupRambuListeners);

    } catch (error) {
        console.error("Error saving:", error);
        statusMessage.textContent = 'Gagal menyimpan laporan. ' + error.message;
        statusMessage.className = 'error';
    } finally { 
        submitButton.disabled = false; 
        if (!isRevising) submitButton.textContent = 'Submit Laporan';
    }
}

// --- Fungsi Handler Auth ---
async function handleLogin(e) { e.preventDefault(); authStatus.textContent = 'Login...'; try { await auth.signInWithEmailAndPassword(emailInput.value, passwordInput.value); } catch (error) { authStatus.textContent = error.message; }}
async function handleLogout() { try { await auth.signOut(); } catch (error) { console.error("Logout Gagal:", error); }}

// --- Fungsi Pencarian Publik (PERUBAHAN UTAMA DI SINI) ---
async function fetchPublicReports() {
    // Pastikan hanya dijalankan jika user sudah terautentikasi (termasuk anonim)
    if (!auth.currentUser) return; 

    isPublicSearchReady = false;
    if (publicListStatus) { publicListStatus.textContent = 'Memuat data...'; publicListStatus.className = 'loading'; }
    
    try {
        // Query ini HARUS cocok dengan Security Rules: statusLaporan == 'Approved_TU'
        // .orderBy('createdAt', 'desc') DIHAPUS untuk menghindari error FAILED_PRECONDITION (missing index)
        const snapshot = await db.collection('laporanK3')
            .where('statusLaporan', '==', 'Approved_TU')
            .get();
            
        allPublicReports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // (BARU) Urutkan laporan di sisi klien (JS) karena orderBy dihapus dari query
        allPublicReports.sort((a, b) => {
            const timeA = a.createdAt ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt ? b.createdAt.toMillis() : 0;
            return timeB - timeA; // Urutkan dari terbaru (descending)
        });

        isPublicSearchReady = true;
        if (publicListStatus) {
             publicListStatus.textContent = `Siap. ${allPublicReports.length} laporan publik termuat.`;
             publicListStatus.className = 'success';
        }
        searchAndDisplayPublicReports(true); // Tampilkan semua di awal
    } catch (error) {
        console.error("Error fetching public reports:", error);
        if (publicListStatus) {
            publicListStatus.textContent = 'Gagal memuat data publik. (Cek Security Rules/Network)';
            publicListStatus.className = 'error';
        }
    }
}

function searchAndDisplayPublicReports(showAll = false) {
    if (!isPublicSearchReady || !publicListUl) return;
    const searchTerm = searchTermInput ? searchTermInput.value.toLowerCase().trim() : '';
    publicListUl.innerHTML = '';

    const reportsToDisplay = showAll ? allPublicReports : allPublicReports.filter(r => 
        (r.namaKegiatan||'').toLowerCase().includes(searchTerm) || 
        (r.pelaksana||'').toLowerCase().includes(searchTerm) || 
        (r.lokasiKegiatan||'').toLowerCase().includes(searchTerm)
    );

    if (reportsToDisplay.length === 0 && !showAll && searchTerm) {
        publicListStatus.textContent = `Tidak ada hasil untuk "${searchTerm}".`;
    } else if (reportsToDisplay.length === 0 && showAll) {
         publicListStatus.textContent = 'Belum ada laporan publik.';
    }

    reportsToDisplay.forEach(report => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div><strong>${report.namaKegiatan || 'Tanpa Nama'}</strong><br>
            <small>${report.pelaksana || '-'} | ${report.lokasiKegiatan || '-'} | ${formatDate(report.tanggalPenilaian)}</small></div>
            <div><a href="/api/laporan/${report.id}/download" target="_blank" class="btn btn-secondary btn-sm">PDF</a></div>
        `;
        publicListUl.appendChild(li);
    });
}

// --- Fungsi Review Laporan ---
function loadReportsForReview() {
    if (!auth.currentUser) return; // Safety check
    if (unsubscribeReviewListener) unsubscribeReviewListener();
    if (reviewListUl) reviewListUl.innerHTML = '<li>Memuat...</li>';

    let query = db.collection('laporanK3');
    if (userRole === 'KetuaK3') {
        query = query.where('statusLaporan', 'in', ['Submitted', 'Rejected_TU']);
    } else if (userRole === 'KabagTU') {
        query = query.where('statusLaporan', 'in', ['Reviewed_K3', 'Rejected_K3']);
    } else if (!auth.currentUser.isAnonymous) { // Pelaksana Login
        query = query.where('createdBy', '==', auth.currentUser.uid).where('statusLaporan', 'in', ['Rejected_K3', 'Rejected_TU']);
    } else {
        if (reviewListUl) reviewListUl.innerHTML = '<li>Silakan login untuk melihat status laporan Anda.</li>';
        return;
    }

    unsubscribeReviewListener = query.orderBy('createdAt', 'desc').onSnapshot(snapshot => {
        if (!reviewListUl) return;
        if (snapshot.empty) { reviewListUl.innerHTML = '<li>Tidak ada laporan yang perlu ditindaklanjuti.</li>'; return; }
        reviewListUl.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const li = document.createElement('li');
            const isRevisable = ['Rejected_TU', 'Rejected_K3'].includes(data.statusLaporan) && data.createdBy === auth.currentUser.uid;
            li.innerHTML = `
                <div><strong>${data.namaKegiatan || 'Tanpa Nama'}</strong><br><small>${data.pelaksana} | ${formatDate(data.tanggalPenilaian)}</small></div>
                <div style="display:flex;gap:5px;align-items:center">
                    ${isRevisable ? `<button class="btn btn-secondary btn-sm" onclick="loadReportForRevision(event, '${doc.id}')">Revisi</button>` : ''}
                    <span class="status status-${data.statusLaporan}">${data.statusLaporan.replace(/_/g,' ')}</span>
                </div>`;
            li.addEventListener('click', (e) => { if(e.target.tagName!=='BUTTON') showReportDetail(doc.id); });
            reviewListUl.appendChild(li);
        });
    }, err => { 
        console.error("Review listener error:", err); 
        // Jika admin gagal query review, mereka juga butuh Indeks.
        if (err.code === 'failed-precondition' && reviewListUl) {
            reviewListUl.innerHTML = '<li>Gagal: Indeks Firestore dibutuhkan. Cek konsol F12 untuk link pembuatan indeks.</li>';
        } else if (reviewListUl) {
            reviewListUl.innerHTML = '<li>Gagal memuat data review.</li>';
        }
    });
}

// --- Fungsi Load Revisi & Detail (Disederhanakan) ---
async function loadReportForRevision(event, reportId) {
    event.stopPropagation();
    try {
        const doc = await db.collection('laporanK3').doc(reportId).get();
        if (!doc.exists) throw new Error("Laporan hilang.");
        const data = doc.data();
        if(data.createdBy !== auth.currentUser.uid) throw new Error("Anda bukan pembuat laporan ini.");

        // Isi Form
        k3Form.pelaksana.value = data.pelaksana||''; k3Form.satker.value = data.satker||'';
        k3Form.namaKegiatan.value = data.namaKegiatan||''; k3Form.lokasiKegiatan.value = data.lokasiKegiatan||'';
        k3Form.tanggalPenilaian.value = data.tanggalPenilaian||''; k3Form.tanggalKegiatan.value = data.tanggalKegiatan||'';
        
        // Isi Bahaya & Rambu (hapus dulu yang ada)
        document.getElementById('bahaya-list').innerHTML=''; document.getElementById('rambu-list').innerHTML='';
        if(data.daftarBahaya) data.daftarBahaya.forEach(i => addRow('bahaya-template','bahaya-list',r=>{
            r.querySelector('[name="identifikasi"]').value=i.identifikasi; r.querySelector('[name="risiko"]').value=i.risiko;
            r.querySelector('[name="peluang"]').value=i.peluang; r.querySelector('[name="akibat"]').value=i.akibat;
            r.querySelector('[name="pengendalian"]').value=i.pengendalian; calculateRisk(r);
        }));
        if(data.inspeksiRambu) data.inspeksiRambu.forEach(i => addRow('rambu-template','rambu-list',r=>{
            r.querySelector('[name="namaRambu"]').value=i.namaRambu; r.querySelector('[name="lokasi"]').value=i.lokasi;
            r.querySelector('[name="jenisRambu"]').value=i.jenisRambu; r.querySelector('[name="tindakanPerbaikan"]').value=i.tindakanPerbaikan;
            r.querySelector('[name="jelas_a"]').checked=i.kondisiJelas.jelas_a; r.querySelector('[name="jelas_b"]').checked=i.kondisiJelas.jelas_b; r.querySelector('[name="jelas_c"]').checked=i.kondisiJelas.jelas_c;
            r.querySelector('[name="posisi_a"]').checked=i.kondisiPosisi.posisi_a; r.querySelector('[name="posisi_b"]').checked=i.kondisiPosisi.posisi_b; r.querySelector('[name="posisi_c"]').checked=i.kondisiPosisi.posisi_c;
            r.querySelector('[name="bersih_a"]').checked=i.kondisiBersih.bersih_a; r.querySelector('[name="bersih_b"]').checked=i.kondisiBersih.bersih_b; r.querySelector('[name="bersih_c"]').checked=i.kondisiBersih.bersih_c;
            updateRambuScore(r);
        }));

        // Set Mode Revisi
        isRevising = true; currentRevisingId = reportId;
        formTitle.textContent = `Merevisi Laporan (ID: ${reportId.substring(0, 6)}...)`;
        submitButton.textContent = "Submit Revisi";
        k3Form.scrollIntoView({ behavior: 'smooth' });
    } catch (e) { alert(e.message); }
}
window.loadReportForRevision = loadReportForRevision; // Global

async function showReportDetail(rId) {
    currentReviewReportId = rId;
    reviewListContainer.classList.add('hidden'); reviewDetail.classList.remove('hidden');
    reviewReportContent.innerHTML = 'Loading...'; reviewActions.innerHTML = '';
    try {
        const doc = await db.collection('laporanK3').doc(rId).get();
        if (!doc.exists) { throw new Error("Laporan tidak ditemukan"); }
        const d = doc.data();
        reviewReportIdSpan.textContent = `(${rId.substring(0,6)}...)`;
        
        // Versi bersih dari render detail
        reviewReportContent.innerHTML = `
            <h5>Informasi Utama</h5>
            <p><strong>ID Laporan:</strong> ${rId}</p>
            <p><strong>Pelaksana:</strong> ${d.pelaksana || '-'}</p>
            <p><strong>Kegiatan:</strong> ${d.namaKegiatan || '-'}</p>
            <p><strong>Lokasi:</strong> ${d.lokasiKegiatan || '-'}</p>
            <p><strong>Status:</strong> <span class="status status-${d.statusLaporan}">${d.statusLaporan.replace(/_/g,' ')}</span></p>
            ${d.diperiksaOlehK3_nama ? `<p><strong>Diperiksa K3:</strong> ${d.diperiksaOlehK3_nama}</p>` : ''}
            ${d.catatanK3 ? `<p><em>Catatan K3: ${d.catatanK3}</em></p>` : ''}
            ${d.disetujuiOlehTU_nama ? `<p><strong>Disetujui TU:</strong> ${d.disetujuiOlehTU_nama}</p>` : ''}
            ${d.catatanTU ? `<p><em>Catatan TU: ${d.catatanTU}</em></p>` : ''}
            <p><a href="/api/laporan/${rId}/download" target="_blank">Download PDF Lengkap</a></p>`;
        
        // Tombol Approval
        if((userRole==='KetuaK3' && ['Submitted','Rejected_TU'].includes(d.statusLaporan)) || 
           (userRole==='KabagTU' && ['Reviewed_K3','Rejected_K3'].includes(d.statusLaporan))) {
            
            reviewActions.innerHTML = `<label for="review-notes">Catatan Approval (wajib jika menolak):</label>
                <textarea id="review-notes" rows="3"></textarea>
                <div class="action-buttons" style="margin-top:5px">
                    <button class="btn btn-approve" onclick="handleApproval(true)">Setujui</button>
                    <button class="btn btn-reject" onclick="handleApproval(false)">Tolak</button>
                </div>`;
            reviewNotesTextarea = document.getElementById('review-notes');

            // Logika baru untuk mengisi catatan sebelumnya (YANG SUDAH DIPERBAIKI)
            if (userRole === 'KetuaK3' && d.catatanK3) {
                reviewNotesTextarea.value = d.catatanK3;
            } else if (userRole === 'KabagTU' && d.catatanTU) {
                reviewNotesTextarea.value = d.catatanTU;
            } else if (userRole === 'KetuaK3' && d.statusLaporan === 'Rejected_TU' && d.catatanTU) {
                reviewNotesTextarea.value = `Ditolak TU: ${d.catatanTU}\n\nCatatan K3: `;
            } else if (userRole === 'KabagTU' && d.statusLaporan === 'Rejected_K3' && d.catatanK3) {
                reviewNotesTextarea.value = `Ditolak K3: ${d.catatanK3}\n\nCatatan TU: `;
            }
        }
    } catch(e) { console.error("Error show detail:", e); reviewReportContent.innerHTML = 'Gagal muat detail.'; }
}
function backToList() { reviewDetail.classList.add('hidden'); reviewListContainer.classList.remove('hidden'); currentReviewReportId=null; }

async function handleApproval(isApproved) {
    if(!currentReviewReportId) return;
    const notes = reviewNotesTextarea.value.trim();
    if(!isApproved && !notes) { alert("Wajib isi catatan jika menolak."); return; }

    let newStatus = isApproved ? (userRole==='KetuaK3'?'Reviewed_K3':'Approved_TU') : (userRole==='KetuaK3'?'Rejected_K3':'Rejected_TU');
    const updateData = { statusLaporan: newStatus };
    const ts = firebase.firestore.FieldValue.serverTimestamp();
    
    if(userRole==='KetuaK3') {
        updateData.diperiksaOlehK3_uid=auth.currentUser.uid; updateData.diperiksaOlehK3_nama=auth.currentUser.email;
        updateData.tanggalDiperiksaK3=ts; updateData.catatanK3=notes||null;
        updateData.disetujuiOlehTU_uid=null; // Reset TU jika direview ulang
    } else {
        updateData.disetujuiOlehTU_uid=auth.currentUser.uid; updateData.disetujuiOlehTU_nama=auth.currentUser.email;
        updateData.tanggalDisetujuiTU=ts; updateData.catatanTU=notes||null;
        if(!isApproved) { // Jika TU menolak, kembalikan ke Submitted (K3 harus review lagi)
             updateData.statusLaporan = 'Submitted'; 
             updateData.catatanTU = `(DITOLAK TU) ${notes}`; // Perjelas catatan
        }
    }

    try { await db.collection('laporanK3').doc(currentReviewReportId).update(updateData); backToList(); }
    catch(e) { alert("Gagal update status."); }
}
window.handleApproval = handleApproval; // Global

// --- MAIN EVENT LISTENER ---
document.addEventListener('DOMContentLoaded', () => {
    // Init UI Elements
    loginForm=document.getElementById('login-form'); emailInput=document.getElementById('email'); passwordInput=document.getElementById('password'); authStatus=document.getElementById('auth-status'); logoutButton=document.getElementById('logout-button'); userInfo=document.getElementById('user-info'); userEmail=document.getElementById('user-email'); adminArea=document.getElementById('admin-area'); rekapBulanSelect=document.getElementById('rekap-bulan'); rekapTahunSelect=document.getElementById('rekap-tahun'); downloadRekapBtn=document.getElementById('download-rekap-pdf-btn'); rekapStatus=document.getElementById('rekap-status');
    reviewSection=document.getElementById('review-section'); reviewListContainer=document.getElementById('review-list-container'); reviewListUl=document.getElementById('review-list'); reviewDetail=document.getElementById('review-detail'); reviewReportIdSpan=document.getElementById('review-report-id'); reviewReportContent=document.getElementById('review-report-content'); reviewActions=document.getElementById('review-actions'); k3Form=document.getElementById('k3-form'); backToListBtn=document.getElementById('back-to-list-btn');
    publicViewSection=document.getElementById('public-view-section'); searchTermInput=document.getElementById('search-term'); searchBtn=document.getElementById('search-btn'); publicListContainer=document.getElementById('public-list-container'); publicListUl=document.getElementById('public-list'); publicListStatus=document.getElementById('public-list-status');
    formTitle=k3Form ? k3Form.querySelector('legend') : null; submitButton=document.getElementById('submit-button');

    if (!k3Form || !loginForm) { console.error("Critical UI missing"); return; }

    // --- AUTH LISTENER UTAMA ---
    auth.onAuthStateChanged(user => {
        // 1. Reset semua state UI saat status auth berubah
        unsubscribeReviewListener && unsubscribeReviewListener();
        loginForm.classList.add('hidden'); userInfo.classList.add('hidden');
        adminArea.classList.add('hidden'); reviewSection.classList.add('hidden');
        if(authStatus) authStatus.textContent = 'Memeriksa sesi...';

        if (user) {
            // User sudah punya sesi (baik anonim atau login email)
            currentUser = user;
            const emailLower = user.email ? user.email.toLowerCase() : '';
            if(authStatus) authStatus.textContent = '';

            // Tentukan Role & UI
            if (user.isAnonymous) {
                userRole = 'Pelaksana';
                loginForm.classList.remove('hidden'); // Tampilkan form login untuk opsi upgrade
                if(authStatus) authStatus.textContent = 'Mode Tamu (Anonim). Login untuk fitur admin.';
            } else {
                userInfo.classList.remove('hidden');
                userEmail.textContent = user.email;
                if (emailLower === KETUA_K3_EMAIL.toLowerCase()) { userRole = 'KetuaK3'; adminArea.classList.remove('hidden'); reviewSection.classList.remove('hidden'); }
                else if (emailLower === KABAG_TU_EMAIL.toLowerCase()) { userRole = 'KabagTU'; adminArea.classList.remove('hidden'); reviewSection.classList.remove('hidden'); }
                else { userRole = 'Pelaksana'; reviewSection.classList.remove('hidden'); } // Pelaksana login lihat revisi
            }
            
            console.log(`Auth state changed: ${user.uid} (${userRole})`);
            // **PENTING: Panggil fungsi data HANYA di sini**
            fetchPublicReports(); // <-- Ini sekarang aman
            if (!user.isAnonymous || userRole !== 'Pelaksana') loadReportsForReview();

        } else {
            // User belum punya sesi sama sekali -> Sign-in Anonim otomatis
            console.log("No user. Signing in anonymously...");
            if(authStatus) authStatus.textContent = 'Membuat sesi tamu...';
            auth.signInAnonymously().catch(e => {
                console.error("Anon auth failed", e);
                if(authStatus) authStatus.textContent = 'Gagal membuat sesi tamu.';
            });
        }
    });

    // Event Listeners Dasar
    addRow('bahaya-template', 'bahaya-list', setupBahayaListeners);
    addRow('rambu-template', 'rambu-list', setupRambuListeners);
    document.getElementById('add-bahaya').addEventListener('click',()=>addRow('bahaya-template','bahaya-list',setupBahayaListeners));
    document.getElementById('add-rambu').addEventListener('click',()=>addRow('rambu-template','rambu-list',setupRambuListeners));
    
    k3Form.addEventListener('submit', handleSubmitForm);
    loginForm.addEventListener('submit', handleLogin);
    if(logoutButton) logoutButton.addEventListener('click', handleLogout);
    if(backToListBtn) backToListBtn.addEventListener('click', backToList);
    if(searchBtn) searchBtn.addEventListener('click', ()=>searchAndDisplayPublicReports(false));
    if(searchTermInput) searchTermInput.addEventListener('keypress',e=>{if(e.key==='Enter')searchAndDisplayPublicReports(false)});
    
    // Panggil populateDateSelectors yang ada di kode asli Anda
    if (rekapBulanSelect) {
        populateDateSelectors();
    }
    // Panggil listener untuk rekap PDF yang ada di kode asli Anda
    if (downloadRekapBtn) {
        downloadRekapBtn.addEventListener('click', handleDownloadRekapPDF);
    }
});

// Tambahkan kembali fungsi populateDateSelectors dan handleDownloadRekapPDF
// yang ada di kode asli Anda
function populateDateSelectors() {
    if (!rekapBulanSelect || !rekapTahunSelect) return;
    const blnS=rekapBulanSelect; 
    const thnS=rekapTahunSelect;
    const blns=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]; 
    blns.forEach((b,i)=>{const o=document.createElement('option'); o.value=(i+1).toString().padStart(2,'0'); o.textContent=b; blnS.appendChild(o);}); 
    const thnI=new Date().getFullYear(); 
    for(let i=0;i<5;i++){const t=thnI-i; const o=document.createElement('option'); o.value=t; o.textContent=t; thnS.appendChild(o);} 
    blnS.value=(new Date().getMonth()+1).toString().padStart(2,'0'); 
    thnS.value=thnI;
}

async function handleDownloadRekapPDF() { 
    const user=auth.currentUser; 
    if(!user||user.isAnonymous){alert("Akses ditolak.");return;} 
    const bln=rekapBulanSelect.value; 
    const thn=rekapTahunSelect.value; 
    const fName=`rekap-pdf-k3-mij-${thn}-${bln}.zip`; 
    downloadRekapBtn.textContent='Membuat ZIP...'; 
    downloadRekapBtn.disabled=true; 
    rekapStatus.textContent='Mengambil data...'; 
    try {
        const token=await user.getIdToken(); 
        const response=await fetch(`/api/rekap/pdf-bundle?month=${bln}&year=${thn}`,{headers:{'Authorization':`Bearer ${token}`}}); 
        if(response.ok){
            rekapStatus.textContent='Membuat PDF...'; 
            const blob=await response.blob(); 
            if(blob.type!=='application/zip'){const text=await blob.text(); throw new Error(text||"Tdk ada laporan.");} 
            rekapStatus.textContent='Mengunduh...'; 
            const url=window.URL.createObjectURL(blob); 
            const a=document.createElement('a'); 
            a.style.display='none'; a.href=url; a.download=fName; 
            document.body.appendChild(a); a.click(); 
            window.URL.revokeObjectURL(url); a.remove(); 
            rekapStatus.textContent=`Berhasil: ${fName}`;
        } else {
            const errTxt=await response.text(); throw new Error(errTxt||'Gagal unduh.');
        }
    } catch(error){
        console.error("Gagal download rekap:",error); 
        rekapStatus.textContent=`Gagal: ${error.message}`;
    } finally {
        downloadRekapBtn.textContent='Download Rekap (.zip)'; 
        downloadRekapBtn.disabled=false;
    }
}