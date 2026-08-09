import process from 'node:process';
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

const SUPPORTED_TYPES = new Set(['move', 'move-dir', 'mkdir', 'rmdir']);

const normalizeRelativePath = (value) => {
  if (value === null || value === undefined) return '';

  return String(value)
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '');
};

const isAbsolutePathLike = (value) => /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('/') || value.startsWith('\\\\');

const getParentPath = (relativePath) => {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized || !normalized.includes('/')) return '';
  return normalized.split('/').slice(0, -1).join('/');
};

const addPathAndAncestors = (set, relativePath) => {
  const normalized = normalizeRelativePath(relativePath);
  set.add('');
  if (!normalized) return;

  const parts = normalized.split('/');
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    set.add(current);
  }
};

const insertMkdirIfNeeded = (operations, knownDirectories, destination) => {
  const normalizedDestination = normalizeRelativePath(destination);
  if (!normalizedDestination || knownDirectories.has(normalizedDestination)) return;

  operations.push({ type: 'mkdir', destination: normalizedDestination });
  addPathAndAncestors(knownDirectories, normalizedDestination);
};

const sanitizeOperations = (rawOperations = [], knownDirectories = []) => {
  const operationsToSanitize = Array.isArray(rawOperations) ? rawOperations : [];
  const safeOperations = [];
  const knownDirectorySet = new Set(['']);

  for (const directory of knownDirectories) {
    const normalizedDirectory = normalizeRelativePath(directory);
    if (!normalizedDirectory || isAbsolutePathLike(normalizedDirectory)) continue;
    addPathAndAncestors(knownDirectorySet, normalizedDirectory);
  }

  for (const operation of operationsToSanitize) {
    if (!operation || typeof operation !== 'object' || !SUPPORTED_TYPES.has(operation.type)) continue;

    if (operation.type === 'mkdir') {
      const destination = normalizeRelativePath(operation.destination);
      if (!destination || isAbsolutePathLike(destination)) continue;
      if (knownDirectorySet.has(destination)) continue;

      safeOperations.push({ type: 'mkdir', destination });
      addPathAndAncestors(knownDirectorySet, destination);
      continue;
    }

    if (operation.type === 'move') {
      const pattern = String(operation.pattern || '').trim();
      const destination = normalizeRelativePath(operation.destination);
      if (!pattern || isAbsolutePathLike(destination)) continue;

      insertMkdirIfNeeded(safeOperations, knownDirectorySet, destination);
      safeOperations.push({ type: 'move', pattern, destination });
      continue;
    }

    if (operation.type === 'move-dir') {
      const source = normalizeRelativePath(operation.source);
      const destination = normalizeRelativePath(operation.destination);
      if (!source || !destination || isAbsolutePathLike(source) || isAbsolutePathLike(destination)) continue;

      insertMkdirIfNeeded(safeOperations, knownDirectorySet, getParentPath(destination));
      safeOperations.push({ type: 'move-dir', source, destination });
      addPathAndAncestors(knownDirectorySet, destination);
      continue;
    }

    if (operation.type === 'rmdir') {
      const source = normalizeRelativePath(operation.source);
      if (!source || isAbsolutePathLike(source)) continue;
      safeOperations.push({ type: 'rmdir', source });
    }
  }

  return safeOperations;
};

