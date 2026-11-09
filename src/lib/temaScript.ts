export const CLAVE_TEMA = "mass-stock:tema";

/** Se ejecuta antes de pintar la página, para que no parpadee en claro al cargar en modo oscuro. */
export const SCRIPT_TEMA = `try{var t=localStorage.getItem("${CLAVE_TEMA}");if(t==="oscuro")document.documentElement.dataset.theme="dark"}catch(e){}`;
