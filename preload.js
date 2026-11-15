'use strict';
/* Puente seguro entre la interfaz y el programa: la interfaz solo puede llamar a lo que se expone aquí. */
const { contextBridge, ipcRenderer } = require('electron');

const call = (nombre, arg) => ipcRenderer.invoke(nombre, arg);

contextBridge.exposeInMainWorld('api', {
  init: () => call('app:init'),
  detectarPython: () => call('python:detectar'),
  ejecutar: (codigo) => call('ejercicio:ejecutar', { codigo }),
  verificar: (id, codigo) => call('ejercicio:verificar', { id, codigo }),
  progreso: (cambio) => call('progreso:cambiar', cambio),
  guardar: () => call('progreso:guardar'),
  reiniciar: () => call('progreso:reiniciar'),
  ajustes: (cambio) => call('ajustes:cambiar', cambio),
});
