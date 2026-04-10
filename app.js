// ============================================================
// GENERADOR DE EVALUACIONES DE COMPRENSIÓN LECTORA - V1.6
// ============================================================
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const APP_VERSION = '1.6 - Edición Estable 1.5';
let currentPhase = 'setup';
let generatedQuestions = [];
let currentGrade = '';
let currentOptionsCount = 4;
let selectedFile = null;
let uploadedImageBase64 = '';
let extractedImageText = '';
// --- MOSTRAR ERRORES ---
function showError(msg) {
    const banner = document.getElementById('errorBanner');
    const msgEl  = document.getElementById('errorMessage');
    if (banner && msgEl) {
        msgEl.textContent = msg;
        banner.style.display = 'block';
        banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}
function hideError() {
    const banner = document.getElementById('errorBanner');
    if (banner) banner.style.display = 'none';
}
// --- REFERENCIAS DOM ---
const phases = {
    setup:   document.getElementById('phase-setup'),
    loading: document.getElementById('phase-loading'),
    review:  document.getElementById('phase-review')
};
const textContent = document.getElementById('textContent');
const fileInput   = document.getElementById('fileInput');
const fileDropArea    = document.getElementById('fileDropArea');
const fileNameDisplay = document.getElementById('fileName');
const btnGenerate    = document.getElementById('btnGenerate');
const btnBackToSetup = document.getElementById('btnBackToSetup');
const btnDownloadPDF = document.getElementById('btnDownloadPDF');
const settingsModal       = document.getElementById('settingsModal');
const btnSettings         = document.getElementById('btnSettings');
const btnCloseModal       = document.getElementById('btnCloseModal');
const apiKeyInput         = document.getElementById('apiKeyInput');
const btnSaveApi          = document.getElementById('btnSaveApi');
const loadingProgress = document.getElementById('loadingProgress');
const gradeDifficultyMap = {
    '1ro Básico': 'niños de 6-7 años. Preguntas muy simples y literales.',
    '2do Básico': 'niños de 7-8 años. Vocabulario cotidiano y sencillo.',
    '3ro Básico': 'niños de 8-9 años. Mezcla literal e inferencia sencilla.',
    '4to Básico': 'niños de 9-10 años. Causa-efecto e inferencia simple.',
    '5to Básico': 'niños de 10-11 años. Análisis y vocabulario variado.',
    '6to Básico': 'niños de 11-12 años. Opinión e intención del autor.',
    '7mo Básico': 'niños de 12-13 años. Análisis crítico y lenguaje figurado.',
    '8vo Básico': 'niños de 13-14 años. Pensamiento crítico y análisis literario.'
};
// --- INICIALIZACIÓN ---
try {
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    }
} catch(e) {}
const versionEl = document.getElementById('app-version');
if (versionEl) versionEl.textContent = APP_VERSION;
const savedApiKey = localStorage.getItem('gemini_api_key');
if (savedApiKey && apiKeyInput) apiKeyInput.value = savedApiKey;
// --- NAVEGACIÓN ---
function switchPhase(newPhase) {
    Object.values(phases).forEach(p => p.classList.remove('active'));
    if(phases[newPhase]) phases[newPhase].classList.add('active');
    currentPhase = newPhase;
}
document.querySelectorAll('.tab-btn').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.target).classList.add('active');
    });
});
btnSettings.addEventListener('click', () => settingsModal.classList.add('open'));
btnCloseModal.addEventListener('click', () => settingsModal.classList.remove('open'));
btnSaveApi.addEventListener('click', () => {
    localStorage.setItem('gemini_api_key', apiKeyInput.value.trim());
    settingsModal.classList.remove('open');
});
// --- ARCHIVOS ---
fileDropArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', function() {
    if (this.files.length > 0) {
        selectedFile = this.files[0];
        fileNameDisplay.textContent = '📎 ' + selectedFile.name;
        if (selectedFile.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = e => { uploadedImageBase64 = e.target.result; };
            reader.readAsDataURL(selectedFile);
        }
    }
});
async function extractTextFromFile(file) {
    if (file.type === 'application/pdf') {
        const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        let t = '';
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            t += content.items.map(item => item.str).join(' ') + ' ';
        }
        return t.trim();
    } else {
        const res = await Tesseract.recognize(file, 'spa');
        extractedImageText = res.data.text;
        return res.data.text.trim();
    }
}
// --- GEMINI ---
function buildPrompt(text, grade, count, altCount) {
    return `Genera una evaluación de comprensión lectora para ${grade} (${gradeDifficultyMap[grade]}). 
    Crea exactamente ${count} preguntas de ${altCount} alternativas cada una. 
    Usa las 12 estrategias de lectura. Texto: "${text}". 
    Responde SOLO JSON: {"questions":[{"strategy":"...","question":"...","options":["A)...","B)..."],"correctIndex":0}]}`;
}
async function callGeminiAPI(prompt, apiKey) {
    const res = await fetch(GEMINI_API_URL + '?key=' + apiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } })
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ? err.error.message : 'Error de la IA');
    }
    const d = await res.json();
    return d.candidates[0].content.parts[0].text;
}
// --- GENERAR ---
btnGenerate.addEventListener('click', async () => {
    const key = localStorage.getItem('gemini_api_key');
    if (!key) { settingsModal.classList.add('open'); return; }
    hideError();
    const activeTab = document.querySelector('.tab-btn.active').dataset.target;
    
    switchPhase('loading');
    document.getElementById('loadingText').textContent = 'Generando con Gemini 1.5...';
    try {
        let text = activeTab === 'tab-text' ? textContent.value.trim() : await extractTextFromFile(selectedFile);
        if (!text) throw new Error('No hay texto para analizar.');
        
        const resp = await callGeminiAPI(buildPrompt(text, document.getElementById('gradeLevel').value, document.getElementById('questionCount').value, document.querySelector('input[name="altCount"]:checked').value), key);
        
        const data = JSON.parse(resp.substring(resp.indexOf('{'), resp.lastIndexOf('}') + 1));
        generatedQuestions = data.questions;
        
        renderPreview();
        switchPhase('review');
    } catch (e) {
        showError(e.message);
        setTimeout(() => switchPhase('setup'), 3000);
    }
});
function renderPreview() {
    const div = document.getElementById('questionsPreview');
    div.innerHTML = generatedQuestions.map((q, i) => `<div><h4>${i+1}. ${q.question}</h4><ul>${q.options.map(o => `<li>${o}</li>`).join('')}</ul></div>`).join('');
}
// --- PDF ---
btnDownloadPDF.addEventListener('click', () => {
    const doc = document.createElement('div');
    doc.innerHTML = `<h1>Evaluación de Lectura</h1><p>Nivel: ${document.getElementById('gradeLevel').value}</p>`;
    if (uploadedImageBase64) doc.innerHTML += `<img src="${uploadedImageBase64}" style="max-width:400px; display:block; margin: 0 auto;">`;
    doc.innerHTML += `<p>${textContent.value.replace(/\n/g, '<br>')}</p>`;
    if (extractedImageText) doc.innerHTML += `<p>${extractedImageText.replace(/\n/g, '<br>')}</p>`;
    doc.innerHTML += generatedQuestions.map((q, i) => `<p><b>${i+1}. ${q.question}</b><br>${q.options.join('<br>')}</p>`).join('');
    
    html2pdf().set({ margin: 2, filename: 'prueba.pdf', jsPDF: { unit: 'cm', format: 'letter' } }).from(doc).save();
});
btnBackToSetup.addEventListener('click', () => switchPhase('setup'));