// ============================================================
// GENERADOR DE EVALUACIONES DE COMPRENSIÓN LECTORA
// ============================================================

// --- VARIABLES Y ESTADO GLOBAL ---
let currentPhase = 'setup';
let generatedQuestions = [];
let currentGrade = '';
let currentOptionsCount = 4;
let selectedFile = null;
let uploadedImageBase64 = '';  // Miniatura de imagen para el PDF
let extractedImageText = '';   // Texto OCR para el PDF como texto real

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const APP_VERSION = '1.5 - Gemini 2.0 Edition';

console.log('--- APLICACIÓN INICIADA ---');
console.log('Versión:', APP_VERSION);
console.log('Endpoint:', GEMINI_API_URL);

// --- MOSTRAR ERRORES EN PANTALLA ---
function showError(msg) {
    // Actualizar versión en el footer si existe
    const verEl = document.getElementById('app-version');
    if (verEl) verEl.textContent = APP_VERSION;
    
    const banner = document.getElementById('errorBanner');
    const msgEl  = document.getElementById('errorMessage');
    if (banner && msgEl) {
        msgEl.textContent = msg;
        banner.style.display = 'block';
        banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
        console.error('Error:', msg); // Fallback
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
const tabs        = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
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
const btnToggleVisibility = document.getElementById('btnToggleVisibility');

const loadingSteps = {
    extract: document.getElementById('step-extract'),
    prompt:  document.getElementById('step-prompt'),
    ai:      document.getElementById('step-ai')
};
const loadingProgress = document.getElementById('loadingProgress');

// --- MAPA DE DIFICULTAD POR CURSO ---
const gradeDifficultyMap = {
    '1ro Básico': 'niños de 6-7 años que están aprendiendo a leer. Las preguntas deben ser muy simples y literales, con oraciones cortas y vocabulario básico de 1-2 sílabas en lo posible.',
    '2do Básico': 'niños de 7-8 años con lectura emergente. Usa oraciones cortas, vocabulario cotidiano y sencillo, y preguntas sobre hechos concretos del texto.',
    '3ro Básico': 'niños de 8-9 años. Usa vocabulario simple, oraciones de complejidad baja-media, y preguntas que mezclen lo literal con alguna inferencia sencilla.',
    '4to Básico': 'niños de 9-10 años. Usa vocabulario intermedio, oraciones de complejidad media, e incluye preguntas de inferencia y causa-efecto simples.',
    '5to Básico': 'estudiantes de 10-11 años. Usa vocabulario variado, oraciones de complejidad media, e incluye preguntas de análisis, causa-efecto e inferencia.',
    '6to Básico': 'estudiantes de 11-12 años. Usa vocabulario más rico, oraciones de complejidad media-alta, e incluye preguntas de análisis, opinión fundamentada e intención del autor.',
    '7mo Básico': 'estudiantes de 12-13 años. Usa vocabulario complejo, oraciones de nivel intermedio-avanzado, y preguntas de análisis crítico, lenguaje figurado e inferencias profundas.',
    '8vo Básico': 'estudiantes de 13-14 años. Usa vocabulario avanzado, oraciones de alta complejidad, y preguntas de pensamiento crítico, análisis literario e inferencias complejas.'
};

// ============================================================
// INICIALIZACIÓN
// ============================================================
// Configurar PDF.js (el script está al final del body, el DOM está listo)
try {
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    }
} catch(e) { console.warn('PDF.js no disponible:', e); }

// Actualizar versión en el footer al iniciar
const versionEl = document.getElementById('app-version');
if (versionEl) versionEl.textContent = APP_VERSION;

const savedApiKey = localStorage.getItem('gemini_api_key');
if (savedApiKey && apiKeyInput) apiKeyInput.value = savedApiKey;

// ============================================================
// NAVEGACIÓN DE FASES
// ============================================================
function switchPhase(newPhase) {
    Object.values(phases).forEach(p => p.classList.remove('active'));
    phases[newPhase].classList.add('active');
    currentPhase = newPhase;
}

// ============================================================
// PESTAÑAS (TABS)
// ============================================================
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.target).classList.add('active');
    });
});

// ============================================================
// MODAL CONFIGURACIÓN API
// ============================================================
btnSettings.addEventListener('click', () => settingsModal.classList.add('open'));
btnCloseModal.addEventListener('click', () => settingsModal.classList.remove('open'));

