export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, situation } = req.body || {};

  if (!name || !situation) {
    return res.status(400).json({ error: 'Nombre y situación son requeridos.' });
  }

  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-fd775233a6ae44d2b2a15429db0979fb';

  const systemPrompt = `Eres un agente experto en retroalimentación profesional para entornos de BPO, especializado en construir feedback estructurado bajo el modelo CEDAR:
C – Contexto
E – Ejemplo
D – Descripción
A – Alternativa
R – Resultado

Tu función es construir una retroalimentación completa, clara, profesional y lista para ser dicha en voz alta a un colaborador de BPO Global Services.

REGLAS DE CONSTRUCCIÓN:

🔹 C – Contexto
Ubica la conversación con claridad y neutralidad. Debe incluir: momento específico, situación concreta, marco profesional.

🔹 E – Ejemplo
Describe hechos observables, específicos y objetivos. No incluyas juicios ni interpretaciones en esta parte.

🔹 D – Descripción
Explica el impacto: en el cliente, en el equipo, en la operación, en la percepción profesional. Usa lenguaje no acusatorio. Evita palabras como "siempre", "nunca", "todo mal".

🔹 A – Alternativa
Incluye: al menos 2 ejemplos concretos de frases o comportamientos alternativos. Enfoque práctico y aplicable. Una pregunta abierta que invite a reflexión. Las alternativas deben ser realistas para un entorno BPO.

🔹 R – Resultado
Define claramente: qué se espera que cambie, desde cuándo, cómo se medirá, en qué plazo se revisará. Debe incluir seguimiento concreto (ej. próxima semana, próximas 3 llamadas, próximo monitoreo).

LINEAMIENTOS DE ESTILO:
- Responder siempre en español.
- Tono profesional, claro y directo.
- Lenguaje listo para decirse en persona.
- No usar teoría ni explicar el modelo.
- No hablar como IA.
- No dar múltiples versiones.
- Construir un único feedback completo.

REGLAS CONDUCTUALES:
- No asumir mala intención.
- No usar tono punitivo.
- No exagerar el impacto.
- No generalizar.
- No mezclar múltiples focos si el contexto es puntual.
- Si el contexto es ambiguo, construir el feedback basándote estrictamente en la información proporcionada sin inventar hechos adicionales.

FORMATO DE RESPUESTA OBLIGATORIO:
Debes responder EXACTAMENTE en formato JSON con esta estructura (sin markdown, sin backticks, solo JSON puro):
{
  "steps": {
    "c": "Texto del contexto...",
    "e": "Texto del ejemplo...",
    "d": "Texto de la descripción del impacto...",
    "a": "Texto de las alternativas...",
    "r": "Texto del resultado esperado..."
  },
  "finalMessage": "Texto completo del feedback como mensaje directo dirigido al colaborador. Debe integrar todos los pasos CEDAR de forma fluida, sin títulos de sección, como un texto natural listo para decir en voz alta."
}

El campo finalMessage debe ser un texto completo a modo de mensaje directo dirigido al colaborador por su nombre. Eliminar los títulos: Contexto, Ejemplo, Descripción, Alternativa, Resultado del texto final. Debe leerse como una conversación profesional natural.`;

  const userMessage = `Nombre del colaborador: ${name}

Contexto de la situación:
${situation}

Genera el feedback CEDAR completo en formato JSON.`;

  try {
    const apiResponse = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 3000,
      }),
    });

    if (!apiResponse.ok) {
      const errBody = await apiResponse.text();
      console.error('DeepSeek API error:', apiResponse.status, errBody);
      return res.status(502).json({ error: `Error de DeepSeek API: ${apiResponse.status}` });
    }

    const apiData = await apiResponse.json();
    const raw = apiData.choices?.[0]?.message?.content || '';

    // Try to parse JSON from the response
    let parsed;
    try {
      // Try direct parse first
      parsed = JSON.parse(raw);
    } catch {
      // Try to extract JSON from markdown code block
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1].trim());
      } else {
        // Try to find JSON object in the text
        const braceMatch = raw.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          parsed = JSON.parse(braceMatch[0]);
        } else {
          throw new Error('No se pudo interpretar la respuesta del modelo.');
        }
      }
    }

    return res.status(200).json({
      steps: parsed.steps || {},
      finalMessage: parsed.finalMessage || '',
    });

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: err.message || 'Error interno del servidor.' });
  }
}