const buildPlanSummary = (operations) => {
  if (!Array.isArray(operations) || operations.length === 0) return '';

  const globMoves = operations.filter(
    (operation) => operation.type === 'move' && /[*?{[]/.test(operation.pattern || '')
  ).length;

  const pieces = [`Plan con ${operations.length} operaciones.`];
  if (globMoves > 0) {
    pieces.push(`${globMoves} usan glob y afectaran a todos los archivos coincidentes.`);
  }

  return pieces.join(' ');
};

const mergeMessageWithSummary = (message, operations) => {
  const summary = buildPlanSummary(operations);
  const safeMessage = typeof message === 'string' && message.trim()
    ? message.trim()
    : 'Plan generado.';

  if (!summary) return safeMessage;
  if (/plan con \d+ operaciones|glob/i.test(safeMessage)) return safeMessage;
  return `${safeMessage} ${summary}`;
};

export const processInstruction = async (message, history = [], directoryTree = '', config = {}) => {
  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
  const model = config.model || process.env.ANTHROPIC_MODEL || 'claude-opus-5';
  const knownDirectories = Array.isArray(config.knownDirectories) ? config.knownDirectories : [];

  if (!apiKey) {
    throw new Error('Configuracion de IA faltante. Ve a Settings para configurar tu API Key de Anthropic.');
  }

  const systemPrompt = `Eres un Asistente de Organizacion de Archivos experto.
Tu trabajo es convertir instrucciones de lenguaje natural en un plan JSON seguro, preciso e inspeccionable.

INSTRUCCION ACTUAL DEL USUARIO:
${message || '(Sin instruccion explicita)'}

ARBOL DEL DIRECTORIO ACTUAL:
${directoryTree || '(Ningun directorio seleccionado aun)'}

OPERACIONES SOPORTADAS:
1. Mover archivos por patron:
   { "type": "move", "pattern": "patron_o_nombre_exacto", "destination": "CarpetaDestino" }
2. Mover carpeta completa:
   { "type": "move-dir", "source": "CarpetaOrigen", "destination": "NuevaRuta/CarpetaOrigen" }
3. Crear carpeta:
   { "type": "mkdir", "destination": "Ruta/NuevaCarpeta" }
4. Eliminar carpeta vacia:
   { "type": "rmdir", "source": "CarpetaVacia" }

OPERACIONES NO SOPORTADAS:
- Renombrar archivos individuales
- Editar el contenido de archivos
- Comparar o detectar duplicados
- Operaciones condicionales complejas
- Borrar archivos individuales

Si el usuario pide algo no soportado, responde con "operations": [] y explica brevemente la limitacion.

REGLAS DE DECISION:
1. Usa carpetas existentes antes de crear nuevas.
2. Elige el patron mas restrictivo que cumpla la instruccion.
3. Si el usuario menciona UN archivo concreto, usa su nombre exacto, no un glob amplio.
4. Usa glob solo cuando el usuario hable de grupos: "todos", "los PDF", "las imagenes", etc.
5. Si la instruccion implica anios, meses, clientes, proyectos o tipos, genera una operacion por grupo.
6. Cuando detectes fechas en nombres como "Screenshot 2024-03-15.png", organiza por periodo con una operacion por mes o anio segun lo pedido.
7. Nunca uses rutas absolutas.
8. Nunca incluyas "rmdir" salvo que el usuario lo pida explicitamente.
9. Si la instruccion es ambigua, propone el plan minimo seguro.

VALIDACION INTERNA OBLIGATORIA ANTES DE RESPONDER:
1. Toda carpeta usada en "destination" debe existir en el arbol o aparecer antes como "mkdir".
2. Si una operacion necesita una carpeta nueva, incluye el "mkdir" antes.
3. No devuelvas tipos de operacion fuera del catalogo soportado.
4. Si no hay una accion clara o es solo una pregunta informativa, deja "operations" vacio.

EJEMPLOS:
Usuario: "Mueve el archivo Presupuesto_Marzo_2024.xlsx a Finanzas"
{
  "thinking": "El usuario nombro un archivo concreto, asi que debo usar el nombre exacto.",
  "message": "Movere el archivo indicado a la carpeta Finanzas.",
  "plan": {
    "operations": [
      { "type": "move", "pattern": "Presupuesto_Marzo_2024.xlsx", "destination": "Finanzas" }
    ]
  }
}

Usuario: "Mueve todos los PDF a Documentos"
{
  "thinking": "El usuario pidio un grupo completo, asi que un glob es apropiado.",
  "message": "Movere todos los PDF a la carpeta Documentos.",
  "plan": {
    "operations": [
      { "type": "mkdir", "destination": "Documentos" },
      { "type": "move", "pattern": "*.pdf", "destination": "Documentos" }
    ]
  }
}

Usuario: "Organiza las capturas por mes"
{
  "thinking": "Los nombres con fecha deben dividirse por periodo, no con un solo glob ambiguo.",
  "message": "Propondre una operacion por periodo para organizar las capturas por mes.",
  "plan": {
    "operations": [
      { "type": "mkdir", "destination": "Capturas/2024/Enero" },
      { "type": "move", "pattern": "*2024-01*", "destination": "Capturas/2024/Enero" },
      { "type": "mkdir", "destination": "Capturas/2024/Febrero" },
      { "type": "move", "pattern": "*2024-02*", "destination": "Capturas/2024/Febrero" }
    ]
  }
}

Usuario: "Renombra el archivo factura-final.pdf"
{
  "thinking": "Renombrar archivos individuales no esta soportado.",
  "message": "Esa operacion no esta disponible aun. Solo puedo mover archivos, crear carpetas o mover directorios completos.",
  "plan": {
    "operations": []
  }
}

FORMATO OBLIGATORIO:
Responde unicamente con JSON valido.
{
  "thinking": "Resumen breve del criterio usado. Maximo 2 frases.",
  "message": "Mensaje breve en espanol.",
  "plan": {
    "operations": []
  }
}`;

  const messages = history.length > 0
    ? history
    : [{ role: 'user', content: message || 'Hola' }];

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages
    });

    let rawContent = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) rawContent = jsonMatch[0];

      const parsed = JSON.parse(rawContent);
      const operations = sanitizeOperations(parsed.plan?.operations, knownDirectories);

      return {
        message: mergeMessageWithSummary(parsed.message, operations),
        plan: { operations }
      };
    } catch {
      console.error('Failed to parse LLM response as JSON:', rawContent);
      return {
        message: rawContent,
        plan: { operations: [] }
      };
    }
  } catch (error) {
    console.error('Error in Instruction Engine:', error);
    throw error;
  }
};
