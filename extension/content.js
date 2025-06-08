// Content Script - Se ejecuta en todas las páginas
// Maneja atajos de teclado y diccionario

let lastSpokenText = '';
let currentAudio = null;
let speechRate = 1.0; // Velocidad de voz por defecto
let isExtensionActive = true; // Estado de la extensión

// Configurar desde el storage
chrome.storage.local.get(['speechRate', 'extensionActive'], function(result) {
    if (result.speechRate) {
        speechRate = result.speechRate;
    }
    if (result.extensionActive !== undefined) {
        isExtensionActive = result.extensionActive;
    }
});

// Escuchar cambios en la configuración
chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (changes.speechRate) {
        speechRate = changes.speechRate.newValue;
    }
    if (changes.extensionActive) {
        isExtensionActive = changes.extensionActive.newValue;
        
        // Notificar cambio de estado
        if (isExtensionActive) {
            speakText('Visión Inclusiva activada. Atajos de teclado disponibles.');
        } else {
            // Detener cualquier audio en curso
            stopCurrentAudio();
            speakText('Visión Inclusiva desactivada. Atajos de teclado deshabilitados.');
        }
    }
});

// Función para detener audio actual
function stopCurrentAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    // También detener speech synthesis si está activo
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
}

// Función para reproducir texto con velocidad ajustable
async function speakText(text) {
    if (!text) return;
    
    stopCurrentAudio();
    
    try {
        const response = await fetch('http://localhost:5000/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text: text,
                rate: speechRate 
            })
        });
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        currentAudio = new Audio(url);
        currentAudio.play();
        
        // Limpiar URL cuando termine
        currentAudio.addEventListener('ended', () => {
            window.URL.revokeObjectURL(url);
        });
        
    } catch (error) {
        console.error('Error al reproducir audio:', error);
        // Fallback a speech synthesis del navegador
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = speechRate;
        utterance.lang = 'es-ES';
        window.speechSynthesis.speak(utterance);
    }
}

// Función para síntesis de texto
async function synthesizeSelectedText() {
    const selectedText = window.getSelection().toString().trim();
    
    if (!selectedText) {
        speakText('No se seleccionó texto. Selecciona texto en la página primero.');
        return;
    }
    
    try {
        const response = await fetch('http://localhost:5000/synthesize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: selectedText })
        });
        
        const data = await response.json();
        const synthesis = data.synthesis || '';
        
        if (synthesis) {
            lastSpokenText = synthesis;
            speakText(synthesis);
        } else {
            speakText('No se pudo generar la síntesis del texto.');
        }
    } catch (error) {
        console.error('Error en síntesis:', error);
        speakText('Error al generar la síntesis del texto.');
    }
}

// Función para leer texto seleccionado
function readSelectedText() {
    const selectedText = window.getSelection().toString().trim();
    
    if (selectedText) {
        lastSpokenText = selectedText;
        speakText(selectedText);
    } else {
        speakText('No se seleccionó texto. Selecciona texto en la página primero.');
    }
}

// Función para repetir último texto
function repeatLastText() {
    if (lastSpokenText) {
        speakText(lastSpokenText);
    } else {
        speakText('No hay texto anterior para repetir.');
    }
}

// Función para mostrar ayuda
function showHelp() {
    const helpText = `
        Atajos de teclado disponibles:
        F1: Ayuda
        F2: Repetir último texto
        Escape: Parar audio
        Control Shift S: Síntesis de texto seleccionado
        Control Shift L: Leer texto seleccionado
        Control Shift D: Describir imagen seleccionada
        
        También puedes hacer doble clic en cualquier palabra para obtener su definición.
    `;
    speakText(helpText.replace(/\s+/g, ' ').trim());
}

// Función del diccionario
async function lookupWord(word) {
    if (!word || word.length < 2) return;
    
    try {
        const response = await fetch('http://localhost:5000/dictionary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word: word.toLowerCase() })
        });
        
        const data = await response.json();
        
        if (data.definition) {
            const pronunciationText = data.pronunciation !== word.toUpperCase() ? 
                ` Se pronuncia: ${data.pronunciation}.` : '';
            
            const fullText = `La palabra ${word} significa: ${data.definition}${pronunciationText}`;
            speakText(fullText);
        } else {
            speakText(`No encontré la definición de la palabra ${word}.`);
        }
    } catch (error) {
        console.error('Error en diccionario:', error);
        speakText(`No pude buscar la definición de ${word}. Verifica tu conexión.`);
    }
}

