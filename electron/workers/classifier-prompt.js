const simplifyMap = (nodes) => {
  if (!nodes) return null;

  const simplified = {};
  for (const node of nodes) {
    simplified[node.name] = simplifyMap(node.children) || 'FOLDER_LEAF';
  }

  return simplified;
};

const formatRecentClassifications = (recentClassifications = []) => {
  if (!Array.isArray(recentClassifications) || recentClassifications.length === 0) {
    return '- (Sin precedentes recientes para este perfil)';
  }

  return recentClassifications
    .map((example) => `- "${example.file_name}" -> "${example.relative_path}"`)
    .join('\n');
};

export const createClassificationPrompt = (
  structureMap,
  extractedText,
  fileName = '',
  recentClassifications = []
) => {
  const simplifiedStructure = simplifyMap(structureMap?.destinations) || {};
  const safeFileName = fileName || 'Nombre no disponible';

  return `Actua como un archivero universitario meticuloso.

OBJETIVO CENTRAL:
No agrupes por similitud superficial. Decide por contexto, proposito de uso y criterio archivistico real.

ESTRUCTURA DE CARPETAS DISPONIBLE:
${JSON.stringify(simplifiedStructure, null, 2)}

CLASIFICACIONES RECIENTES DE ESTE PERFIL:
${formatRecentClassifications(recentClassifications)}

NOMBRE DEL ARCHIVO:
${safeFileName}

EXTRACTO DEL DOCUMENTO:
---
${extractedText}
---

PROCESO OBLIGATORIO:
1. IDENTIFICA LA MATERIA:
   - Detecta curso, asignatura o tema principal.
   - Prioriza nombres explicitos de cursos sobre terminos genericos.

2. IDENTIFICA EL TIPO DE DOCUMENTO:
   - Clasifica como: tarea, examen, apuntes, proyecto, resumen, laboratorio,
     presentacion, bibliografia, syllabus u otro.
   - No mezcles tipos distintos en la misma carpeta si existe una subcarpeta que los separa.

3. DESCOMPON EL NOMBRE DEL ARCHIVO:
   Detecta patrones comunes como:
   - "[Tipo][Numero]_[Materia]" -> "Tarea3_SO"
   - "[Materia][Abreviatura]" -> "BDSII"
   - "Examen_Final_*" -> examen
   - "Lab[N]_*" -> laboratorio o practica
   - "*_[AnioSemestre]" -> periodo academico
   - Separadores comunes: _, -, espacio y CamelCase

4. DESAMBIGUA ACTIVAMENTE:
   - Si dos documentos comparten materia pero no tipo, deben ir a subcarpetas distintas.
   - "Calculo II/Tareas" es mejor que "Calculo II" si el tipo es claro.

5. DECIDE LA JERARQUIA:
   - Si el tipo es claro, prefiere "Materia/Tipo".
   - Usa carpeta plana solo si hay una materia clara pero el tipo no puede determinarse.
   - Si la jerarquia final no existe, propon la ruta final en "relative_path" y lista en
     "folders_to_create" todas las carpetas relativas que haya que crear antes de mover.
   - Si la ruta final ya existe, deja "folders_to_create" vacio.

6. USA PRECEDENTES DEL PERFIL:
   - Si los ejemplos recientes muestran un criterio consistente, sigue ese criterio salvo
     que el contenido actual contradiga claramente el precedente.

7. MANEJA LA INCERTIDUMBRE:
   - Usa "high" cuando materia y tipo sean claros.
   - Usa "medium" cuando haya una mejor propuesta razonable pero falte evidencia completa.
   - Usa "low" cuando no puedas justificar una ruta confiable.
   - Si la confianza es "medium", incluye de 1 a 3 "suggested_alternatives".

REGLAS FINALES:
- "relative_path" siempre debe ser la ruta final deseada, relativa a la raiz.
- "folders_to_create" debe contener rutas relativas, no absolutas.
- "new_folder_name" es solo compatibilidad heredada; usa null salvo que haga falta proponer
  una unica carpeta simple sin jerarquia adicional.
- Responde solo JSON valido.

FORMATO DE RESPUESTA:
{
  "thinking": "Resumen breve del criterio usado. Maximo 2 frases.",
  "subject_name": "Nombre de la materia o tema principal",
  "document_type": "tarea|examen|apuntes|proyecto|resumen|laboratorio|presentacion|bibliografia|syllabus|otro",
  "academic_period": "2024-1 o null",
  "confidence": "high|medium|low",
  "relative_path": "ruta/relativa/final o null",
  "folders_to_create": ["Materia", "Materia/Tareas"],
  "new_folder_name": null,
  "reason": "Justificacion concreta basada en texto, nombre de archivo y estructura.",
  "suggested_alternatives": ["ruta/alternativa/1", "ruta/alternativa/2"]
}`;
};
