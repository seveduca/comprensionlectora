// ============================================================
// GENERADOR DE EVALUACIONES - VERSIÓN 1.7.3 (ESTABLE 2026)
// ============================================================

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent';
const APP_VERSION = '1.7.3 - Conexión v1 Estable (2026)';

document.addEventListener('DOMContentLoaded', () => {
    console.log("Iniciando Ver 1.7.3 (2026)...");

    // --- VARIABLES ---
    let generatedQuestions = [];
    let uploadedImageBase64 = '';
    let extractedImageText = '';
    let selectedFile = null;

    // --- ELEMENTOS ---
    const versionEl = document.getElementById('app-version');
    const phaseSetup = document.getElementById('phase-setup');
    const phaseLoading = document.getElementById('phase-loading');
    const phaseReview = document.getElementById('phase-review');
    const btnGenerate = document.getElementById('btnGenerate');
    const btnBack = document.getElementById('btnBackToSetup');
    const btnDownload = document.getElementById('btnDownloadPDF');
    const textContent = document.getElementById('textContent');
    const fileInput = document.getElementById('fileInput');
    const fileDropArea = document.getElementById('fileDropArea');
    const fileName = document.getElementById('fileName');
    const settingsModal = document.getElementById('settingsModal');
    const btnSettings = document.getElementById('btnSettings');
    const btnCloseModal = document.getElementById('btnCloseModal');
    const btnSaveApi = document.getElementById('btnSaveApi');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const errorBanner = document.getElementById('errorBanner');
    const errorMessage = document.getElementById('errorMessage');

    // Inicializar Versión
    if (versionEl) versionEl.textContent = APP_VERSION;

    // --- FUNCIONES ---
    function showError(msg) {
        if (errorBanner && errorMessage) {
            errorMessage.textContent = msg;
            errorBanner.style.display = 'block';
            errorBanner.scrollIntoView({ behavior: 'smooth' });
        } else alert("Error: " + msg);
    }

    function switchPhase(p) {
        [phaseSetup, phaseLoading, phaseReview].forEach(el => { if(el) el.classList.remove('active'); });
        if (p === 'setup') phaseSetup?.classList.add('active');
        if (p === 'loading') phaseLoading?.classList.add('active');
        if (p === 'review') phaseReview?.classList.add('active');
    }

    // --- EVENTOS ---
    if (btnSettings) btnSettings.addEventListener('click', () => settingsModal?.classList.add('open'));
    if (btnCloseModal) btnCloseModal.addEventListener('click', () => settingsModal?.classList.remove('open'));
    if (btnSaveApi) btnSaveApi.addEventListener('click', () => {
        localStorage.setItem('gemini_api_key', apiKeyInput.value.trim());
        settingsModal?.classList.remove('open');
    });

    // Pestañas
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.getAttribute('data-target');
            document.getElementById(target)?.classList.add('active');
        });
    });

    // Archivos
    if (fileDropArea) fileDropArea.addEventListener('click', () => fileInput?.click());
    if (fileInput) fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            selectedFile = e.target.files[0];
            fileName.textContent = '📎 ' + selectedFile.name;
            if (selectedFile.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = ev => { uploadedImageBase64 = ev.target.result; };
                reader.readAsDataURL(selectedFile);
            }
        }
    });

    // --- LÓGICA ---
    async function extractText(file) {
        if (file.type === 'application/pdf') {
            const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
            let t = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                t += (await page.getTextContent()).items.map(it => it.str).join(' ') + ' ';
            }
            return t.trim();
        } else {
            const res = await Tesseract.recognize(file, 'spa');
            extractedImageText = res.data.text;
            return res.data.text.trim();
        }
    }

    if (btnGenerate) {
        btnGenerate.addEventListener('click', async () => {
            const key = localStorage.getItem('gemini_api_key');
            if (!key) { settingsModal?.classList.add('open'); return; }
            if (errorBanner) errorBanner.style.display = 'none';

            const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-target');
            switchPhase('loading');
            
            try {
                let text = '';
                if (activeTab === 'tab-text') text = textContent.value.trim();
                else if (selectedFile) text = await extractText(selectedFile);

                if (!text) throw new Error('No hay texto para procesar.');

                const grade = document.getElementById('gradeLevel')?.value;
                const count = document.getElementById('questionCount')?.value;
                const altCount = document.querySelector('input[name="altCount"]:checked')?.value;

                const prompt = `Crea una evaluación de lectura para ${grade}. ${count} preguntas, ${altCount} alternativas. Texto: "${text}". Responde SOLO JSON: {"questions":[{"strategy":"...","question":"...","options":["A)","B)"],"correctIndex":0}]}`;

                const resp = await fetch(GEMINI_API_URL + '?key=' + key, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } })
                });

                if (!resp.ok) {
                    const errorData = await resp.json();
                    throw new Error(errorData.error ? errorData.error.message : 'Error Connection');
                }

                const data = await resp.json();
                const raw = data.candidates[0].content.parts[0].text;
                const clean = raw.substring(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
                generatedQuestions = JSON.parse(clean).questions;

                renderReview();
                switchPhase('review');
            } catch (e) {
                showError("Fallo: " + e.message);
                setTimeout(() => switchPhase('setup'), 3000);
            }
        });
    }

    function renderReview() {
        const div = document.getElementById('questionsPreview');
        if (div) {
            div.innerHTML = generatedQuestions.map((q, i) => `
                <div class="preview-item" style="padding:15px; border:1px solid #eee; border-radius:8px; margin-bottom:15px; background:#fcfcfc;">
                    <h4>${i+1}. ${q.question}</h4>
                    <p style="font-size:11px; color:#666;">Estrategia: ${q.strategy}</p>
                    <ul style="list-style:none; padding-left:0;">
                        ${q.options.map(o => `<li style="padding:6px; border:1px solid #ddd; margin-top:4px; border-radius:4px; font-size:14px;">${o}</li>`).join('')}
                    </ul>
                </div>
            `).join('');
        }
    }

    if (btnDownload) {
        btnDownload.addEventListener('click', () => {
            const element = document.createElement('div');
            element.style.padding = '30px';
            element.innerHTML = `<h1>Evaluación de Lectura</h1><p><b>Nivel:</b> ${document.getElementById('gradeLevel')?.value}</p><hr><p>${(textContent.value || extractedImageText).replace(/\n/g, '<br>')}</p><h2>Preguntas:</h2>`;
            element.innerHTML += generatedQuestions.map((q, i) => `<p><b>${i+1}. ${q.question}</b><br>${q.options.join('<br>')}</p>`).join('');
            element.innerHTML += `<hr><h3>Respuestas:</h3>` + generatedQuestions.map((q, i) => `<p>${i+1}: ${q.options[q.correctIndex]}</p>`).join('');
            
            html2pdf().set({ margin: 1.5, filename: 'prueba_lectura.pdf', jsPDF: { unit: 'cm', format: 'letter' } }).from(element).save();
        });
    }

    if (btnBack) btnBack.addEventListener('click', () => switchPhase('setup'));
    
    // Auto-teclado para el textarea (Asegurar que sea editable)
    if (textContent) {
        textContent.removeAttribute('readonly');
        textContent.removeAttribute('disabled');
        textContent.style.pointerEvents = 'auto';
    }
});