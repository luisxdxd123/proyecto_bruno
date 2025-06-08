const speak = (text) => {
  const utterance = new SpeechSynthesisUtterance(text);
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
                body: JSON.stringify({ text: synthesis })
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
            body: JSON.stringify({ text: lastDescription })
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
            body: JSON.stringify({ text })
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
