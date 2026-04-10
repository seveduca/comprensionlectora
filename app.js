// --- VARIABLES Y ESTADOS ---
let currentPhase = 'setup';
let extractedText = '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// --- ELEMENTOS DEL DOM ---
const phases = {
    setup: document.getElementById('phase-setup'),
    loading: document.getElementById('phase-loading'),
    review: document.getElementById('phase-review')
};

const tabs = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const textContent = document.getElementById('textContent');
const fileInput = document.getElementById('fileInput');
const fileDropArea = document.getElementById('fileDropArea');
const fileNameDisplay = document.getElementById('fileName');

const btnGenerate = document.getElementById('btnGenerate');
const btnBackToSetup = document.getElementById('btnBackToSetup');
const btnDownloadPDF = document.getElementById('btnDownloadPDF');

const settingsModal = document.getElementById('settingsModal');
const btnSettings = document.getElementById('btnSettings');
const btnCloseModal = document.getElementById('btnCloseModal');
const apiKeyInput = document.getElementById('apiKeyInput');
const btnSaveApi = document.getElementById('btnSaveApi');
const btnToggleVisibility = document.getElementById('btnToggleVisibility');

const loadingSteps = {
    extract: document.getElementById('step-extract'),
    prompt: document.getElementById('step-prompt'),
    ai: document.getElementById('step-ai')
};
const loadingProgress = document.getElementById('loadingProgress');

let generatedQuestions = [];
let currentGrade = '';
let currentOptionsCount = 4;

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    // Cargar API Key si existe
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
        apiKeyInput.value = savedKey;
    }

    // Configurar PDF.js Worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
});

// --- NAVEGACIÓN Y UI ---
function switchPhase(newPhase) {
    Object.values(phases).forEach(phase => phase.classList.remove('active'));
    phases[newPhase].classList.add('active');
    currentPhase = newPhase;
}

// Pestañas
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        document.getElementById(tab.dataset.target).classList.add('active');
    });
});

// Modal Configuracion
btnSettings.addEventListener('click', () => settingsModal.classList.add('open'));
btnCloseModal.addEventListener('click', () => settingsModal.classList.remove('open'));
btnSaveApi.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
        localStorage.setItem('gemini_api_key', key);
        settingsModal.classList.remove('open');
    } else {
        alert("Por favor, ingresa una API Key válida.");
    }
});

btnToggleVisibility.addEventListener('click', () => {
    const type = apiKeyInput.type === 'password' ? 'text' : 'password';
    apiKeyInput.type = type;
    btnToggleVisibility.innerHTML = type === 'password' ? '<i class="ph ph-eye"></i>' : '<i class="ph ph-eye-slash"></i>';
});

// --- MANEJO DE ARCHIVOS ---
fileDropArea.addEventListener('click', () => fileInput.click());

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    fileDropArea.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    fileDropArea.addEventListener(eventName, () => fileDropArea.classList.add('dragover'), false);
});

['dragleave', 'drop'].forEach(eventName => {
    fileDropArea.addEventListener(eventName, () => fileDropArea.classList.remove('dragover'), false);
});

fileDropArea.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
});

fileInput.addEventListener('change', function() {
    handleFiles(this.files);
});

let selectedFile = null;

function handleFiles(files) {
    if (files.length > 0) {
        selectedFile = files[0];
        fileNameDisplay.textContent = "📎 " + selectedFile.name;
    }
}

// --- LÓGICA PRINCIPAL: GENERAR ---
btnGenerate.addEventListener('click', async () => {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
        settingsModal.classList.add('open');
        alert("Necesitas configurar tu API Key gratuita primero.");
        return;
    }

    currentGrade = document.getElementById('gradeLevel').value;
    const qCount = document.getElementById('questionCount').value;
    currentOptionsCount = document.querySelector('input[name="altCount"]:checked').value;
    
    const activeTab = document.querySelector('.tab-btn.active').dataset.target;

    switchPhase('loading');
    resetLoadingSteps();

    try {
        setStepStatus('extract', 'active');
        updateProgress(10);
        
        let textToAnalize = "";
        
        if (activeTab === 'tab-text') {
            textToAnalize = textContent.value.trim();
            if(!textToAnalize) throw new Error("No has ingresado texto.");
        } else {
            if(!selectedFile) throw new Error("No has subido ningún archivo.");
            textToAnalize = await extractTextFromFile(selectedFile);
        }

        setStepStatus('extract', 'done');
        updateProgress(40);
        setStepStatus('prompt', 'active');

        // Procesar texto para la IA
        const promptText = buildPrompt(textToAnalize, currentGrade, qCount, currentOptionsCount);
        
        setStepStatus('prompt', 'done');
        updateProgress(60);
        setStepStatus('ai', 'active');

        // Llamada a Gemini API
        const responseData = await callGeminiAPI(promptText, apiKey);
        
        setStepStatus('ai', 'done');
        updateProgress(100);

        processAIResponse(responseData);
        switchPhase('review');
        
    } catch (error) {
        console.error(error);
        alert("Ocurrió un error: " + error.message);
        switchPhase('setup');
    }
});