// Event listeners para atajos de teclado
document.addEventListener('keydown', function(event) {
    // Verificar si la extensión está activa
    if (!isExtensionActive) {
        // Solo permitir Escape para detener audio y F1 para ayuda
        if (event.key === 'Escape') {
            event.preventDefault();
            stopCurrentAudio();
            speakText('Audio detenido');
            return;
        }
        if (event.key === 'F1') {
            event.preventDefault();
            speakText('Visión Inclusiva está desactivada. Abre el popup de la extensión y activa el interruptor principal para usar los atajos de teclado.');
            return;
        }
        return; // No procesar otros atajos si está desactivada
    }
    
    // F1 - Ayuda
    if (event.key === 'F1') {
        event.preventDefault();
        showHelp();
        return;
    }
    
    // F2 - Repetir
    if (event.key === 'F2') {
        event.preventDefault();
        repeatLastText();
        return;
    }
    
    // Escape - Parar audio
    if (event.key === 'Escape') {
        event.preventDefault();
        stopCurrentAudio();
        speakText('Audio detenido');
        return;
    }
    
    // Ctrl+Shift+S - Síntesis
    if (event.ctrlKey && event.shiftKey && event.key === 'S') {
        event.preventDefault();
        synthesizeSelectedText();
        return;
    }
    
    // Ctrl+Shift+L - Leer texto
    if (event.ctrlKey && event.shiftKey && event.key === 'L') {
        event.preventDefault();
        readSelectedText();
        return;
    }
    
    // Ctrl+Shift+D - Describir imagen (enviar señal al background script)
    if (event.ctrlKey && event.shiftKey && event.key === 'D') {
        event.preventDefault();
        // Buscar imagen bajo el cursor o seleccionada
        const selectedImg = document.querySelector('img:hover') || 
                           document.querySelector('img[aria-selected="true"]') ||
                           document.querySelector('img:focus');
        
        if (selectedImg && selectedImg.src) {
            chrome.storage.local.set({
                imageToDescribe: selectedImg.src
            }, function() {
                speakText('Imagen detectada, abriendo descripción.');
                // Opcional: abrir popup
                chrome.runtime.sendMessage({action: 'openPopup'});
            });
        } else {
            speakText('No se detectó ninguna imagen. Coloca el cursor sobre una imagen y presiona Control Shift D.');
        }
        return;
    }
});

// Event listener para doble clic en palabras (diccionario)
document.addEventListener('dblclick', function(event) {
    // Verificar si la extensión está activa
    if (!isExtensionActive) {
        return; // No procesar el diccionario si está desactivada
    }
    
    // Obtener la palabra seleccionada o la palabra bajo el cursor
    let word = window.getSelection().toString().trim();
    
    if (!word) {
        // Si no hay selección, intentar obtener la palabra del elemento clickeado
        const element = event.target;
        if (element.nodeType === Node.TEXT_NODE || element.tagName) {
            const text = element.textContent || element.innerText || '';
            const clickPosition = getClickPosition(event, element);
            word = getWordAtPosition(text, clickPosition);
        }
    }
    
    // Limpiar la palabra (solo letras y algunos caracteres especiales del español)
    word = word.replace(/[^\w\sáéíóúñüÁÉÍÓÚÑÜ]/g, '').trim();
    
    if (word && word.length > 1) {
        lookupWord(word);
    }
});

// Función auxiliar para obtener posición del clic
function getClickPosition(event, element) {
    const rect = element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return { x, y };
}

// Función auxiliar para obtener palabra en posición específica
function getWordAtPosition(text, position) {
    // Implementación simple: dividir en palabras y tomar la primera
    const words = text.split(/\s+/);
    return words.length > 0 ? words[0] : '';
}

// Notificar que el content script está listo
console.log('Visión Inclusiva - Content Script cargado correctamente');

// Notificar estado inicial al usuario (solo si está activa)
setTimeout(() => {
    if (isExtensionActive) {
        speakText('Visión Inclusiva activada. Presiona F1 para ver la ayuda de atajos de teclado.');
    }
}, 1500); 