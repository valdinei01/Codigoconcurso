// Código do Concurso — servidor de IA (Vercel Serverless Function)
// Usa o Gemini com "Grounding with Google Search" para achar editais e concursos atuais.
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   GEMINI_API_KEY   (obrigatória)  chave do Google AI Studio
//   GEMINI_MODEL     (opcional)     padrão: gemini-3.6-flash
//   FIREBASE_API_KEY (opcional)     se definida, só usuários logados com Google podem usar a IA

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const cache = new Map(); // cache simples por instância
const CACHE_MS = 6 * 60 * 60 * 1000;

function hoje() {
  return new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

async function gemini(prompt, { search = false, json = false } = {}) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: search ? 1.0 : 0.7 }
  };
  if (search) body.tools = [{ google_search: {} }];
  if (json) body.generationConfig.responseMimeType = 'application/json';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify(body)
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || 'Erro na IA');
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).map(p => p.text || '').join('');
  const fontes = (cand?.groundingMetadata?.groundingChunks || [])
    .map(c => c.web).filter(Boolean)
    .map(w => ({ title: w.title, uri: w.uri }))
    .filter((f, i, a) => a.findIndex(x => x.uri === f.uri) === i)
    .slice(0, 8);
  return { obj: parseJSON(text), fontes };
}

function parseJSON(text) {
  const t = text.replace(/```json|```/g, '');
  const s = Math.min(...['{', '['].map(c => { const i = t.indexOf(c); return i < 0 ? Infinity : i; }));
  const e = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (s === Infinity || e < s) throw new Error('A IA não retornou dados válidos. Tente de novo.');
  return JSON.parse(t.slice(s, e + 1));
}

const SCHEMA_CONCURSO = `{
 "encontrado": true,
 "nome": "nome curto do concurso e cargo",
 "orgao": "", "cargo": "", "outros_cargos": [""], "uf": "XX",
 "status": "inscricoes_abertas | edital_publicado | previsto | encerrado | sem_previsao",
 "banca": "", "vagas": "", "salario": "", "taxa": "", "escolaridade": "",
 "inscricoes_inicio": "AAAA-MM-DD ou null", "inscricoes_fim": "AAAA-MM-DD ou null", "data_prova": "AAAA-MM-DD ou null",
 "link_edital": "URL do edital ou da página oficial", "edital_referencia": "ex.: Edital 001/2026, ou 'último edital (2022)'",
 "nota_minima": "regra de aprovação da prova objetiva, em uma frase",
 "nota_corte_percentual": 0,
 "materias": [{"nome": "", "questoes": 0, "pontos_por_questao": 1,
   "assuntos": ["4 a 12 itens curtos do conteúdo programático, do mais cobrado ao menos cobrado"]}],
 "dicas_banca": ["3 dicas curtas sobre como essa banca cobra"],
 "observacoes": "avisos importantes, ex.: dados do edital anterior"
}`;

async function buscarConcurso({ query, uf }) {
  const prompt = `Você é especialista em concursos públicos no Brasil. Hoje é ${hoje()}.
Pesquise na internet informações ATUAIS sobre o concurso: "${query}"${uf ? ` (estado: ${uf})` : ''}.
Priorize o edital oficial, o site da banca organizadora e notícias dos últimos 12 meses.
- Se houver edital publicado, extraia dele o quadro da prova objetiva (disciplinas, nº de questões e pontos por questão) e o conteúdo programático de cada disciplina.
- Se o edital ainda não saiu, use o último edital e marque status "previsto" ou "sem_previsao", explicando em "observacoes".
- Se houver vários cargos, escolha o cargo que melhor corresponde ao pedido (ou o principal de nível médio) e liste os outros em "outros_cargos".
- "nota_corte_percentual": nota mínima ou de corte do último concurso em % do total de pontos; se não achar, use null.
- Se não encontrar nada, retorne {"encontrado": false, "observacoes": "motivo"}.
Responda SOMENTE com JSON válido, sem texto fora do JSON, neste formato:
${SCHEMA_CONCURSO}`;
  const { obj, fontes } = await gemini(prompt, { search: true });
  return { ...obj, fontes };
}