btnBackToSetup.addEventListener('click', () => switchPhase('setup'));

// --- EXTRACCIÓN DE TEXTO ---
async function extractTextFromFile(file) {
    const type = file.type;
    
    if (type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const strings = content.items.map(item => item.str);
            text += strings.join(' ') + " ";
        }
        return text;
    } else if (type.startsWith('image/')) {
        const result = await Tesseract.recognize(file, 'spa', {
            logger: m => console.log(m)
        });
        return result.data.text;
    } else {
        throw new Error("Formato de archivo no soportado. Usa PDF o Imágenes.");
    }
}

// --- LLAMADA A LA IA ---
function buildPrompt(text, grade, count, altCount) {
    return `
    Actúa como un experto profesor y creador de evaluaciones de español y comprensión lectora.
    Tu tarea es leer el texto provisto y crear una evaluación de comprensión lectora para estudiantes de ${grade}.
    
    Instrucciones estrictas:
    1. Genera exactamente ${count} preguntas de selección múltiple.
    2. Cada pregunta debe tener exactamente ${altCount} alternativas (A, B, C...).
    3. Solo una alternativa debe ser correcta.
    4. Cada pregunta DEBE estar diseñada para evaluar una de las siguientes 12 estrategias de comprensión lectora (intenta ser variado y usar la mayoría):
       - Encontrar la idea principal
       - Recordar hechos y detalles
       - Comprender la secuencia
       - Reconocer causa y efecto
       - Comparar y contrastar
       - Hacer predicciones
       - Hallar el significado de palabras por contexto
       - Sacar conclusiones y hacer inferencias
       - Distinguir entre hecho y opinión
       - Identificar el propósito del autor
       - Interpretar el lenguaje figurado
       - Resumir
       
    Texto a analizar:
    "${text}"
    
    Responde ÚNICAMENTE con un objeto JSON válido con la siguiente estructura, sin texto adicional ni formateo markdown fuera del JSON válido:
    {
       "questions": [
          {
             "strategy": "Nombre exacto de la estrategia (una de las 12)",
             "question": "Texto de la pregunta",
             "options": ["A) Opción 1", "B) Opción 2", ...],
             "correctIndex": 0 // el índice 0 base de la opción correcta
          }
       ]
    }
    `;
}