btnSaveApi.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
        localStorage.setItem('gemini_api_key', key);
        settingsModal.classList.remove('open');
        hideError();
        // Mensaje en pantalla en lugar de alert()
        const banner = document.getElementById('errorBanner');
        const msgEl  = document.getElementById('errorMessage');
        if (banner && msgEl) {
            banner.style.background = '#dcfce7';
            banner.style.borderColor = '#86efac';
            banner.style.color = '#166534';
            msgEl.textContent = 'API Key guardada correctamente. ¡Ya puedes generar evaluaciones!';
            banner.style.display = 'block';
            setTimeout(() => { banner.style.display = 'none'; banner.style.background = '#fee2e2'; banner.style.borderColor = '#fca5a5'; banner.style.color = '#991b1b'; }, 3000);
        }
    } else {
        showError('Por favor, ingresa una API Key válida (empieza con AIzaSy...).');
    }
});

btnToggleVisibility.addEventListener('click', () => {
    const type = apiKeyInput.type === 'password' ? 'text' : 'password';
    apiKeyInput.type = type;
    btnToggleVisibility.innerHTML = type === 'password'
        ? '<i class="ph ph-eye"></i>'
        : '<i class="ph ph-eye-slash"></i>';
});

// ============================================================
// MANEJO DE ARCHIVOS
// ============================================================
fileDropArea.addEventListener('click', () => fileInput.click());

['dragenter','dragover','dragleave','drop'].forEach(evt => {
    fileDropArea.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); });
});
['dragenter','dragover'].forEach(evt => fileDropArea.addEventListener(evt, () => fileDropArea.classList.add('dragover')));
['dragleave','drop'].forEach(evt => fileDropArea.addEventListener(evt, () => fileDropArea.classList.remove('dragover')));
fileDropArea.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
fileInput.addEventListener('change', function() { handleFiles(this.files); });

function handleFiles(files) {
    if (!files || files.length === 0) return;
    selectedFile = files[0];
    fileNameDisplay.textContent = '📎 ' + selectedFile.name;

    // Si es imagen: guardar como base64 para miniatura en PDF
    if (selectedFile.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = e => { uploadedImageBase64 = e.target.result; };
        reader.readAsDataURL(selectedFile);
    } else {
        uploadedImageBase64 = '';
        extractedImageText = '';
    }
}

// ============================================================
// EXTRACCIÓN DE TEXTO DE ARCHIVOS
// ============================================================
async function extractTextFromFile(file) {
    const type = file.type;

    if (type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => item.str).join(' ') + ' ';
        }
        return text.trim();

    } else if (type.startsWith('image/')) {
        const result = await Tesseract.recognize(file, 'spa', {
            logger: m => console.log('[OCR]', m)
        });
        extractedImageText = result.data.text; // Guardar OCR como texto real para el PDF
        return result.data.text.trim();

    } else {
        throw new Error('Formato no soportado. Usa PDF o imágenes (JPG, PNG).');
    }
}

// ============================================================
// CONSTRUCCIÓN DEL PROMPT PARA GEMINI
// ============================================================
function buildPrompt(text, grade, count, altCount) {
    const difficulty = gradeDifficultyMap[grade] || 'estudiantes de educación básica';
    return (
        'Actúa como un experto profesor y creador de evaluaciones de español y comprensión lectora.\n' +
        'Tu tarea es crear una evaluación de comprensión lectora para ' + grade + '.\n\n' +
        'NIVEL DE DIFICULTAD: Las preguntas deben ser apropiadas para ' + difficulty + '\n\n' +
        'Instrucciones estrictas:\n' +
        '1. Genera exactamente ' + count + ' preguntas de selección múltiple.\n' +
        '2. Cada pregunta debe tener exactamente ' + altCount + ' alternativas (A, B, C...).\n' +
        '3. Solo UNA alternativa es correcta.\n' +
        '4. Cada pregunta DEBE evaluar una de las 12 estrategias (sé variado):\n' +
        '   - Encontrar la idea principal\n' +
        '   - Recordar hechos y detalles\n' +
        '   - Comprender la secuencia\n' +
        '   - Reconocer causa y efecto\n' +
        '   - Comparar y contrastar\n' +
        '   - Hacer predicciones\n' +
        '   - Hallar el significado de palabras por contexto\n' +
        '   - Sacar conclusiones y hacer inferencias\n' +
        '   - Distinguir entre hecho y opinión\n' +
        '   - Identificar el propósito del autor\n' +
        '   - Interpretar el lenguaje figurado\n' +
        '   - Resumir\n\n' +
        'Texto a analizar:\n"' + text + '"\n\n' +
        'Responde ÚNICAMENTE con un JSON válido con esta estructura exacta (sin texto adicional, sin markdown):\n' +
        '{"questions":[{"strategy":"nombre estrategia","question":"texto pregunta","options":["A) opción","B) opción"],"correctIndex":0}]}'
    );
}

