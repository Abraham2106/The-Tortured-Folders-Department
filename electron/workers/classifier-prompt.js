export const createClassificationPrompt = (structureMap, extractedText) => {
  return `Eres un asistente de clasificación de archivos académicos para "The Tortured Folders Department".
  
Tu objetivo es determinar la carpeta destino exacta para un nuevo archivo basándote en su contenido y en la estructura de carpetas permitida (Fuente de Verdad).

ESTRUCTURA DE CARPETAS (Fuente de Verdad):
${JSON.stringify(structureMap, null, 2)}

CONTENIDO DEL ARCHIVO (Primeras páginas):
---
${extractedText}
---

INSTRUCCIONES:
1. PRIORIDAD TEMÁTICA: Analiza el contenido y busca la carpeta que tenga la mayor relevancia semántica (ej: si el archivo habla de "Bases de Datos", debe ir a la carpeta de esa materia aunque existan patrones en otras carpetas).
2. REGLA DE EXTRAPOLACIÓN: Solo si no encuentras una coincidencia temática clara en ninguna parte del mapa, busca patrones secuenciales (ej: "Caso 1", "Caso 2") para proponer una nueva subcarpeta.
3. VISIBILIDAD: El mapa JSON ahora es anidado. Explora los "children" para encontrar el destino más profundo y específico posible.
4. El "destination_path" debe ser la ruta absoluta final donde quedará el archivo.

Responde ÚNICAMENTE con un objeto JSON válido con este formato:
{
  "confidence": "high" | "low",
  "destination_path": "ruta/absoluta/destino",
  "new_folder_name": "Nombre de la nueva carpeta si es necesario, de lo contrario null",
  "reason": "explicación de por qué esta carpeta es la mejor coincidencia temática o por qué se crea un nuevo patrón"
}

No añadas ninguna otra explicación fuera del JSON.`;
};
