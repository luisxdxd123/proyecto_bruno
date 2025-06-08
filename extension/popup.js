// Variables globales
let currentSpeechRate = 1.0;
let isExtensionActive = true;

// Cargar configuración guardada
chrome.storage.local.get(['speechRate', 'extensionActive'], function(result) {
    if (result.speechRate) {
        currentSpeechRate = result.speechRate;
        updateSpeedDisplay(currentSpeechRate);
    }
    if (result.extensionActive !== undefined) {
        isExtensionActive = result.extensionActive;
        updatePowerState(isExtensionActive);
    }
});

const speak = (text, rate = currentSpeechRate) => {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  utterance.lang = 'es-ES';
  window.speechSynthesis.speak(utterance);
};

const captureRegion = (callback) => {
  chrome.desktopCapture.chooseDesktopMedia(["screen", "window"], (streamId) => {
    if (!streamId) {
      console.error("No stream selected.");
      return;
    }

    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: streamId,
        },
      },
    }).then((stream) => {
      const video = document.createElement("video");
      video.srcObject = stream;
      video.onloadedmetadata = () => {
        video.play();
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        stream.getTracks().forEach((track) => track.stop());
        callback(canvas.toDataURL("image/png"));
      };
    }).catch((err) => console.error("Error capturing region:", err));
  });
};

// Botón para síntesis de texto seleccionado
document.getElementById("captureText").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    chrome.scripting.executeScript(
      {
        target: { tabId: activeTab.id },
        func: () => window.getSelection().toString(),
      },
      async (results) => {
        const text = results[0]?.result;
        if (text) {
          showStatus('Generando síntesis...');
          try {
            // Enviar texto para síntesis
            const res = await fetch('http://localhost:5000/synthesize', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: text })
            });
            const data = await res.json();
            const synthesis = data.synthesis || '';
            
            if (synthesis) {
              showStatus('Reproduciendo síntesis...');
              // Reproducir la síntesis con voz
              const voiceRes = await fetch('http://localhost:5000/speak', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  text: synthesis,
                  rate: currentSpeechRate 
                })
              });
              const blob = await voiceRes.blob();
              const url = window.URL.createObjectURL(blob);
              const audio = new Audio(url);
              audio.play();
              showStatus('Síntesis completada.');
            } else {
              showStatus('No se pudo generar la síntesis.');
            }
          } catch (e) {
            console.error('Error:', e);
            showStatus('Error al generar la síntesis.');
          }
        } else {
          showStatus('No se seleccionó texto. Selecciona texto en la página primero.');
        }
      }
    );
  });
});

// ================================
// FUNCIONALIDADES NUEVAS
// ================================

// Función para actualizar el estado del interruptor principal
function updatePowerState(isActive) {
    const toggle = document.getElementById('extensionToggle');
    const status = document.getElementById('powerStatus');
    const speedControl = document.getElementById('speedControlSection');
    const buttons = document.querySelectorAll('.action-button');
    
    if (toggle) {
        toggle.checked = isActive;
    }
    
    if (status) {
        status.textContent = isActive ? 'ACTIVADO' : 'DESACTIVADO';
        status.className = `power-status ${isActive ? 'active' : 'inactive'}`;
    }
    
    // Deshabilitar/habilitar controles cuando esté inactivo
    if (speedControl) {
        speedControl.className = isActive ? 'speed-control' : 'speed-control disabled';
    }
    
    buttons.forEach(button => {
        button.disabled = !isActive;
        button.style.opacity = isActive ? '1' : '0.5';
        button.style.pointerEvents = isActive ? 'auto' : 'none';
    });
    
    // Guardar estado en storage
    chrome.storage.local.set({
        extensionActive: isActive
    });
    
    isExtensionActive = isActive;
}

// Función para alternar el estado de la extensión
function toggleExtensionState() {
    const newState = !isExtensionActive;
    updatePowerState(newState);
    
    // Feedback de audio
    const message = newState ? 
        'Visión Inclusiva activada. Todos los atajos de teclado están disponibles.' : 
        'Visión Inclusiva desactivada. Los atajos de teclado han sido deshabilitados.';
    
    if (newState) {
        speak(message, currentSpeechRate);
    } else {
        // Usar synthesis nativo cuando se desactiva para dar el último mensaje
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.rate = currentSpeechRate;
        utterance.lang = 'es-ES';
        window.speechSynthesis.speak(utterance);
    }
}

// Función para actualizar el display de velocidad
function updateSpeedDisplay(rate) {
    const speedValue = document.getElementById('speedValue');
    const speedRange = document.getElementById('speedRange');
    
    if (speedRange) {
        speedRange.value = rate;
    }
    
    if (speedValue) {
        let speedText = 'Normal';
        if (rate <= 0.5) speedText = 'Muy Lenta';
        else if (rate <= 0.8) speedText = 'Lenta';
        else if (rate <= 1.2) speedText = 'Normal';
        else if (rate <= 1.5) speedText = 'Rápida';
        else speedText = 'Muy Rápida';
        
        speedValue.textContent = speedText;
    }
}