async function callGeminiAPI(prompt, apiKey) {
    const url = `${GEMINI_API_URL}?key=${apiKey}`;
    
    const requestBody = {
        contents: [{
            parts: [{ text: prompt }]
        }],
        generationConfig: {
            temperature: 0.2 // Baja temperatura para JSON más estricto
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error("Falló la llamada a la IA: " + (err.error?.message || response.statusText));
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

function processAIResponse(jsonString) {
    try {
        // Limpiar posible formato markdown devuelto por la IA
        let rawText = jsonString.trim();
        let startIndex = rawText.indexOf('{');
        let endIndex = rawText.lastIndexOf('}');
        if (startIndex !== -1 && endIndex !== -1) {
            rawText = rawText.substring(startIndex, endIndex + 1);
        }
        
        const data = JSON.parse(rawText);
        generatedQuestions = data.questions;
        renderPreview();
    } catch (e) {
        console.error("Texto crudo devuelto por IA:", jsonString);
        throw new Error("La IA devolvió texto, pero no pudo ser leído como preguntas. Intenta de nuevo.");
    }
}

// --- RENDERIZADO VISUAL ---
function renderPreview() {
    const container = document.getElementById('questionsPreview');
    container.innerHTML = '';
    
    generatedQuestions.forEach((q, index) => {
        const item = document.createElement('div');
        item.className = 'q-preview-item';
        
        let optionsHtml = '';
        q.options.forEach((opt, idx) => {
            const isCorrect = idx === q.correctIndex;
            optionsHtml += `<li class="${isCorrect ? 'correct-answer' : ''}">${opt} ${isCorrect ? ' <strong>(Correcta)</strong>' : ''}</li>`;
        });

        item.innerHTML = `
            <span class="q-meta"><i class="ph ph-brain"></i> ${q.strategy}</span>
            <h4>${index + 1}. ${q.question}</h4>
            <ul>${optionsHtml}</ul>
        `;
        container.appendChild(item);
    });
}

// --- GENERACIÓN DE PDF ---
btnDownloadPDF.addEventListener('click', () => {
    generatePDF();
});

function generatePDF() {
    const printContainer = document.getElementById('printContainer');
    const today = new Date().toLocaleDateString('es-CL');
    
    // Calcular puntaje (1 punto por pregunta)
    const totalScore = generatedQuestions.length;

    // Crear el HTML para imprimir
    let pdfHtml = `
    <div style="font-family: Arial, sans-serif; color: #000; background: #fff;">
        <h1 style="text-align: center; margin-bottom: 20px; font-size: 24px; color: #1e3a8a;">Evaluación de Comprensión Lectora</h1>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #ccc;">
            <tr>
                <td style="padding: 10px; border: 1px solid #ccc; width: 33%;"><strong>Nivel:</strong> ${currentGrade}</td>
                <td style="padding: 10px; border: 1px solid #ccc; width: 33%;"><strong>Fecha:</strong> ${today}</td>
                <td style="padding: 10px; border: 1px solid #ccc; width: 33%;"><strong>Puntaje Inicial:</strong> ${totalScore} | <strong>Puntaje Obtenido:</strong> _____</td>
            </tr>
            <tr>
                <td colspan="3" style="padding: 10px; border: 1px solid #ccc;"><strong>Nombre del Estudiante:</strong> ______________________________________________________________</td>
            </tr>
        </table>
        
        <div style="background: #f8fafc; padding: 15px; border-left: 4px solid #3b82f6; margin-bottom: 30px;">
            <p style="margin: 0; font-weight: bold; font-size: 14px;">Instrucción:</p>
            <p style="margin: 5px 0 0 0; font-size: 14px;">Lee atentamente el siguiente texto y luego marca la alternativa correcta según corresponda.</p>
        </div>

        <div style="margin-bottom: 40px; text-align: justify; line-height: 1.6; font-size: 14px;">
            <h3>Texto Principal</h3>
        `;
        
    // Insertamos el texto (usamos los campos en el flujo)
    let rawTextContent = '';
    const activeTab = document.querySelector('.tab-btn.active').dataset.target;
    if (activeTab === 'tab-text') {
        rawTextContent = textContent.value;
    } else {
        rawTextContent = "<em>(Texto extraído del documento/imagen subida. El profesor o el estudiante de la prueba deberán disponer de la copia de lectura física).</em>";
    }
    
    // Reemplazar saltos de línea por <br>
    rawTextContent = rawTextContent.replace(/\n/g, '<br>');
    
    pdfHtml += `
            <p>${rawTextContent}</p>
        </div>
        
        <h3 style="margin-bottom: 15px;">Preguntas de Comprensión</h3>
    `;

    generatedQuestions.forEach((q, i) => {
        let opts = q.options.map(o => `<div style="margin-bottom: 6px; margin-left: 20px;">${o}</div>`).join('');
        
        pdfHtml += `
            <div style="margin-bottom: 25px; page-break-inside: avoid;">
                <p style="font-weight: bold; margin-bottom: 8px;">${i + 1}. ${q.question}</p>
                ${opts}
            </div>
        `;
    });
    
    // Clave de respuestas al final (en una página nueva si es posible)
    pdfHtml += `
        <div style="margin-top: 50px; page-break-before: always; border-top: 2px dashed #ccc; padding-top: 20px;">
            <h3 style="color: #64748b;">Clave de Respuestas (Para el Docente)</h3>
            <ul style="list-style: none; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
    `;
    
    generatedQuestions.forEach((q, i) => {
        // Encontrar la letra (A, B, C...) de la opción correcta
        const rightChar = q.options[q.correctIndex].substring(0, 1);
        pdfHtml += `<li><strong>${i+1}.</strong> ${q.options[q.correctIndex]} <br><span style="font-size: 10px; color:#888;">(${q.strategy})</span></li>`;
    });
    
    pdfHtml += `
            </ul>
        </div>
    </div>
    `;

    printContainer.innerHTML = pdfHtml;
    printContainer.style.display = 'block';

    const element = printContainer.children[0];
    
    const opt = {
        margin:       [2, 2], // 2 cm top/bottom/left/right
        filename:     'Evaluacion_Comprension_Lectora.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'cm', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
        printContainer.style.display = 'none';
        printContainer.innerHTML = '';
    });
}

// --- UTILIDADES ---
function setStepStatus(stepKey, status) {
    loadingSteps[stepKey].className = status;
    if(status === 'done'){
        loadingSteps[stepKey].innerHTML = `<i class="ph ph-check-circle"></i> ${loadingSteps[stepKey].innerText}`;
    }
}

function resetLoadingSteps() {
    ['extract', 'prompt', 'ai'].forEach(s => {
        loadingSteps[s].className = 'pending';
        let originalText = loadingSteps[s].innerText;
        loadingSteps[s].innerHTML = `<i class="ph ph-circle"></i> ${originalText}`;
    });
    updateProgress(0);
}

function updateProgress(percent) {
    loadingProgress.style.width = percent + '%';
}