// ============================================================
// LLAMADA A GEMINI API
// ============================================================
async function callGeminiAPI(prompt, apiKey) {
    const url = GEMINI_API_URL + '?key=' + apiKey;

    const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error('Error de la IA: ' + (err.error && err.error.message ? err.error.message : response.statusText));
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

// ============================================================
// PROCESAR RESPUESTA DE IA
// ============================================================
function processAIResponse(jsonString) {
    try {
        let raw = jsonString.trim();
        const start = raw.indexOf('{');
        const end   = raw.lastIndexOf('}');
        if (start !== -1 && end !== -1) raw = raw.substring(start, end + 1);
        const data = JSON.parse(raw);
        generatedQuestions = data.questions;
        renderPreview();
    } catch(e) {
        console.error('Respuesta cruda IA:', jsonString);
        throw new Error('La IA respondió, pero no se pudo interpretar el resultado. Intenta de nuevo.');
    }
}

// ============================================================
// BOTÓN PRINCIPAL: GENERAR EVALUACIÓN
// ============================================================
// ============================================================
// BOTÓN PRINCIPAL: GENERAR EVALUACIÓN
// ============================================================

// Función auxiliar para mostrar mensajes en la pantalla de carga
function setLoadingMessage(msg, isError) {
    var el = document.getElementById('loadingText');
    if (el) {
        el.textContent = msg;
        el.style.color = isError ? '#dc2626' : '';
    }
}

// Función auxiliar segura para actualizar pasos
function safeSetStep(id, icon, text) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = icon + ' ' + text;
}

function safeProgress(pct) {
    if (loadingProgress) loadingProgress.style.width = pct + '%';
}

btnGenerate.addEventListener('click', async function() {
    var apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
        settingsModal.classList.add('open');
        showError('Primero configura tu API Key gratuita haciendo clic en ⚙️');
        return;
    }

    hideError();

    var gradeEl = document.getElementById('gradeLevel');
    var qCountEl = document.getElementById('questionCount');
    var altCountEl = document.querySelector('input[name="altCount"]:checked');
    var activeTabEl = document.querySelector('.tab-btn.active');

    if (!gradeEl || !qCountEl || !altCountEl || !activeTabEl) {
        showError('Error interno: no se encontraron controles del formulario.');
        return;
    }

    currentGrade        = gradeEl.value;
    var qCount          = qCountEl.value;
    currentOptionsCount = altCountEl.value;
    var activeTab       = activeTabEl.dataset.target;

    // Mostrar pantalla de carga
    if (phases.setup) phases.setup.classList.remove('active');
    if (phases.loading) phases.loading.classList.add('active');
    if (phases.review) phases.review.classList.remove('active');
    currentPhase = 'loading';

    setLoadingMessage('Leyendo documento e invocando a la IA...', false);
    safeSetStep('step-extract', '⏳', 'Extrayendo texto...');
    safeSetStep('step-prompt',  '⏳', 'Preparando instrucciones...');
    safeSetStep('step-ai',      '⏳', 'Esperando Gemini...');
    safeProgress(5);

    try {
        // PASO 1: Extraer texto
        setLoadingMessage('Paso 1: Extrayendo texto del documento...', false);
        safeProgress(15);

        var textToAnalyze = '';

        if (activeTab === 'tab-text') {
            var ta = document.getElementById('textContent');
            textToAnalyze = ta ? ta.value.trim() : '';
            if (!textToAnalyze) throw new Error('No has ingresado texto en el área de texto.');
            extractedImageText  = '';
            uploadedImageBase64  = '';
        } else {
            if (!selectedFile) throw new Error('No has subido ningún archivo.');
            textToAnalyze = await extractTextFromFile(selectedFile);
            if (!textToAnalyze || textToAnalyze.trim().length < 10) {
                throw new Error('No se pudo extraer texto del archivo subido.');
            }
        }

        safeSetStep('step-extract', '✅', 'Texto extraído correctamente');
        safeProgress(40);

        // PASO 2: Construir prompt
        setLoadingMessage('Paso 2: Preparando instrucciones para la IA...', false);
        var prompt = buildPrompt(textToAnalyze, currentGrade, qCount, currentOptionsCount);
        safeSetStep('step-prompt', '✅', 'Instrucciones preparadas');
        safeProgress(60);

        // PASO 3: Llamar a Gemini
        setLoadingMessage('Paso 3: Consultando a Gemini AI (puede tardar 30-60 seg)...', false);
        safeSetStep('step-ai', '🤖', 'Generando preguntas con Gemini...');
        var responseData = await callGeminiAPI(prompt, apiKey);
        safeSetStep('step-ai', '✅', 'Preguntas generadas exitosamente');
        safeProgress(100);

        // PASO 4: Procesar respuesta
        processAIResponse(responseData);
        switchPhase('review');

    } catch (error) {
        console.error('Error al generar:', error);
        var msg = error && error.message ? error.message : String(error);
        // Mostrar en pantalla de carga durante 3 segundos para que sea legible
        setLoadingMessage('❌ ERROR: ' + msg, true);
        safeProgress(0);
        showError(msg); // también al banner de error de la pantalla principal
        setTimeout(function() { switchPhase('setup'); }, 3000);
    }
});

