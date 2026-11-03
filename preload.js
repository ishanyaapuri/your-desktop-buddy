const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("companion", {
  notifyReady: () => ipcRenderer.send("pet-ready"),
  hidePet: () => ipcRenderer.send("hide-pet"),
  onPetCommand: (callback) => {
    ipcRenderer.on("pet-command", (_event, command, data) => callback(command, data));
  },
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (newSettings) => ipcRenderer.send("save-settings", newSettings),
  closeSettings: () => ipcRenderer.send("close-settings"),
  
  // Custom Character Image Handlers
  selectCustomPet: () => ipcRenderer.invoke("select-custom-pet"),
  resetCustomPet: () => ipcRenderer.invoke("reset-custom-pet")
});