async function concursosAbertos({ uf, area }) {
  const prompt = `Você é especialista em concursos públicos no Brasil. Hoje é ${hoje()}.
Pesquise na internet concursos públicos com INSCRIÇÕES ABERTAS ou EDITAL PUBLICADO recentemente${uf ? ` no estado ${uf}` : ' no Brasil'}${area ? `, na área: ${area}` : ''}.
Inclua concursos municipais, estaduais e federais com vagas ${uf ? 'nesse estado' : ''}. Depois dos abertos, inclua até 5 previstos relevantes.
Confira as datas: não liste como aberto um concurso cujas inscrições já terminaram.
Responda SOMENTE com JSON válido:
{"concursos":[{"nome":"","orgao":"","cargos":"","banca":"","vagas":"","salario":"","status":"inscricoes_abertas | edital_publicado | previsto","inscricoes_fim":"AAAA-MM-DD ou null","data_prova":"AAAA-MM-DD ou null"}]}
No máximo 15 itens, abertos primeiro, ordenados pelo fim das inscrições.`;
  const { obj, fontes } = await gemini(prompt, { search: true });
  return { concursos: obj.concursos || [], fontes };
}

async function gerarQuestoes({ concurso, banca, materia, assuntos, n }) {
  n = Math.min(Math.max(+n || 5, 1), 15);
  const certoErrado = /cebraspe|cespe/i.test(banca || '');
  const prompt = `Você é professor de cursinho e elaborador de provas de concurso.
Crie ${n} questões INÉDITAS no estilo da banca ${banca || 'mais comum para esse concurso'}, para o concurso "${concurso}", matéria "${materia}".
Distribua as questões entre estes assuntos: ${(assuntos || []).join('; ')}.
${certoErrado ? 'Formato Certo/Errado: alternativas exatamente ["Certo","Errado"].' : 'Múltipla escolha com 4 ou 5 alternativas, como a banca costuma usar.'}
Nível de prova real, sem pegadinhas absurdas. Baseie-se na legislação e na norma vigentes.
Antes de responder, confira cada gabarito: deve existir exatamente UMA alternativa correta.
Responda SOMENTE com JSON:
{"questoes":[{"assunto":"um dos assuntos listados, escrito igual","enunciado":"","alternativas":["sem letra no início"],"correta":0,"explicacao":"1 a 3 frases, citando o artigo ou a regra"}]}
"correta" é o índice da alternativa certa, começando em 0.`;
  const { obj } = await gemini(prompt, { json: true });
  const qs = (obj.questoes || []).filter(q =>
    q && q.enunciado && Array.isArray(q.alternativas) && q.alternativas.length >= 2 &&
    Number.isInteger(q.correta) && q.correta >= 0 && q.correta < q.alternativas.length);
  return { questoes: qs };
}

async function verificarUsuario(req) {
  const key = process.env.FIREBASE_API_KEY;
  if (!key) return true;
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return false;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token })
  });
  return r.ok;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'Servidor sem GEMINI_API_KEY configurada.' });
  try {
    if (!(await verificarUsuario(req))) return res.status(401).json({ error: 'Entre com sua conta Google para usar a busca.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { action } = body;
    const handlers = { concurso: buscarConcurso, abertos: concursosAbertos, questoes: gerarQuestoes };
    if (!handlers[action]) return res.status(400).json({ error: 'Ação inválida.' });
    for (const k of ['query', 'uf', 'area', 'concurso', 'banca', 'materia']) {
      if (body[k] && String(body[k]).length > 200) return res.status(400).json({ error: 'Texto muito longo.' });
    }
    const ck = action !== 'questoes' ? JSON.stringify([action, body.query, body.uf, body.area]).toLowerCase() : null;
    if (ck && cache.has(ck) && Date.now() - cache.get(ck).t < CACHE_MS) return res.json(cache.get(ck).v);
    const v = await handlers[action](body);
    if (ck) cache.set(ck, { t: Date.now(), v });
    res.json(v);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro inesperado.' });
  }
};
