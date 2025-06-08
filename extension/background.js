// background.js
// Crea un menú contextual para imágenes
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "describeImageMenu",
        title: "Describir imagen (Visión Inclusiva)",
        contexts: ["image"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "describeImageMenu") {
        // Envía la URL de la imagen al popup
        chrome.storage.local.set({ imageToDescribe: info.srcUrl }, () => {
            // Opcional: puedes abrir el popup automáticamente si quieres
        });
        // Opcional: muestra una notificación
        chrome.action.openPopup();
    }
});