btnBackToSetup.addEventListener('click', () => switchPhase('setup'));

// ============================================================
// RENDERIZAR PREGUNTAS EN PANTALLA (PREVISUALIZACIÓN)
// ============================================================
function renderPreview() {
    const container = document.getElementById('questionsPreview');
    container.innerHTML = '';

    generatedQuestions.forEach((q, index) => {
        const item = document.createElement('div');
        item.className = 'q-preview-item';

        let optionsHtml = '';
        q.options.forEach((opt, idx) => {
            const isCorrect = idx === q.correctIndex;
            optionsHtml += '<li class="' + (isCorrect ? 'correct-answer' : '') + '">'
                + opt + (isCorrect ? ' <strong>(Correcta)</strong>' : '') + '</li>';
        });

        item.innerHTML =
            '<span class="q-meta"><i class="ph ph-brain"></i> ' + q.strategy + '</span>' +
            '<h4>' + (index + 1) + '. ' + q.question + '</h4>' +
            '<ul>' + optionsHtml + '</ul>';

        container.appendChild(item);
    });
}

// ============================================================
// GENERAR PDF
// ============================================================
btnDownloadPDF.addEventListener('click', () => generatePDF());

function generatePDF() {
    const printContainer = document.getElementById('printContainer');
    const today          = new Date().toLocaleDateString('es-CL');
    const totalScore     = generatedQuestions.length;

    // --- Cabecera del PDF ---
    let pdfHtml =
        '<div style="font-family: Arial, sans-serif; color: #000; background: #fff;">' +
        '<h1 style="text-align: center; margin-bottom: 20px; font-size: 24px; color: #1e3a8a;">Evaluación de Comprensión Lectora</h1>' +

        '<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #ccc;">' +
        '<tr>' +
        '<td style="padding: 10px; border: 1px solid #ccc; width: 33%;"><strong>Nivel:</strong> ' + currentGrade + '</td>' +
        '<td style="padding: 10px; border: 1px solid #ccc; width: 33%;"><strong>Fecha:</strong> ' + today + '</td>' +
        '<td style="padding: 10px; border: 1px solid #ccc; width: 33%;"><strong>Puntaje Ideal:</strong> ' + totalScore + ' | <strong>Puntaje Obtenido:</strong> _____</td>' +
        '</tr>' +
        '<tr>' +
        '<td colspan="3" style="padding: 10px; border: 1px solid #ccc;"><strong>Nombre del Estudiante:</strong> ______________________________________________________________</td>' +
        '</tr>' +
        '</table>' +

        '<div style="background: #f8fafc; padding: 15px; border-left: 4px solid #3b82f6; margin-bottom: 30px;">' +
        '<p style="margin: 0; font-weight: bold; font-size: 14px;">Instrucción:</p>' +
        '<p style="margin: 5px 0 0 0; font-size: 14px;">Lee atentamente el siguiente texto y luego marca la alternativa correcta según corresponda.</p>' +
        '</div>' +

        '<div style="margin-bottom: 40px; text-align: justify; line-height: 1.6; font-size: 14px;">' +
        '<h3>Texto de Lectura</h3>';

    // --- Contenido: imagen y/o texto ---
    // Imagen miniatura (si existe)
    if (uploadedImageBase64) {
        pdfHtml += '<div style="text-align: center; margin-bottom: 15px;">' +
            '<img src="' + uploadedImageBase64 + '" style="max-width: 60%; max-height: 250px; border: 1px solid #ddd; border-radius: 4px;" alt="Imagen de la lectura">' +
            '</div>';
    }

    // Texto del textarea (siempre incluido si tiene contenido)
    const textareaContent = textContent.value.trim();
    if (textareaContent) {
        pdfHtml += '<p>' + textareaContent.replace(/\n/g, '<br>') + '</p>';
    }

    // Texto OCR desde imagen (como texto real y seleccionable)
    if (extractedImageText && extractedImageText.trim()) {
        const ocrFormatted = extractedImageText.trim().replace(/\n/g, '<br>');
        pdfHtml += '<p>' + ocrFormatted + '</p>';
    }

    // Si no hay nada
    if (!uploadedImageBase64 && !textareaContent && !extractedImageText) {
        pdfHtml += '<p><em>(Texto extraído del documento subido)</em></p>';
    }

    pdfHtml += '</div>';

    // --- Preguntas ---
    pdfHtml += '<h3 style="margin-bottom: 15px;">Preguntas de Comprensión</h3>';

    generatedQuestions.forEach((q, i) => {
        let opts = q.options.map(o => '<div style="margin-bottom: 6px; margin-left: 20px;">' + o + '</div>').join('');
        pdfHtml +=
            '<div style="margin-bottom: 25px; page-break-inside: avoid;">' +
            '<p style="font-weight: bold; margin-bottom: 8px;">' + (i + 1) + '. ' + q.question + '</p>' +
            opts +
            '</div>';
    });

    // --- Clave de respuestas ---
    pdfHtml +=
        '<div style="margin-top: 50px; page-break-before: always; border-top: 2px dashed #ccc; padding-top: 20px;">' +
        '<h3 style="color: #64748b;">Clave de Respuestas (Para el Docente)</h3>' +
        '<ul style="list-style: none; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">';

    generatedQuestions.forEach((q, i) => {
        pdfHtml += '<li><strong>' + (i + 1) + '.</strong> ' + q.options[q.correctIndex] +
            '<br><span style="font-size: 10px; color:#888;">(' + q.strategy + ')</span></li>';
    });

    pdfHtml += '</ul></div></div>';

    // --- Imprimir ---
    printContainer.innerHTML = pdfHtml;
    printContainer.style.display = 'block';

    const opt = {
        margin:      [2, 2],
        filename:    'Evaluacion_Comprension_Lectora.pdf',
        image:       { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF:       { unit: 'cm', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(printContainer.children[0]).save().then(() => {
        printContainer.style.display = 'none';
        printContainer.innerHTML = '';
    });
}

// ============================================================
// UTILIDADES DE LOADING
// ============================================================
function setStepStatus(stepKey, status) {
    const el = loadingSteps[stepKey];
    const text = el.textContent.trim();
    el.className = status;
    if (status === 'active') {
        el.innerHTML = '<i class="ph ph-circle-notch"></i> ' + text;
    } else if (status === 'done') {
        el.innerHTML = '<i class="ph ph-check-circle"></i> ' + text;
    } else {
        el.innerHTML = '<i class="ph ph-circle"></i> ' + text;
    }
}

function resetLoadingSteps() {
    ['extract', 'prompt', 'ai'].forEach(s => setStepStatus(s, 'pending'));
    updateProgress(0);
}

function updateProgress(percent) {
    loadingProgress.style.width = percent + '%';
}