// Inicializar todos los controles cuando se cargue el popup
function initializeControls() {
    // Inicializar interruptor principal
    const extensionToggle = document.getElementById('extensionToggle');
    if (extensionToggle) {
        extensionToggle.addEventListener('change', function() {
            toggleExtensionState();
        });
    }
    
    // Inicializar control de velocidad
    const speedRange = document.getElementById('speedRange');
    if (speedRange) {
        // Actualizar velocidad cuando cambie el slider
        speedRange.addEventListener('input', function() {
            if (!isExtensionActive) return; // No permitir cambios si está desactivado
            
            currentSpeechRate = parseFloat(this.value);
            updateSpeedDisplay(currentSpeechRate);
            
            // Guardar en storage para que el content script lo use
            chrome.storage.local.set({
                speechRate: currentSpeechRate
            });
            
            // Feedback inmediato
            speak('Velocidad de voz ajustada', currentSpeechRate);
        });
        
        // Cargar configuración inicial
        chrome.storage.local.get(['speechRate', 'extensionActive'], function(result) {
            if (result.speechRate) {
                currentSpeechRate = result.speechRate;
                updateSpeedDisplay(currentSpeechRate);
            }
            if (result.extensionActive !== undefined) {
                isExtensionActive = result.extensionActive;
                updatePowerState(isExtensionActive);
            }
        });
    }
    
    // Agregar tooltips a los botones para mejor accesibilidad
    const buttons = document.querySelectorAll('.action-button');
    buttons.forEach(button => {
        button.addEventListener('focus', function() {
            const label = this.getAttribute('aria-label');
            if (label) {
                this.title = label;
            }
        });
        
        // Prevenir uso de botones cuando está desactivado
        button.addEventListener('click', function(event) {
            if (!isExtensionActive) {
                event.preventDefault();
                event.stopPropagation();
                speak('La extensión está desactivada. Actívala usando el interruptor principal.');
                return false;
            }
        });
    });
}

// Llamar la inicialización
setTimeout(initializeControls, 100);

// Función de utilidad para mostrar mensajes de estado mejorados
function showStatusEnhanced(message, type = 'info') {
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `status-message ${type}`;
        
        // Auto-limpiar después de 5 segundos
        setTimeout(() => {
            if (statusElement.textContent === message) {
                statusElement.textContent = '';
                statusElement.className = 'status-message';
            }
        }, 5000);
    }
}

// Mejorar la función showStatus existente
const originalShowStatus = showStatus;
function showStatus(message) {
    originalShowStatus(message);
    showStatusEnhanced(message);
}

document.addEventListener('DOMContentLoaded', async () => {
    // Cuando se abre el popup, revisa si hay una imagen para describir
    chrome.storage.local.get(['imageToDescribe'], function(result) {
        if (result.imageToDescribe) {
            describeImage(result.imageToDescribe);
            // Limpia el valor para la próxima vez
            chrome.storage.local.remove('imageToDescribe');
        }
    });

    document.getElementById('describeImage').addEventListener('click', async () => {
        chrome.storage.local.get(['imageToDescribe'], function(result) {
            if (result.imageToDescribe) {
                describeImage(result.imageToDescribe);
                chrome.storage.local.remove('imageToDescribe');
            } else {
                showStatus('Haz clic derecho sobre una imagen y selecciona "Describir imagen".');
            }
        });
    });
});

let lastDescription = '';

async function describeImage(imageUrl) {
    showStatus('Analizando imagen...');
    try {
        // Llama a tu backend para describir la imagen
        const res = await fetch('http://localhost:5000/describe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_url: imageUrl })
        });
        const data = await res.json();
        lastDescription = data.description || '';
        showStatus(lastDescription || 'No se pudo obtener una descripción.');
        // Muestra el botón para escuchar si hay descripción
        const listenBtn = document.getElementById('listenDescription');
        if (lastDescription) {
            listenBtn.style.display = 'block';
        } else {
            listenBtn.style.display = 'none';
        }
    } catch (e) {
        showStatus('Error al describir la imagen.');
        document.getElementById('listenDescription').style.display = 'none';
    }
}

document.getElementById('listenDescription').addEventListener('click', async () => {
    if (!lastDescription) return;
    try {
        const res = await fetch('http://localhost:5000/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              text: lastDescription,
              rate: currentSpeechRate 
            })
        });
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
    } catch (e) {
        showStatus('No se pudo reproducir la voz.');
    }
});

function showStatus(msg) {
    document.getElementById('status').textContent = msg;
}

// Listener para capturar texto seleccionado
document.getElementById("readText").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    chrome.scripting.executeScript(
      {
        target: { tabId: activeTab.id },
        func: () => window.getSelection().toString(),
      },
      (results) => {
        const text = results[0]?.result;
        if (text) {
          fetch("http://localhost:5000/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              text: text,
              rate: currentSpeechRate 
            })
          })
          .then(response => response.blob())
          .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.play();
          });
        } else {
          console.error("No se seleccionó texto.");
        }
      }
    );
  });
});
