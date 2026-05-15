import 'dotenv/config';

export const processInstruction = async (message, history = [], directoryTree = '') => {
  const proxyUrl = process.env.GEMINI_PROXY_URL;
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  if (!proxyUrl) {
    throw new Error('GEMINI_PROXY_URL no está configurada en el archivo .env');
  }

  // The history array already contains the full conversation including the current user message.
  // The system message defines the assistant's persona and JSON output format.
  const systemPrompt = `Eres el Asistente Editorial del "The Tortured Folders Department".
Tu misión es analizar el árbol de directorio y planificar la organización de archivos de forma AUTÓNOMA e INTELIGENTE.

ESTADO ACTUAL DEL DIRECTORIO:
${directoryTree || 'Ningún directorio seleccionado.'}

CAPACIDADES DE ANÁLISIS:
El árbol incluye un análisis previo de patrones con secciones "📊 Análisis de patrones". Cuando veas estas secciones:
- Lee cada "Patrón detectado" y los años/meses disponibles.
- Genera AUTOMÁTICAMENTE la estructura completa: crea carpetas para TODOS los años y meses detectados, y mapea los archivos con el patrón glob indicado.
- NO esperes que el usuario te diga año por año. Si detectas 2024 y 2025, incluye AMBOS en el plan.

REGLAS CRÍTICAS:
1. No saludes en cada mensaje. Solo saluda en la primera interacción.
2. ERES UN SISTEMA DE CONTROL. Tu respuesta DEBE ser SIEMPRE un objeto JSON válido.
3. Cuando el usuario pida organizar, GENERA EL PLAN COMPLETO de inmediato basándote en el análisis de patrones.
4. Usa exactamente esta estructura JSON. Hay 3 tipos de operaciones:
{
  "message": "Tu respuesta conversacional breve y elegante (en español)",
  "plan": {
    "operations": [
      { "type": "mkdir", "destination": "2024/08" },
      { "type": "move", "pattern": "Screenshot 2024-08-*.png", "destination": "2024/08" },
      { "type": "move-dir", "source": "carpeta-origen", "destination": "nueva/ruta" }
    ]
  }
}
- "move": mueve archivos por patrón glob. SIEMPRE usa wildcards ("Screenshot 2024-08-*") NUNCA listes archivos individuales.
- "mkdir": crea una carpeta vacía.
- "move-dir": mueve una carpeta completa.
5. REGLA DE ORO: NUNCA listes archivos uno por uno. Para N archivos usa UN patrón glob. Máximo 30 operaciones por plan.
6. Si el usuario solo charla, deja "operations" como [].
7. Mantén un tono culto, profesional y minimalista.
8. NUNCA incluyas operaciones de "delete" o "eliminar".
9. SIEMPRE que el usuario pida generar el plan, incluye TODAS las operaciones necesarias en el JSON de una sola vez.`;

  // The history is already the complete conversation (including current user message),
  // so we only prepend the system message.
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history
  ];

  // 'message' param is kept in the signature for potential future use (e.g. logging)
  // but we don't append it again since it's already in history.

  try {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Error del Proxy (${response.status}): ${errorData.detail || response.statusText}`);
    }

    const data = await response.json();
    let rawContent = data.choices[0].message.content;
    
    // Robust JSON extraction
    try {
      // Remove potential markdown code blocks
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        rawContent = jsonMatch[0];
      }
      
      const parsed = JSON.parse(rawContent);
      return {
        message: parsed.message,
        plan: parsed.plan || { operations: [] }
      };
    } catch (e) {
      console.error('Failed to parse LLM response as JSON:', rawContent);
      return {
        message: rawContent, // Fallback to raw content if it's not JSON
        plan: { operations: [] }
      };
    }
  } catch (error) {
    console.error('Error in Instruction Engine:', error);
    throw error;
  }
};
