// ============================================================
// GENERADOR DE EVALUACIONES DE COMPRENSIÓN LECTORA - V1.7.1
// ============================================================

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent';
const APP_VERSION = '1.7.1 - Edición Estable v1 (Fix)';

document.addEventListener('DOMContentLoaded', () => {
    console.log("Iniciando Generador v1.7.1...");
    
    // --- VARIABLES DE ESTADO ---
    let currentPhase = 'setup';
    let generatedQuestions = [];
    let currentGrade = '';
    let currentOptionsCount = 4;
    let selectedFile = null;
    let uploadedImageBase64 = '';
    let extractedImageText = '';

    // --- ELEMENTOS DEL DOM ---
    const elements = {
        version: document.getElementById('app-version'),
        banner: document.getElementById('errorBanner'),
        errorMsg: document.getElementById('errorMessage'),
        setup: document.getElementById('phase-setup'),
        loading: document.getElementById('phase-loading'),
        review: document.getElementById('phase-review'),
        textContent: document.getElementById('textContent'),
        fileInput: document.getElementById('fileInput'),
        fileDropArea: document.getElementById('fileDropArea'),
        fileName: document.getElementById('fileName'),
        btnGenerate: document.getElementById('btnGenerate'),
        btnBack: document.getElementById('btnBackToSetup'),
        btnDownload: document.getElementById('btnDownloadPDF'),
        modal: document.getElementById('settingsModal'),
        btnSettings: document.getElementById('btnSettings'),
        btnCloseModal: document.getElementById('btnCloseModal'),
        apiKeyInput: document.getElementById('apiKeyInput'),
        btnSaveApi: document.getElementById('btnSaveApi'),
        loadingText: document.getElementById('loadingText')
    };

    // --- FUNCIONES AUXILIARES ---
    function showError(msg) {
        if (elements.banner && elements.errorMsg) {
            elements.errorMsg.textContent = msg;
            elements.banner.style.display = 'block';
            elements.banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            alert("Error: " + msg);
        }
    }

    function hideError() {
        if (elements.banner) elements.banner.style.display = 'none';
    }

    function switchPhase(phase) {
        [elements.setup, elements.loading, elements.review].forEach(p => {
            if (p) p.classList.remove('active');
        });
        const target = elements[phase];
        if (target) target.classList.add('active');
        currentPhase = phase;
    }

    // --- INICIALIZACIÓN ---
    if (elements.version) elements.version.textContent = APP_VERSION;
    
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey && elements.apiKeyInput) elements.apiKeyInput.value = savedKey;

    try {
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
        }
    } catch(e) { console.warn("PDF.js worker error", e); }

    // --- EVENTOS ---
    if (elements.btnSettings) elements.btnSettings.onclick = () => elements.modal?.classList.add('open');
    if (elements.btnCloseModal) elements.btnCloseModal.onclick = () => elements.modal?.classList.remove('open');
    if (elements.btnSaveApi) elements.btnSaveApi.onclick = () => {
        localStorage.setItem('gemini_api_key', elements.apiKeyInput.value.trim());
        elements.modal?.classList.remove('open');
    };

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId)?.classList.add('active');
        };
    });

    if (elements.fileDropArea) elements.fileDropArea.onclick = () => elements.fileInput?.click();
    if (elements.fileInput) {
        elements.fileInput.onchange = (e) => {
            if (e.target.files.length > 0) {
                selectedFile = e.target.files[0];
                if (elements.fileName) elements.fileName.textContent = '📎 ' + selectedFile.name;
                if (selectedFile.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = ev => { uploadedImageBase64 = ev.target.result; };
                    reader.readAsDataURL(selectedFile);
                }
            }
        };
    }

    // --- LÓGICA DE GENERACIÓN ---
    async function extractText(file) {
        if (file.type === 'application/pdf') {
            const data = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data }).promise;
            let text = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                text += content.items.map(it => it.str).join(' ') + ' ';
            }
            return text.trim();
        } else {
            const res = await Tesseract.recognize(file, 'spa');
            extractedImageText = res.data.text;
            return res.data.text.trim();
        }
    }

    const gradeMap = {
        '1ro Básico': '6-7 años. Muy simple.',
        '2do Básico': '7-8 años.',
        '3ro Básico': '8-9 años.',
        '4to Básico': '9-10 años.',
        '5to Básico': '10-11 años.',
        '6to Básico': '11-12 años.',
        '7mo Básico': '12-13 años.',
        '8vo Básico': '13-14 años.'
    };

    if (elements.btnGenerate) {
        elements.btnGenerate.onclick = async () => {
            const key = localStorage.getItem('gemini_api_key');
            if (!key) { elements.modal?.classList.add('open'); return; }
            hideError();

            const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-target');
            switchPhase('loading');
            if (elements.loadingText) elements.loadingText.textContent = 'Procesando lectura...';

            try {
                let text = '';
                if (activeTab === 'tab-text') {
                    text = elements.textContent.value.trim();
                } else if (selectedFile) {
                    text = await extractText(selectedFile);
                }
                
                if (!text) throw new Error('No hay texto para analizar.');

                const grade = document.getElementById('gradeLevel')?.value || '1ro Básico';
                const count = document.getElementById('questionCount')?.value || 12;
                const altCount = document.querySelector('input[name="altCount"]:checked')?.value || 4;

                const prompt = `Actúa como docente experto. Genera una evaluación de comprensión lectora para ${grade} (${gradeMap[grade]}). 
                Crea ${count} preguntas con ${altCount} alternativas cada una. 
                Utiliza las estrategias de lectura. Texto: "${text}". 
                Responde ÚNICAMENTE en JSON: {"questions":[{"strategy":"...","question":"...","options":["A)","B)"],"correctIndex":0}]}`;

                if (elements.loadingText) elements.loadingText.textContent = 'Gemini generando preguntas...';

                const response = await fetch(GEMINI_API_URL + '?key=' + key, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error ? error.error.message : 'Error Connection');
                }

                const jsonResp = await response.json();
                const rawText = jsonResp.candidates[0].content.parts[0].text;
                const cleanJson = rawText.substring(rawText.indexOf('{'), rawText.lastIndexOf('}') + 1);
                const data = JSON.parse(cleanJson);
                generatedQuestions = data.questions;

                renderReview();
                switchPhase('review');
            } catch (e) {
                showError("Fallo: " + e.message);
                setTimeout(() => switchPhase('setup'), 3000);
            }
        };
    }

    function renderReview() {
        const div = document.getElementById('questionsPreview');
        if (div) {
            div.innerHTML = generatedQuestions.map((q, i) => `
                <div class="preview-item" style="margin-bottom:20px; padding:15px; background:#f9fafb; border-radius:8px;">
                    <h4>${i+1}. ${q.question}</h4>
                    <p style="font-size:10px; color:#6366f1;">Estrategia: ${q.strategy}</p>
                    <ul style="list-style:none; padding-left:0;">
                        ${q.options.map(o => `<li style="padding:5px; border:1px solid #e5e7eb; margin-top:5px; border-radius:4px; font-size:14px;">${o}</li>`).join('')}
                    </ul>
                </div>
            `).join('');
        }
    }

    if (elements.btnDownload) {
        elements.btnDownload.onclick = () => {
            const doc = document.createElement('div');
            doc.style.padding = '20px';
            doc.style.fontFamily = 'Arial, sans-serif';
            doc.innerHTML = `<h1 style="text-align:center;">Evaluación de Comprensión Lectora</h1>
                             <p><b>Nivel:</b> ${document.getElementById('gradeLevel')?.value}</p>
                             <hr>`;
            
            if (uploadedImageBase64) {
                doc.innerHTML += `<div style="text-align:center;"><img src="${uploadedImageBase64}" style="max-width:500px; margin-bottom:20px;"></div>`;
            }
            
            const textToPrint = elements.textContent.value.trim() || extractedImageText;
            doc.innerHTML += `<div style="margin-bottom:30px;"><p>${textToPrint.replace(/\n/g, '<br>')}</p></div>`;
            
            doc.innerHTML += `<h2 style="font-size:18px;">Preguntas:</h2>`;
            doc.innerHTML += generatedQuestions.map((q, i) => `
                <div style="margin-bottom:15px;">
                    <p><b>${i+1}. ${q.question}</b></p>
                    ${q.options.map(o => `<p style="margin:2px 0 2px 20px;">${o}</p>`).join('')}
                </div>
            `).join('');

            // Clave de respuestas al final
            doc.innerHTML += `<hr style="margin-top:50px;"><h3>Clave de Respuestas (Confidencial):</h3>`;
            doc.innerHTML += generatedQuestions.map((q, i) => `<p>${i+1}. Alternativa Correcta: ${q.options[q.correctIndex]}</p>`).join('');

            html2pdf().set({
                margin: 1.5,
                filename: 'evaluacion_lectora.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'cm', format: 'letter', orientation: 'portrait' }
            }).from(doc).save();
        };
    }

    if (elements.btnBack) elements.btnBack.onclick = () => switchPhase('setup');
});